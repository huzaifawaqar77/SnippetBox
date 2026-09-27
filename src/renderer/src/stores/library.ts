import { create } from 'zustand'
import type {
  Collection,
  SnippetCreateInput,
  SnippetDetail,
  SnippetListOptions,
  SnippetSummary,
  SnippetUpdateInput,
  SnippetVersion,
  SortKey,
  Tag,
  ViewId
} from '@shared/types'
import { DEFAULT_SORT, SEARCH_DEBOUNCE_MS, AUTOSAVE_DEBOUNCE_MS } from '@shared/constants'
import { emptyParsedQuery } from '@shared/search'
import { api, errorHint, errorMessage, isNotFound } from '../lib/api'
import { toast } from './toast'
import { confirmDialog, useUiStore } from './ui'

const PAGE_SIZE = 300

export type EditorMode = 'view' | 'create' | 'edit'

interface LibraryState {
  view: ViewId
  tagId: string | null
  collectionId: string | null
  query: string
  sort: SortKey

  items: SnippetSummary[]
  total: number
  parsed: ReturnType<typeof emptyParsedQuery>
  listLoading: boolean
  listError: string | null

  selectedId: string | null
  detail: SnippetDetail | null
  detailLoading: boolean

  mode: EditorMode
  draft: SnippetCreateInput | null
  dirty: boolean
  saving: boolean
  savedAt: string | null
  saveError: string | null

  versions: SnippetVersion[]
  versionsLoading: boolean

  tags: Tag[]
  collections: Collection[]

  bootstrap: () => Promise<void>
  loadTags: () => Promise<void>
  loadCollections: () => Promise<void>

  setView: (view: ViewId, scope?: { tagId?: string | null; collectionId?: string | null }) => void
  setQuery: (query: string) => void
  setSort: (sort: SortKey) => void
  refresh: (options?: { quiet?: boolean }) => Promise<void>
  loadMore: () => Promise<void>
  select: (id: string | null) => Promise<void>
  refreshDetail: () => Promise<void>

  startCreate: (seed?: Partial<SnippetCreateInput>) => void
  startEdit: () => void
  updateDraft: (patch: Partial<SnippetCreateInput>) => void
  cancelEditor: () => Promise<void>
  saveDraft: (options?: { force?: boolean }) => Promise<void>

  toggleFavorite: (id?: string) => Promise<void>
  duplicateSelected: () => Promise<void>
  trashSelected: () => Promise<void>
  restoreSnippet: (id: string) => Promise<void>
  destroySnippet: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>

  setRelated: (ids: string[]) => Promise<void>
  loadVersions: () => Promise<void>
  restoreVersion: (versionId: string) => Promise<void>
  saveVersionSnapshot: () => Promise<void>
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let versionCapturedForSession = false
let duplicateAcknowledged = false

function draftFromDetail(detail: SnippetDetail): SnippetCreateInput {
  return {
    title: detail.title,
    description: detail.description,
    code: detail.code,
    language: detail.language,
    notes: detail.notes,
    collectionId: detail.collectionId,
    sourceUrl: detail.sourceUrl,
    sourceName: detail.sourceName,
    sourceAuthor: detail.sourceAuthor,
    sourceFoundAt: detail.sourceFoundAt,
    favorite: detail.favorite,
    tagNames: detail.tags.map((tag) => tag.name),
    relatedIds: detail.relatedIds
  }
}

function draftHasContent(draft: SnippetCreateInput | null): boolean {
  if (!draft) return false
  return Boolean(
    draft.title.trim() ||
      (draft.description ?? '').trim() ||
      (draft.code ?? '').trim() ||
      (draft.notes ?? '').trim() ||
      (draft.tagNames?.length ?? 0) > 0
  )
}

function patchFromDraft(draft: SnippetCreateInput): SnippetUpdateInput {
  return {
    title: draft.title,
    description: draft.description ?? '',
    code: draft.code ?? '',
    language: draft.language ?? 'plaintext',
    notes: draft.notes ?? '',
    collectionId: draft.collectionId ?? null,
    sourceUrl: draft.sourceUrl ?? '',
    sourceName: draft.sourceName ?? '',
    sourceAuthor: draft.sourceAuthor ?? '',
    tagNames: draft.tagNames ?? [],
    relatedIds: draft.relatedIds ?? []
  }
}

function draftDiffersFromDetail(draft: SnippetCreateInput, detail: SnippetDetail): boolean {
  const tags = [...(draft.tagNames ?? [])].sort().join('\u0000')
  const detailTags = detail.tags.map((tag) => tag.name).sort().join('\u0000')

  return (
    draft.title !== detail.title ||
    (draft.description ?? '') !== detail.description ||
    (draft.code ?? '') !== detail.code ||
    (draft.notes ?? '') !== detail.notes ||
    (draft.language ?? 'plaintext') !== detail.language ||
    (draft.collectionId ?? null) !== detail.collectionId ||
    (draft.sourceUrl ?? '') !== detail.sourceUrl ||
    (draft.sourceName ?? '') !== detail.sourceName ||
    (draft.sourceAuthor ?? '') !== detail.sourceAuthor ||
    tags !== detailTags
  )
}

function listOptions(state: LibraryState, offset = 0): SnippetListOptions {
  return {
    view: state.view,
    query: state.query,
    sort: state.sort,
    limit: PAGE_SIZE,
    offset,
    ...(state.view === 'tag' && state.tagId ? { tagIds: [state.tagId] } : {}),
    ...(state.view === 'collection' && state.collectionId ? { collectionId: state.collectionId } : {})
  }
}

/**
 * The library is the single source of truth for what the three panes show.
 * Every mutation goes through the main process and then re-reads, so the UI can
 * never drift from the database.
 */
export const useLibraryStore = create<LibraryState>((set, get) => ({
  view: 'all',
  tagId: null,
  collectionId: null,
  query: '',
  sort: DEFAULT_SORT.all,

  items: [],
  total: 0,
  parsed: emptyParsedQuery(),
  listLoading: false,
  listError: null,

  selectedId: null,
  detail: null,
  detailLoading: false,

  mode: 'view',
  draft: null,
  dirty: false,
  saving: false,
  savedAt: null,
  saveError: null,

  versions: [],
  versionsLoading: false,

  tags: [],
  collections: [],

  bootstrap: async () => {
    const [session] = await Promise.all([api.system.session(), get().loadTags(), get().loadCollections()])

    const sort = session.lastView === 'all' ? DEFAULT_SORT.all : (DEFAULT_SORT[session.lastView] ?? 'updated')
    set({
      view: session.lastView,
      tagId: session.lastTagId,
      collectionId: session.lastCollectionId,
      sort
    })

    await get().refresh({ quiet: true })

    // Only restore the previous snippet when the user asked us to.
    if (session.lastSnippetId) {
      const known = get().items.some((item) => item.id === session.lastSnippetId)
      if (known) await get().select(session.lastSnippetId)
    }
  },

  loadTags: async () => {
    try {
      set({ tags: await api.tags.list() })
    } catch (error) {
      toast.error('Tags could not be loaded', errorHint(error) ?? errorMessage(error))
    }
  },

  loadCollections: async () => {
    try {
      set({ collections: await api.collections.list() })
    } catch (error) {
      toast.error('Collections could not be loaded', errorHint(error) ?? errorMessage(error))
    }
  },

  setView: (view, scope) => {
    const tagId = view === 'tag' ? (scope?.tagId ?? get().tagId) : null
    const collectionId = view === 'collection' ? (scope?.collectionId ?? get().collectionId) : null

    set({
      view,
      tagId,
      collectionId,
      sort: DEFAULT_SORT[view] ?? 'updated',
      mode: 'view',
      draft: null
    })

    void api.system.updateSession({ lastView: view, lastTagId: tagId, lastCollectionId: collectionId })
    void get().refresh()
  },

  setQuery: (query) => {
    set({ query })
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void get().refresh()
    }, SEARCH_DEBOUNCE_MS)
  },

  setSort: (sort) => {
    set({ sort })
    void get().refresh()
  },

  refresh: async (options = {}) => {
    if (!options.quiet) set({ listLoading: true })

    try {
      const result = await api.snippets.list(listOptions(get(), 0))
      set({
        items: result.items,
        total: result.total,
        parsed: result.parsed,
        listLoading: false,
        listError: null
      })
    } catch (error) {
      set({ listLoading: false, listError: errorMessage(error) })
      if (!options.quiet) toast.error('Snippets could not be loaded', errorHint(error) ?? errorMessage(error))
    }
  },

  loadMore: async () => {
    const state = get()
    if (state.listLoading || state.items.length >= state.total) return

    try {
      const result = await api.snippets.list(listOptions(state, state.items.length))
      const seen = new Set(state.items.map((item) => item.id))
      set({
        items: [...state.items, ...result.items.filter((item) => !seen.has(item.id))],
        total: result.total
      })
    } catch {
      /* paging failures leave the current page intact */
    }
  },

  select: async (id) => {
    if (id === null) {
      set({ selectedId: null, detail: null, mode: 'view', draft: null, versions: [] })
      return
    }

    if (get().mode !== 'view') {
      await get().cancelEditor()
    }

    set({ selectedId: id, detailLoading: true, mode: 'view', draft: null, versions: [], saveError: null })

    try {
      const detail = await api.snippets.get(id)
      set({ detail, detailLoading: false })

      if (detail) {
        void api.snippets.recordOpen(id).catch(() => undefined)
        void api.system.updateSession({ lastSnippetId: id })
        void api.system.setWindowTitle(`${detail.title} — SnippetBox`).catch(() => undefined)

        // Reflect the open in the list so "Recently Viewed" stays honest.
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, openCount: item.openCount + 1, lastOpenedAt: new Date().toISOString() }
              : item
          )
        }))
      }
    } catch (error) {
      set({ detailLoading: false, detail: null })
      if (!isNotFound(error)) toast.error('That snippet could not be opened', errorHint(error) ?? errorMessage(error))
    }
  },

  refreshDetail: async () => {
    const id = get().selectedId
    if (!id) return
    try {
      const detail = await api.snippets.get(id)
      set({ detail })
    } catch (error) {
      if (isNotFound(error)) {
        set({ selectedId: null, detail: null })
        await get().refresh({ quiet: true })
      }
    }
  },

  startCreate: (seed) => {
    versionCapturedForSession = false
    duplicateAcknowledged = false
    set({
      mode: 'create',
      draft: {
        title: '',
        description: '',
        code: '',
        language: 'plaintext',
        notes: '',
        collectionId: get().view === 'collection' ? get().collectionId : null,
        sourceUrl: '',
        sourceName: '',
        sourceAuthor: '',
        tagNames: [],
        relatedIds: [],
        ...seed
      },
      dirty: false,
      saveError: null,
      savedAt: null
    })
  },

  startEdit: () => {
    const detail = get().detail
    if (!detail) return
    versionCapturedForSession = false
    set({ mode: 'edit', draft: draftFromDetail(detail), dirty: false, saveError: null })
  },

  updateDraft: (patch) => {
    const { draft, mode } = get()
    if (!draft) return

    set({ draft: { ...draft, ...patch }, dirty: true, saveError: null })

    if (mode !== 'edit') return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void get().saveDraft()
    }, AUTOSAVE_DEBOUNCE_MS)
  },

  cancelEditor: async () => {
    const { mode, draft, detail } = get()

    if (mode === 'create' && draftHasContent(draft)) {
      const confirmed = await confirmDialog({
        title: 'Discard this draft?',
        description: 'The snippet you started has not been saved yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true
      })
      if (!confirmed) return
    }

    if (mode === 'edit' && draft && detail && draftDiffersFromDetail(draft, detail)) {
      const confirmed = await confirmDialog({
        title: 'Discard your changes?',
        description: 'Edits are saved automatically, but the last few seconds may not have been written yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true
      })
      if (!confirmed) return
    }

    if (saveTimer) clearTimeout(saveTimer)
    set({ mode: 'view', draft: null, dirty: false, saveError: null })
  },

  saveDraft: async (options = {}) => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    const state = get()
    const { draft, mode, selectedId } = state
    if (!draft || mode === 'view') return

    if (mode === 'edit' && selectedId) {
      const detail = state.detail
      if (detail && !draftDiffersFromDetail(draft, detail)) {
        set({ dirty: false })
        return
      }

      set({ saving: true })

      try {
        const saved = await api.snippets.update(selectedId, {
          ...patchFromDraft(draft),
          // Capture the pre-edit state once per editing session.
          snapshot: !versionCapturedForSession
        })
        versionCapturedForSession = true

        set({
          detail: saved,
          saving: false,
          dirty: false,
          savedAt: new Date().toISOString(),
          saveError: null
        })

        if (state.versions.length > 0) void get().loadVersions()
        await get().refresh({ quiet: true })
      } catch (error) {
        set({ saving: false, saveError: errorMessage(error) })
        toast.error('Changes could not be saved', errorHint(error) ?? errorMessage(error))
      }
      return
    }

    if (mode === 'create') {
      const title = draft.title.trim()
      if (!title) {
        set({ saveError: 'A title is required.' })
        return
      }

      // Duplicate detection is advisory only — the user is never blocked.
      if (!duplicateAcknowledged && (draft.code ?? '').trim().length >= 30) {
        try {
          const candidates = await api.snippets.similar({ code: draft.code ?? '' })
          if (candidates.length > 0) {
            useUiStore.getState().showDuplicateWarning({
              candidates,
              onViewExisting: (id) => {
                useUiStore.getState().hideDuplicateWarning()
                void get().select(id)
              },
              onProceed: () => {
                duplicateAcknowledged = true
                useUiStore.getState().hideDuplicateWarning()
                void get().saveDraft({ force: true })
              }
            })
            return
          }
        } catch {
          /* duplicate detection is best effort */
        }
      }

      set({ saving: true })

      try {
        const created = await api.snippets.create({ ...draft, title })
        set({ saving: false, mode: 'view', draft: null, dirty: false, savedAt: new Date().toISOString() })

        await get().refresh({ quiet: true })
        await get().select(created.id)
        toast.success('Snippet saved', created.title)
      } catch (error) {
        set({ saving: false, saveError: errorMessage(error) })
        toast.error('That snippet could not be saved', errorHint(error) ?? errorMessage(error))
      }
    }

    void options
  },

  toggleFavorite: async (id) => {
    const targetId = id ?? get().selectedId
    if (!targetId) return

    const detail = get().detail
    const current = detail && detail.id === targetId ? detail.favorite : get().items.find((i) => i.id === targetId)?.favorite
    if (current === undefined) return

    try {
      const updated = await api.snippets.setFavorite(targetId, !current)
      set((state) => ({
        detail: state.detail?.id === targetId ? updated : state.detail,
        items: state.items.map((item) => (item.id === targetId ? { ...item, favorite: updated.favorite } : item))
      }))
      if (get().view === 'favorites') await get().refresh({ quiet: true })
    } catch (error) {
      toast.error('That snippet could not be updated', errorHint(error) ?? errorMessage(error))
    }
  },

  duplicateSelected: async () => {
    const id = get().selectedId
    if (!id) return
    try {
      const copy = await api.snippets.duplicate(id)
      await get().refresh({ quiet: true })
      await get().select(copy.id)
      toast.success('Snippet duplicated', copy.title)
    } catch (error) {
      toast.error('That snippet could not be duplicated', errorHint(error) ?? errorMessage(error))
    }
  },

  trashSelected: async () => {
    const { selectedId, detail } = get()
    if (!selectedId) return

    const confirmed = await confirmDialog({
      title: 'Move to Trash?',
      description: detail ? `“${detail.title}” will be moved to Trash. You can restore it later.` : undefined,
      confirmLabel: 'Move to Trash',
      destructive: true
    })
    if (!confirmed) return

    try {
      await api.snippets.trash(selectedId)
      set({ selectedId: null, detail: null, mode: 'view', draft: null })
      await get().refresh({ quiet: true })
      toast.info('Moved to Trash')
    } catch (error) {
      toast.error('That snippet could not be moved to Trash', errorHint(error) ?? errorMessage(error))
    }
  },

  restoreSnippet: async (id) => {
    try {
      await api.snippets.restore(id)
      await get().refresh({ quiet: true })
      toast.success('Snippet restored')
    } catch (error) {
      toast.error('That snippet could not be restored', errorHint(error) ?? errorMessage(error))
    }
  },

  destroySnippet: async (id) => {
    const confirmed = await confirmDialog({
      title: 'Delete permanently?',
      description: 'This cannot be undone. The snippet and its attachments will be removed.',
      confirmLabel: 'Delete permanently',
      destructive: true
    })
    if (!confirmed) return

    try {
      await api.snippets.destroy(id)
      if (get().selectedId === id) set({ selectedId: null, detail: null })
      await get().refresh({ quiet: true })
      toast.info('Snippet deleted permanently')
    } catch (error) {
      toast.error('That snippet could not be deleted', errorHint(error) ?? errorMessage(error))
    }
  },

  emptyTrash: async () => {
    const confirmed = await confirmDialog({
      title: 'Empty Trash?',
      description: `${get().total} snippet${get().total === 1 ? '' : 's'} will be deleted permanently. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      destructive: true
    })
    if (!confirmed) return

    try {
      const count = await api.snippets.emptyTrash()
      set({ selectedId: null, detail: null })
      await get().refresh({ quiet: true })
      toast.success('Trash emptied', `${count} snippet${count === 1 ? '' : 's'} removed`)
    } catch (error) {
      toast.error('Trash could not be emptied', errorHint(error) ?? errorMessage(error))
    }
  },

  setRelated: async (ids) => {
    const id = get().selectedId
    if (!id) return
    try {
      await api.snippets.setRelated(id, ids)
      await get().refreshDetail()
    } catch (error) {
      toast.error('Related snippets could not be saved', errorHint(error) ?? errorMessage(error))
    }
  },

  loadVersions: async () => {
    const id = get().selectedId
    if (!id) return
    set({ versionsLoading: true })
    try {
      const versions = await api.snippets.versions(id)
      set({ versions, versionsLoading: false })
    } catch (error) {
      set({ versionsLoading: false })
      toast.error('Version history could not be loaded', errorHint(error) ?? errorMessage(error))
    }
  },

  restoreVersion: async (versionId) => {
    const confirmed = await confirmDialog({
      title: 'Restore this version?',
      description: 'The current content is kept as a new version, so nothing is lost.',
      confirmLabel: 'Restore version'
    })
    if (!confirmed) return

    try {
      await api.snippets.restoreVersion(versionId)
      await get().refreshDetail()
      await get().loadVersions()
      await get().refresh({ quiet: true })
      toast.success('Version restored')
    } catch (error) {
      toast.error('That version could not be restored', errorHint(error) ?? errorMessage(error))
    }
  },

  saveVersionSnapshot: async () => {
    const id = get().selectedId
    if (!id) return
    try {
      await api.snippets.saveVersion(id)
      await get().loadVersions()
      toast.success('Version saved')
    } catch (error) {
      toast.error('Version could not be saved', errorHint(error) ?? errorMessage(error))
    }
  }
}))

export function resetLibraryTransients(): void {
  versionCapturedForSession = false
  duplicateAcknowledged = false
  if (saveTimer) clearTimeout(saveTimer)
  if (searchTimer) clearTimeout(searchTimer)
}
