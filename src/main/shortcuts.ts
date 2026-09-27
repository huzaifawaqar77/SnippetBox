import { globalShortcut } from 'electron'
import { getSettings } from './services/settings'
import { log } from './utils'
import { openCaptureWindow, openLauncherWindow } from './windows'

/**
 * OS-level shortcuts that work while SnippetBox is in the background.
 *
 * Both are opt-in (settings default to off) because registering one takes the
 * combination away from every other application on the desktop.
 */

const registered = new Set<string>()

function register(accelerator: string, label: string, handler: () => void): void {
  if (!accelerator.trim()) return

  try {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) {
      registered.add(accelerator)
      log.debug(`global shortcut registered: ${accelerator} (${label})`)
    } else {
      log.warn(`global shortcut ${accelerator} is already taken by another application`)
    }
  } catch (error) {
    log.warn(`could not register global shortcut ${accelerator}`, error)
  }
}

export function applyGlobalShortcuts(): void {
  disposeGlobalShortcuts()
  const settings = getSettings()

  if (settings.globalQuickCapture) {
    register(settings.quickCaptureShortcut, 'quick capture', () => openCaptureWindow())
  }

  if (settings.globalSearch) {
    register(settings.globalSearchShortcut, 'global search', () => openLauncherWindow())
  }
}

export function disposeGlobalShortcuts(): void {
  for (const accelerator of registered) {
    try {
      globalShortcut.unregister(accelerator)
    } catch {
      /* already gone */
    }
  }
  registered.clear()
}

export function registeredShortcuts(): string[] {
  return [...registered]
}
