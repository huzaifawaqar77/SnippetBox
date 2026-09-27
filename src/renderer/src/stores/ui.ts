import { create } from 'zustand'
import type { Collection, SimilarSnippet, Tag } from '@shared/types'
import { LIST_DEFAULT_WIDTH, LIST_MAX_WIDTH, LIST_MIN_WIDTH } from '@shared/constants'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  details?: string
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void
}

interface DuplicateWarning {
  candidates: SimilarSnippet[]
  onViewExisting: (id: string) => void
  onProceed: () => void
  onCancel: () => void
}

interface UiState {
  listWidth: number
  settingsOpen: boolean
  shortcutsOpen: boolean
  aboutOpen: boolean
  commandPaletteOpen: boolean
  importTarget: { paths: string[] | null } | null
  exportTarget: { ids: string[] | null } | null
  onboardingOpen: boolean
  tagDialog: { tag: Tag | null } | null
  collectionDialog: { collection: Collection | null } | null
  confirmRequest: ConfirmRequest | null
  duplicateWarning: DuplicateWarning | null

  setListWidth: (width: number) => void

  openSettings: () => void
  closeSettings: () => void
  openShortcuts: () => void
  closeShortcuts: () => void
  openAbout: () => void
  closeAbout: () => void
  setCommandPaletteOpen: (open: boolean) => void
  openImport: (paths?: string[] | null) => void
  closeImport: () => void
  openExport: (ids?: string[] | null) => void
  closeExport: () => void
  setOnboardingOpen: (open: boolean) => void
  openTagDialog: (tag?: Tag | null) => void
  closeTagDialog: () => void
  openCollectionDialog: (collection?: Collection | null) => void
  closeCollectionDialog: () => void

  /** Promise-based confirmation, so callers read as `if (!(await confirm(...))) return`. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  resolveConfirm: (value: boolean) => void

  showDuplicateWarning: (warning: Omit<DuplicateWarning, 'onCancel'>) => void
  hideDuplicateWarning: () => void

  closeAllOverlays: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  listWidth: LIST_DEFAULT_WIDTH,
  settingsOpen: false,
  shortcutsOpen: false,
  aboutOpen: false,
  commandPaletteOpen: false,
  importTarget: null,
  exportTarget: null,
  onboardingOpen: false,
  tagDialog: null,
  collectionDialog: null,
  confirmRequest: null,
  duplicateWarning: null,

  setListWidth: (width) =>
    set({ listWidth: Math.min(LIST_MAX_WIDTH, Math.max(LIST_MIN_WIDTH, Math.round(width))) }),

  openSettings: () => set({ settingsOpen: true, shortcutsOpen: false, aboutOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true, settingsOpen: false, aboutOpen: false }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  openAbout: () => set({ aboutOpen: true, settingsOpen: false, shortcutsOpen: false }),
  closeAbout: () => set({ aboutOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  openImport: (paths = null) => set({ importTarget: { paths } }),
  closeImport: () => set({ importTarget: null }),
  openExport: (ids = null) => set({ exportTarget: { ids } }),
  closeExport: () => set({ exportTarget: null }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  openTagDialog: (tag = null) => set({ tagDialog: { tag } }),
  closeTagDialog: () => set({ tagDialog: null }),
  openCollectionDialog: (collection = null) => set({ collectionDialog: { collection } }),
  closeCollectionDialog: () => set({ collectionDialog: null }),

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      // Answering a previous prompt with "no" avoids a dangling promise.
      get().confirmRequest?.resolve(false)
      set({ confirmRequest: { ...options, resolve } })
    }),

  resolveConfirm: (value) => {
    const request = get().confirmRequest
    set({ confirmRequest: null })
    request?.resolve(value)
  },

  showDuplicateWarning: (warning) =>
    set({
      duplicateWarning: {
        ...warning,
        onCancel: () => set({ duplicateWarning: null })
      }
    }),

  hideDuplicateWarning: () => set({ duplicateWarning: null }),

  closeAllOverlays: () =>
    set({
      settingsOpen: false,
      shortcutsOpen: false,
      aboutOpen: false,
      commandPaletteOpen: false,
      importTarget: null,
      exportTarget: null,
      tagDialog: null,
      collectionDialog: null
    })
}))

/** Imperative helpers for non-React callers (keyboard handlers, stores). */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  useUiStore.getState().confirm(options)
