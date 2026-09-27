import { Menu, Tray, app } from 'electron'
import { APP_NAME } from '@shared/constants'
import { log } from './utils'
import { createMainWindow, getMainWindow, openCaptureWindow, openLauncherWindow, sendCommand, trayIcon } from './windows'

let tray: Tray | null = null

/**
 * A tray icon is a convenience, never a requirement — on a Linux desktop without
 * an AppIndicator host, `new Tray()` throws and the app must carry on normally.
 */
export function createTray(): void {
  if (tray) return

  const image = trayIcon()
  if (!image) {
    log.warn('no tray icon available; continuing without a tray')
    return
  }

  try {
    tray = new Tray(image)
    tray.setToolTip(`${APP_NAME} — quick capture and search`)

    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Quick Capture',
          click: () => openCaptureWindow()
        },
        {
          label: 'Open SnippetBox',
          click: () => showMain()
        },
        {
          label: 'Search',
          click: () => {
            showMain()
            sendCommand({ type: 'focus-search' })
          }
        },
        {
          label: 'Global Search',
          click: () => openLauncherWindow()
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => app.quit()
        }
      ])
    )

    tray.on('click', () => {
      const window = getMainWindow()
      if (window && window.isVisible() && window.isFocused()) window.hide()
      else showMain()
    })
  } catch (error) {
    log.warn('system tray unavailable', error)
    tray = null
  }
}

function showMain(): void {
  const window = getMainWindow() ?? createMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
