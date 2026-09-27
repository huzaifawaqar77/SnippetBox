import { useCallback, useEffect, useRef, useState } from 'react'
import type { WindowKind } from '@shared/types'
import { clamp } from '@shared/utils'
import {
  BASE_UI_FONT_SIZE,
  LIST_MAX_WIDTH,
  LIST_MIN_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH
} from '@shared/constants'
import { api } from './lib/api'
import { cn } from './lib/utils'
import { Toaster } from './components/ui/toaster'
import { ConfirmDialogHost, TooltipProvider } from './components/ui/overlays'
import { Sidebar } from './components/layout/Sidebar'
import { SnippetListPane } from './features/snippets/SnippetList'
import { SnippetDetailPane } from './features/snippets/SnippetDetail'
import { SnippetEditorPane } from './features/snippets/SnippetEditor'
import { CommandPalette } from './features/search/CommandPalette'
import { SettingsDialog } from './features/settings/SettingsView'
import { AboutDialog, ShortcutsDialog } from './features/settings/InfoPages'
import { ImportDialog } from './features/transfer/ImportDialog'
import { ExportDialog } from './features/transfer/ExportDialog'
import { CollectionDialog, DuplicateWarningDialog, TagDialog } from './features/dialogs'
import { Onboarding } from './features/onboarding/Onboarding'
import { QuickCaptureApp } from './features/capture/QuickCapture'
import { LauncherApp } from './features/launcher/Launcher'
import { useAppCommands } from './hooks/useAppCommands'
import { useAppearance, useZoomRatio } from './hooks'
import { useLibraryStore } from './stores/library'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import { toast } from './stores/toast'

/** One bundle, three surfaces. */
export function AppRoot({ kind }: { kind: WindowKind }): React.JSX.Element {
  if (kind === 'capture') {
    return (
      <TooltipProvider>
        <WindowFrame>
          <QuickCaptureApp />
        </WindowFrame>
        <Toaster />
      </TooltipProvider>
    )
  }

  if (kind === 'launcher') {
    return (
      <TooltipProvider>
        <WindowFrame>
          <LauncherApp />
        </WindowFrame>
        <Toaster />
      </TooltipProvider>
    )
  }

  return <MainApp />
}

function WindowFrame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="h-full w-full overflow-hidden bg-surface">{children}</div>
}

function MainApp(): React.JSX.Element {
  useAppearance()
  useAppCommands()

  const loaded = useSettingsStore((state) => state.loaded)
  const loadSettings = useSettingsStore((state) => state.load)
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.update)

  const bootstrap = useLibraryStore((state) => state.bootstrap)
  const startCreate = useLibraryStore((state) => state.startCreate)
  const mode = useLibraryStore((state) => state.mode)

  const onboardingOpen = useUiStore((state) => state.onboardingOpen)
  const setOnboardingOpen = useUiStore((state) => state.setOnboardingOpen)
  const openImport = useUiStore((state) => state.openImport)

  const [liveSidebarWidth, setLiveSidebarWidth] = useState<number | null>(null)
  const bootstrapped = useRef(false)

  /* ------------------------------------------------------------ bootstrap */

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!loaded || bootstrapped.current) return
    if (!settings.onboardingComplete) {
      setOnboardingOpen(true)
      return
    }
    bootstrapped.current = true
    void bootstrap()
  }, [loaded, settings.onboardingComplete, bootstrap, setOnboardingOpen])

  /* --------------------------------------------------------------- events */

  useEffect(
    () =>
      api.events.onSettingsChanged((next) => {
        useSettingsStore.getState().apply(next)
      }),
    []
  )

  useEffect(
    () =>
      api.events.onDataChanged((payload) => {
        const library = useLibraryStore.getState()

        if (payload.scope === 'snippets' || payload.scope === 'collections' || payload.scope === 'tags') {
          void library.refresh({ quiet: true })
        }
        if (payload.scope === 'tags') void library.loadTags()
        if (payload.scope === 'collections') void library.loadCollections()
        if (payload.scope === 'settings') void loadSettings()

        // Keep an open snippet in sync with changes made elsewhere (for example
        // a version restore or a backup restore).
        if (payload.scope === 'snippets' && library.mode === 'view' && library.selectedId) {
          void library.refreshDetail()
        }
      }),
    [loadSettings]
  )

  /* ------------------------------------------------------- file drag & drop */

  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
    }

    const onDrop = (event: DragEvent): void => {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      if (event.defaultPrevented) return
      event.preventDefault()

      const paths = files.map((file) => api.system.getPathForFile(file)).filter(Boolean)
      if (paths.length === 0) return

      // Dropping a single code or text file pre-fills the editor — the user
      // confirms by saving. Anything else goes through the import preview.
      const isArchive = paths.length > 1 || paths.some((path) => /\.(json|zip)$/i.test(path))
      if (isArchive) {
        openImport(paths)
        return
      }

      void api.transfer
        .readDroppedFiles(paths)
        .then((preview) => {
          const candidate = preview.candidates[0]
          if (!candidate) {
            openImport(paths)
            return
          }
          startCreate({
            title: candidate.title,
            description: candidate.description,
            code: candidate.code,
            language: candidate.language,
            notes: candidate.notes,
            sourceUrl: candidate.sourceUrl,
            tagNames: candidate.tags
          })
          toast.info('Review and save', candidate.title)
        })
        .catch(() => openImport(paths))
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openImport, startCreate])

  /* ------------------------------------------------------------- resizing */

  // Panel widths are stored at 100% zoom and multiplied by the zoom ratio when
  // applied, so the three-pane layout stays proportional at every zoom level.
  const zoom = useZoomRatio()

  const beginResize = useCallback(
    (kind: 'sidebar' | 'list') => (event: React.MouseEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const ratio = useSettingsStore.getState().settings.uiFontSize / BASE_UI_FONT_SIZE
      const startWidth =
        kind === 'sidebar'
          ? useSettingsStore.getState().settings.sidebarWidth
          : useUiStore.getState().listWidth

      const isSidebar = kind === 'sidebar'
      const min = isSidebar ? SIDEBAR_MIN_WIDTH : LIST_MIN_WIDTH
      const max = isSidebar ? SIDEBAR_MAX_WIDTH : LIST_MAX_WIDTH

      let next = startWidth

      const onMove = (moveEvent: MouseEvent): void => {
        // Pointer deltas are in real pixels; the stored value is zoom-neutral.
        next = clamp(startWidth + (moveEvent.clientX - startX) / ratio, min, max)
        if (isSidebar) setLiveSidebarWidth(next)
        else useUiStore.getState().setListWidth(next)
      }

      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        setLiveSidebarWidth(null)
        if (isSidebar) void updateSettings({ sidebarWidth: Math.round(next) })
      }

      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [updateSettings]
  )

  const baseSidebarWidth =
    liveSidebarWidth ?? (settings.sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : settings.sidebarWidth)
  const sidebarWidth = Math.round(baseSidebarWidth * zoom)
  const listWidth = useUiStore((state) => state.listWidth)
  const listPaneWidth = Math.round(listWidth * zoom)

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 bg-surface text-fg">
        <div style={{ width: sidebarWidth }} className="shrink-0 overflow-hidden">
          <Sidebar
            onNewSnippet={() => startCreate()}
            onFocusSearch={() => document.getElementById('global-search-input')?.focus()}
          />
        </div>

        <Splitter onMouseDown={beginResize('sidebar')} disabled={settings.sidebarCollapsed} />

        <div style={{ width: listPaneWidth }} className="shrink-0 overflow-hidden">
          <SnippetListPane onNewSnippet={() => startCreate()} />
        </div>

        <Splitter onMouseDown={beginResize('list')} />

        <main
          tabIndex={-1}
          data-detail-pane
          className={cn('min-w-0 flex-1 overflow-hidden outline-none', mode === 'view' ? '' : 'bg-surface')}
        >
          {mode === 'view' ? <SnippetDetailPane /> : <SnippetEditorPane />}
        </main>
      </div>

      <CommandPalette />
      <SettingsDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <ImportDialog />
      <ExportDialog />
      <TagDialog />
      <CollectionDialog />
      <DuplicateWarningDialog />

      {onboardingOpen ? <Onboarding /> : null}

      <ConfirmDialogHost />
      <Toaster />
    </TooltipProvider>
  )
}

function Splitter({ onMouseDown, disabled }: { onMouseDown: (event: React.MouseEvent) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-hidden={disabled}
      onMouseDown={disabled ? undefined : onMouseDown}
      className={cn(
        'w-[3px] shrink-0 bg-transparent transition-colors',
        disabled ? 'cursor-default' : 'cursor-col-resize hover:bg-primary/30 active:bg-primary/50'
      )}
    />
  )
}
