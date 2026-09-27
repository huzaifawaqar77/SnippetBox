import { useCallback, useEffect, useRef } from 'react'
import type { AppCommand, ViewId } from '@shared/types'
import { snippetToMarkdown } from '@shared/utils'
import { api } from '../lib/api'
import { focusSearch, isOverlayOpen, isTypingTarget } from '../lib/focus'
import { zoomReset, zoomStep } from '../lib/zoom'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'

/** Applies a command that arrived from the native menu, tray or palette. */
export async function runAppCommand(command: AppCommand): Promise<void> {
  const library = useLibraryStore.getState()
  const ui = useUiStore.getState()

  switch (command.type) {
    case 'new-snippet':
      library.startCreate(command.seed)
      return
    case 'quick-capture':
      await api.system.openCaptureWindow()
      return
    case 'focus-search':
      focusSearch()
      return
    case 'command-palette':
      ui.setCommandPaletteOpen(true)
      return
    case 'toggle-sidebar': {
      const { settings, update } = useSettingsStore.getState()
      await update({ sidebarCollapsed: !settings.sidebarCollapsed })
      return
    }
    case 'toggle-theme': {
      const { settings, update } = useSettingsStore.getState()
      const next = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light'
      await update({ theme: next })
      return
    }
    case 'zoom-in':
      await zoomStep(1)
      return
    case 'zoom-out':
      await zoomStep(-1)
      return
    case 'zoom-reset':
      await zoomReset()
      return
    case 'open-view':
      library.setView(command.view as ViewId)
      return
    case 'open-settings':
      ui.openSettings()
      return
    case 'open-shortcuts':
      ui.openShortcuts()
      return
    case 'open-about':
      ui.openAbout()
      return
    case 'toggle-favorite':
      await library.toggleFavorite()
      return
    case 'edit-snippet':
      if (library.detail) library.startEdit()
      return
    case 'duplicate-snippet':
      await library.duplicateSelected()
      return
    case 'copy-code':
      if (library.detail) {
        await api.system.writeClipboard(library.detail.code)
        await library.refreshDetail()
      }
      return
    case 'copy-markdown':
      if (library.detail) {
        await api.system.writeClipboard(snippetToMarkdown(library.detail))
      }
      return
    case 'trash-snippet':
      await library.trashSelected()
      return
    case 'import':
      ui.openImport(null)
      return
    case 'export':
      ui.openExport(null)
      return
    case 'create-backup':
      await api.backup.create()
      return
    case 'open-snippet':
      await library.select(command.id)
      return
    default:
      return
  }
}

/**
 * Bridges keyboard and menu commands into the stores.
 *
 * Menu accelerators already cover the shortcuts that must work while a code
 * editor has focus; this hook adds the contextual keys that cannot live in a
 * native menu (Delete, Ctrl+S, Ctrl+1/2) and consumes commands sent from the
 * main process.
 */
export function useAppCommands(): void {
  const commandHandler = useRef(runAppCommand)
  commandHandler.current = runAppCommand

  useEffect(() => {
    const unsubscribe = api.events.onCommand((command) => {
      void commandHandler.current(command)
    })
    return unsubscribe
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    const library = useLibraryStore.getState()
    const ui = useUiStore.getState()
    const modifier = event.ctrlKey || event.metaKey

    if (event.key === 'Escape') {
      if (isOverlayOpen()) return // Radix closes the topmost overlay itself.
      if (library.mode !== 'view') {
        event.preventDefault()
        void library.cancelEditor()
        return
      }
      if (ui.duplicateWarning) ui.hideDuplicateWarning()
      return
    }

    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (library.mode !== 'view') void library.saveDraft({ force: true })
      return
    }

    if (modifier && event.key === '1') {
      event.preventDefault()
      focusSearch()
      return
    }

    // Ctrl+= is owned by the native menu, so this only catches the shifted
    // forms people actually press (Ctrl+Shift+=, i.e. Ctrl and the + key).
    if (modifier && (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '0')) {
      event.preventDefault()
      if (event.key === '0') void zoomReset()
      else if (event.key === '-') void zoomStep(-1)
      else void zoomStep(1)
      return
    }

    if (modifier && event.key === '2') {
      event.preventDefault()
      document.querySelector<HTMLElement>('[data-detail-pane]')?.focus()
      return
    }

    // Single-key shortcuts must never fire while typing.
    if (isTypingTarget(event.target) || isOverlayOpen()) return

    if (event.key === 'Delete' && library.selectedId && library.mode === 'view') {
      event.preventDefault()
      void library.trashSelected()
      return
    }

    if (event.key === '/') {
      event.preventDefault()
      focusSearch()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])
}
