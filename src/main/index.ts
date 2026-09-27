import { app, dialog, session, shell } from 'electron'
import { APP_NAME } from '@shared/constants'
import { EVENTS } from '@shared/ipc'
import { closeDatabase, openDatabase } from './db'
import { configureSessionStore } from './app-state'
import { registerIpc } from './ipc'
import { buildApplicationMenu } from './menu'
import { applyGlobalShortcuts, disposeGlobalShortcuts } from './shortcuts'
import { createTray, destroyTray } from './tray'
import { applyBackgroundToWindows, broadcast, createMainWindow, getMainWindow, markQuitting } from './windows'
import { runScheduledBackup } from './services/backup'
import {
  databaseFile,
  defaultBackupLocation,
  defaultConfigLocation,
  defaultDataLocation,
  ensureDir,
  prepareDirectories
} from './services/paths'
import { configureSettingsStore, ensureStorageDefaults, getSettings, onSettingsChanged } from './services/settings'
import { log, messageOf } from './utils'

/**
 * Content Security Policy.
 *
 * The renderer never loads remote code; everything is bundled. The development
 * server needs a slightly looser policy for Vite's HMR websocket and inline
 * React Refresh preamble, which is why the two differ.
 */
function contentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ]

  if (process.env.ELECTRON_RENDERER_URL) {
    directives.push("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    directives.push("connect-src 'self' ws: wss: http: https:")
  } else {
    directives.push("script-src 'self'")
    directives.push("connect-src 'self'")
  }

  return directives.join('; ')
}

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()]
      }
    })
  })

  // Nothing in SnippetBox needs camera, microphone, geolocation or notifications.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
}

function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

async function bootstrap(): Promise<void> {
  const configLocation = defaultConfigLocation()

  // The config directory has to exist before anything (including settings
  // themselves) can be written into it.
  ensureDir(configLocation)

  configureSessionStore(configLocation)
  configureSettingsStore(configLocation)

  const fallbackData = defaultDataLocation()
  const settings = ensureStorageDefaults(fallbackData, defaultBackupLocation(fallbackData))
  prepareDirectories(configLocation, settings.dataLocation, settings.backupLocation)

  openDatabase(databaseFile(settings.dataLocation))

  registerIpc()
  applyContentSecurityPolicy()
  hardenWebContents()
  buildApplicationMenu()
  createTray()
  applyGlobalShortcuts()
  createMainWindow()

  onSettingsChanged((next) => {
    // Every window must see the change — zoom, theme and code font included.
    broadcast(EVENTS.settingsChanged, next)

    applyBackgroundToWindows(next.theme)
    applyGlobalShortcuts()

    // "Start on system login" is a real OS integration, not just a stored flag.
    try {
      app.setLoginItemSettings({ openAtLogin: next.startOnLogin })
    } catch {
      /* some desktop environments do not support this */
    }
  })

  try {
    app.setLoginItemSettings({ openAtLogin: getSettings().startOnLogin })
  } catch {
    /* ignore */
  }

  // Scheduled backups run quietly in the background after the window is up.
  void runScheduledBackup(getSettings().autoBackup, {
    dataLocation: settings.dataLocation,
    backupLocation: settings.backupLocation
  })

  log.info(`${APP_NAME} ready — data in ${settings.dataLocation}`)
}

function installProcessGuards(): void {
  process.on('uncaughtException', (error) => {
    log.error('uncaught exception', error)
  })

  process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection', reason)
  })
}

function shutdown(): void {
  markQuitting()
  disposeGlobalShortcuts()
  destroyTray()
  closeDatabase()
}

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.setName(APP_NAME)

  app.on('second-instance', () => {
    const window = getMainWindow() ?? createMainWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  installProcessGuards()

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      // A failed startup must be explained, never a blank window.
      log.error('startup failed', error)
      dialog.showErrorBox(
        `${APP_NAME} could not start`,
        [
          messageOf(error),
          '',
          'Your snippets have not been changed.',
          'Try restarting SnippetBox. If this keeps happening, restore a backup from your data folder.'
        ].join('\n')
      )
      app.quit()
    })

  app.on('activate', () => {
    if (getMainWindow() === null) createMainWindow()
  })

  app.on('window-all-closed', () => {
    // Closing the window quits the app on Linux and Windows; macOS keeps it alive.
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    shutdown()
  })
}
