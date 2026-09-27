import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Menu, app, dialog, shell, type MenuItemConstructorOptions } from 'electron'
import { APP_NAME, SHORTCUTS } from '@shared/constants'
import type { AppCommand, ViewId } from '@shared/types'
import { log } from './utils'
import { getMainWindow, openCaptureWindow, openLauncherWindow, sendCommand, isQuitting } from './windows'

/**
 * The native application menu (section 55 of the product spec).
 *
 * Menu accelerators are the single source of truth for shortcuts that must work
 * even while a code editor has focus. Keys that are contextual rather than
 * global — Delete and Escape — deliberately have no accelerator here so the
 * renderer can decide what they mean in the current view.
 */
const NO_MENU_ACCELERATOR = new Set(['trash', 'close'])

function accelerator(id: string): string | undefined {
  if (NO_MENU_ACCELERATOR.has(id)) return undefined
  return SHORTCUTS.find((shortcut) => shortcut.id === id)?.accelerator
}

function send(command: AppCommand) {
  return (): void => sendCommand(command)
}

function viewItem(label: string, view: ViewId, accelId?: string): MenuItemConstructorOptions {
  return {
    label,
    ...(accelId && accelerator(accelId) ? { accelerator: accelerator(accelId) } : {}),
    click: send({ type: 'open-view', view })
  }
}

export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New Snippet',
        accelerator: accelerator('new-snippet'),
        click: send({ type: 'new-snippet' })
      },
      {
        label: 'Quick Capture',
        accelerator: accelerator('quick-capture'),
        click: () => openCaptureWindow()
      },
      { type: 'separator' },
      {
        label: 'Search',
        accelerator: accelerator('search'),
        click: send({ type: 'focus-search' })
      },
      {
        label: 'Command Palette',
        accelerator: accelerator('command-palette'),
        click: send({ type: 'command-palette' })
      },
      {
        label: 'Global Search Launcher',
        click: () => openLauncherWindow()
      },
      { type: 'separator' },
      {
        label: 'Import…',
        accelerator: accelerator('import'),
        click: send({ type: 'import' })
      },
      {
        label: 'Export…',
        accelerator: accelerator('export'),
        click: send({ type: 'export' })
      },
      { type: 'separator' },
      {
        label: 'Create Backup',
        click: send({ type: 'create-backup' })
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit', label: 'Quit SnippetBox' }
    ]
  })

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Find in view',
        accelerator: accelerator('find'),
        click: send({ type: 'focus-search' })
      },
      {
        label: 'Settings…',
        accelerator: accelerator('settings'),
        click: send({ type: 'open-settings' })
      }
    ]
  })

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Toggle Sidebar',
        accelerator: accelerator('toggle-sidebar'),
        click: send({ type: 'toggle-sidebar' })
      },
      {
        label: 'Toggle Light / Dark',
        accelerator: accelerator('toggle-theme'),
        click: send({ type: 'toggle-theme' })
      },
      { type: 'separator' },
      viewItem('All Snippets', 'all'),
      viewItem('Favorites', 'favorites'),
      viewItem('Recently Viewed', 'recent-opened'),
      viewItem('Most Used', 'most-used'),
      { type: 'separator' },
      // Custom zoom rather than the built-in roles: the level is stored in
      // settings, so it survives restarts and applies to every window.
      {
        label: 'Zoom In',
        accelerator: accelerator('zoom-in'),
        click: send({ type: 'zoom-in' })
      },
      {
        label: 'Zoom Out',
        accelerator: accelerator('zoom-out'),
        click: send({ type: 'zoom-out' })
      },
      {
        label: 'Reset Zoom',
        accelerator: accelerator('zoom-reset'),
        click: send({ type: 'zoom-reset' })
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'reload', visible: !!process.env.ELECTRON_RENDERER_URL },
      { role: 'toggleDevTools', visible: !!process.env.ELECTRON_RENDERER_URL }
    ]
  })

  template.push({
    label: 'Snippet',
    submenu: [
      {
        label: 'Edit Snippet',
        accelerator: accelerator('edit'),
        click: send({ type: 'edit-snippet' })
      },
      {
        label: 'Duplicate',
        accelerator: accelerator('duplicate'),
        click: send({ type: 'duplicate-snippet' })
      },
      {
        label: 'Toggle Favorite',
        accelerator: accelerator('toggle-favorite'),
        click: send({ type: 'toggle-favorite' })
      },
      { type: 'separator' },
      {
        label: 'Copy Code',
        accelerator: accelerator('copy-code'),
        click: send({ type: 'copy-code' })
      },
      {
        label: 'Copy as Markdown',
        accelerator: accelerator('copy-markdown'),
        click: send({ type: 'copy-markdown' })
      },
      { type: 'separator' },
      {
        label: 'Move to Trash',
        // No accelerator: Delete is contextual and must not be swallowed by the menu.
        click: send({ type: 'trash-snippet' })
      }
    ]
  })

  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'Keyboard Shortcuts',
        accelerator: accelerator('shortcuts'),
        click: send({ type: 'open-shortcuts' })
      },
      {
        label: 'Documentation',
        click: () => {
          const candidates = [
            join(process.resourcesPath ?? '', 'README.md'),
            join(process.cwd(), 'README.md')
          ]
          const found = candidates.find((candidate) => existsSync(candidate))
          if (found) {
            void shell.openPath(found).then((error) => {
              if (error) log.warn(`could not open documentation: ${error}`)
            })
          } else {
            void dialog.showMessageBox({
              type: 'info',
              title: `${APP_NAME} documentation`,
              message: 'Documentation is not bundled with this build.',
              detail: 'The full README is available in the project repository.'
            })
          }
        }
      },
      {
        label: `About ${APP_NAME}`,
        click: send({ type: 'open-about' })
      }
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function attachMenuToWindow(): void {
  const window = getMainWindow()
  if (!window) return
  void window
}

export function isQuittingApp(): boolean {
  return isQuitting() || app.isReady()
}
