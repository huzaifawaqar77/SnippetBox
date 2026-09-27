import { join } from 'node:path'
import { BrowserWindow, nativeImage, screen, shell } from 'electron'
import type { AppCommand, SnippetCreateInput, WindowKind } from '@shared/types'
import { EVENTS } from '@shared/ipc'
import { getSettings } from './services/settings'
import { readSession, updateSession } from './app-state'
import { log } from './utils'

const windows = new Map<WindowKind, BrowserWindow>()
const trusted = new Set<number>()

let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

/** Only windows this process created may call IPC handlers. */
export function isTrustedSender(webContentsId: number): boolean {
  return trusted.has(webContentsId)
}

export function getWindow(kind: WindowKind): BrowserWindow | null {
  const window = windows.get(kind)
  return window && !window.isDestroyed() ? window : null
}

export function getMainWindow(): BrowserWindow | null {
  return getWindow('main')
}

export function getFocusedWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  return getMainWindow()
}

export function appWindows(): BrowserWindow[] {
  return [...windows.values()].filter((window) => !window.isDestroyed())
}

export function broadcast(channel: string, payload: unknown): void {
  for (const window of appWindows()) window.webContents.send(channel, payload)
}

/** Routes a command from the menu, tray or a global shortcut to the main window. */
export function sendCommand(command: AppCommand): void {
  const target = getMainWindow()
  if (!target) return

  if (!target.isVisible()) target.show()
  if (target.isMinimized()) target.restore()
  target.focus()
  target.webContents.send(EVENTS.command, command)
}

function iconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(process.cwd(), 'build/icon.png')
  ]
  for (const candidate of candidates) {
    try {
      const image = nativeImage.createFromPath(candidate)
      if (!image.isEmpty()) return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return undefined
}

export function trayIcon(): Electron.NativeImage | null {
  const path = iconPath()
  if (!path) return null
  const image = nativeImage.createFromPath(path)
  return image.isEmpty() ? null : image.resize({ width: 18, height: 18 })
}

function backgroundFor(theme: string): string {
  if (theme === 'dark') return '#0B0F16'
  if (theme === 'light') return '#FFFFFF'
  // 'system' — the renderer repaints immediately; this only avoids a flash.
  return '#0B0F16'
}

interface WindowOptions {
  kind: WindowKind
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  frame?: boolean
  alwaysOnTop?: boolean
  resizable?: boolean
  center?: boolean
  skipTaskbar?: boolean
  bounds?: { x: number | null; y: number | null }
  maximized?: boolean
}

function loadRenderer(window: BrowserWindow, kind: WindowKind): void {
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void window.loadURL(`${devServer}/index.html?window=${kind}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { window: kind } })
  }
}

/**
 * Restores a saved position only when it still lands on a connected display —
 * otherwise a window could open off-screen after a monitor change.
 */
function visibleBounds(bounds: { x: number | null; y: number | null; width: number; height: number }): {
  x?: number
  y?: number
  width: number
  height: number
} {
  if (bounds.x === null || bounds.y === null) return { width: bounds.width, height: bounds.height }

  const area = screen.getAllDisplays().some((display) => {
    const work = display.workArea
    return (
      bounds.x! + bounds.width > work.x + 40 &&
      bounds.x! < work.x + work.width - 40 &&
      bounds.y! + 40 > work.y &&
      bounds.y! < work.y + work.height - 40
    )
  })

  return area
    ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    : { width: bounds.width, height: bounds.height }
}

function createWindow(options: WindowOptions): BrowserWindow {
  const settings = getSettings()
  const icon = iconPath()

  const window = new BrowserWindow({
    width: options.width,
    height: options.height,
    ...(options.minWidth ? { minWidth: options.minWidth } : {}),
    ...(options.minHeight ? { minHeight: options.minHeight } : {}),
    ...(options.bounds ? visibleBounds({ ...options.bounds, width: options.width, height: options.height }) : {}),
    ...(options.center ? { center: true } : {}),
    ...(icon ? { icon } : {}),
    frame: options.frame ?? true,
    resizable: options.resizable ?? true,
    alwaysOnTop: options.alwaysOnTop ?? false,
    skipTaskbar: options.skipTaskbar ?? false,
    show: false,
    autoHideMenuBar: options.kind !== 'main',
    backgroundColor: backgroundFor(settings.theme),
    title: 'SnippetBox',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security baseline — see section 49 of the product spec.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
      devTools: !!process.env.ELECTRON_RENDERER_URL
    }
  })

  trusted.add(window.webContents.id)
  window.webContents.on('destroyed', () => trusted.delete(window.webContents.id))

  // Never let the app become a browser: external links go to the OS handler.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  window.once('ready-to-show', () => {
    if (options.maximized) window.maximize()
    if (options.kind === 'main') {
      window.show()
    } else {
      window.show()
      window.focus()
    }
  })

  window.on('closed', () => {
    windows.delete(options.kind)
    if (options.kind === 'main' && !quitting) {
      // The main window closing is a normal quit on Linux.
      window.destroy()
    }
  })

  windows.set(options.kind, window)
  loadRenderer(window, options.kind)
  return window
}

let saveTimer: NodeJS.Timeout | null = null

function trackBounds(window: BrowserWindow): void {
  const persist = (): void => {
    if (window.isDestroyed()) return
    const maximized = window.isMaximized()
    const bounds = maximized ? window.getNormalBounds() : window.getBounds()
    updateSession({
      window: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized
      }
    })
  }

  const schedule = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 400)
  }

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('close', persist)
}

export function createMainWindow(): BrowserWindow {
  const existing = getMainWindow()
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }

  const session = readSession()

  const window = createWindow({
    kind: 'main',
    width: session.window.width,
    height: session.window.height,
    minWidth: 1024,
    minHeight: 640,
    bounds: { x: session.window.x, y: session.window.y },
    maximized: session.window.maximized
  })

  trackBounds(window)
  return window
}

export function openCaptureWindow(seed?: Partial<SnippetCreateInput>): BrowserWindow {
  const existing = getWindow('capture')
  if (existing) {
    existing.show()
    existing.focus()
    if (seed) existing.webContents.send(EVENTS.command, { type: 'new-snippet', seed })
    return existing
  }

  const window = createWindow({
    kind: 'capture',
    width: 620,
    height: 560,
    minWidth: 520,
    minHeight: 420,
    frame: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: false
  })

  window.once('ready-to-show', () => {
    if (seed) window.webContents.send(EVENTS.command, { type: 'new-snippet', seed })
  })

  window.on('blur', () => {
    // A capture window is transient: losing focus means the user moved on.
    if (!quitting && window.isVisible() && window.isAlwaysOnTop()) window.hide()
  })

  log.debug('capture window opened')
  return window
}

export function openLauncherWindow(): BrowserWindow {
  const existing = getWindow('launcher')
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }

  const window = createWindow({
    kind: 'launcher',
    width: 680,
    height: 460,
    frame: false,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    skipTaskbar: true
  })

  window.on('blur', () => {
    if (!quitting) window.hide()
  })

  return window
}

export function applyBackgroundToWindows(theme: string): void {
  const color = backgroundFor(theme)
  for (const window of appWindows()) window.setBackgroundColor(color)
}

export function closeWindowOfSender(webContentsId: number): void {
  for (const window of appWindows()) {
    if (window.webContents.id === webContentsId) {
      window.close()
      return
    }
  }
}

export function hideWindowOfSender(webContentsId: number): void {
  for (const window of appWindows()) {
    if (window.webContents.id === webContentsId) {
      window.hide()
      return
    }
  }
}
