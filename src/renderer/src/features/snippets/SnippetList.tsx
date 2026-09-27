import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Copy,
  ExternalLink,
  FileText,
  Library,
  Pencil,
  Plus,
  SearchX,
  Star,
  Tag as TagIcon,
  Trash2,
  Undo2
} from 'lucide-react'
import type { SnippetSummary } from '@shared/types'
import { VIEWS } from '@shared/constants'
import { formatRelativeTime } from '@shared/utils'
import { cn } from '../../lib/utils'
import { Badge, Button } from '@/components/ui/primitives'
import { ContextMenu } from '@/components/ui/overlays'
import { EmptyState, FavoriteStar, LanguageIcon, TagChip } from '@/components/ui/bits'
import { SearchBar } from '../search/SearchBar'
import { useVirtualList, useScrollIntoView, copyText } from '../../hooks'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { api, errorHint, errorMessage } from '../../lib/api'
import { snippetToMarkdown } from '@shared/utils'
import { toast } from '../../stores/toast'
import { getLanguage } from '@shared/languages'
import firefly from '../../assets/firefly.png'

/**
 * Row heights are expressed as multiples of the interface font size, so the
 * virtualiser's fixed height tracks the zoom level instead of clipping content
 * when the user zooms in.
 */
const ROW_HEIGHT_REM = 5.4
const ROW_HEIGHT_COMPACT_REM = 4.1

export function SnippetListPane({ onNewSnippet }: { onNewSnippet: () => void }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(0)

  const view = useLibraryStore((state) => state.view)
  const tagId = useLibraryStore((state) => state.tagId)
  const collectionId = useLibraryStore((state) => state.collectionId)
  const query = useLibraryStore((state) => state.query)
  const items = useLibraryStore((state) => state.items)
  const total = useLibraryStore((state) => state.total)
  const loading = useLibraryStore((state) => state.listLoading)
  const selectedId = useLibraryStore((state) => state.selectedId)
  const tags = useLibraryStore((state) => state.tags)
  const collections = useLibraryStore((state) => state.collections)
  const select = useLibraryStore((state) => state.select)
  const loadMore = useLibraryStore((state) => state.loadMore)
  const emptyTrash = useLibraryStore((state) => state.emptyTrash)
  const compact = useSettingsStore((state) => state.settings.compactMode)
  const uiFontSize = useSettingsStore((state) => state.settings.uiFontSize)
  const openExport = useUiStore((state) => state.openExport)

  const itemHeight = Math.round(uiFontSize * (compact ? ROW_HEIGHT_COMPACT_REM : ROW_HEIGHT_REM))
  const { virtualItems, totalHeight } = useVirtualList(items, itemHeight, scrollRef)

  const selectedIndex = useMemo(() => items.findIndex((item) => item.id === selectedId), [items, selectedId])
  useScrollIntoView(scrollRef, selectedIndex >= 0 ? selectedIndex : null, itemHeight)

  useEffect(() => {
    if (selectedIndex >= 0) setCursor(selectedIndex)
  }, [selectedIndex])

  // Keep the focus cursor inside the current result set.
  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, items.length - 1)))
  }, [items.length])

  const title = useMemo(() => {
    if (view === 'tag') {
      const tag = tags.find((entry) => entry.id === tagId)
      return tag ? `#${tag.name}` : 'Tag'
    }
    if (view === 'collection') {
      const collection = collections.find((entry) => entry.id === collectionId)
      return collection ? collection.name : 'Collection'
    }
    return VIEWS.find((entry) => entry.id === view)?.label ?? 'All Snippets'
  }, [view, tagId, collectionId, tags, collections])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (items.length === 0) return
        const next = event.key === 'ArrowDown' ? Math.min(items.length - 1, cursor + 1) : Math.max(0, cursor - 1)
        setCursor(next)
        const target = items[next]
        if (target) void select(target.id)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const target = items[cursor]
        if (target) void select(target.id)
      }

      if (event.key === 'Home') {
        event.preventDefault()
        const first = items[0]
        if (first) {
          setCursor(0)
          void select(first.id)
        }
      }

      if (event.key === 'End') {
        event.preventDefault()
        const last = items[items.length - 1]
        if (last) {
          setCursor(items.length - 1)
          void select(last.id)
        }
      }
    },
    [cursor, items, select]
  )

  const onScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    if (element.scrollTop + element.clientHeight > element.scrollHeight - 600) void loadMore()
  }, [loadMore])

  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col border-r border-line bg-surface">
      <SearchBar />

      <header className="flex h-9 shrink-0 items-center gap-2 px-3">
        <h1 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h1>
        {view === 'trash' && total > 0 ? (
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => void emptyTrash()}>
            Empty Trash
          </Button>
        ) : (
          <span className="text-2xs tabular-nums text-subtle">
            {items.length < total ? `${items.length} / ${total}` : total}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        tabIndex={0}
        role="listbox"
        aria-label={`${title} results`}
        aria-activedescendant={selectedId ? `snippet-option-${selectedId}` : undefined}
        onKeyDown={handleKeyDown}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 outline-none"
      >
        {items.length === 0 ? (
          <ListEmptyState view={view} query={query} loading={loading} onNewSnippet={onNewSnippet} />
        ) : (
          <div style={{ height: totalHeight }} className="relative">
            {virtualItems.map(({ item, offset, index }) => (
              <div key={item.id} className="absolute inset-x-0" style={{ top: offset, height: itemHeight }}>
                <SnippetRow
                  snippet={item}
                  compact={compact}
                  selected={item.id === selectedId}
                  focused={index === cursor}
                  onSelect={() => void select(item.id)}
                  onExport={() => {
                    void select(item.id)
                    openExport([item.id])
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function SnippetRow({
  snippet,
  compact,
  selected,
  focused,
  onSelect,
  onExport
}: {
  snippet: SnippetSummary
  compact: boolean
  selected: boolean
  focused: boolean
  onSelect: () => void
  onExport: () => void
}): React.JSX.Element {
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite)
  const trashSelected = useLibraryStore((state) => state.trashSelected)
  const restoreSnippet = useLibraryStore((state) => state.restoreSnippet)
  const destroySnippet = useLibraryStore((state) => state.destroySnippet)
  const duplicateSelected = useLibraryStore((state) => state.duplicateSelected)
  const startEdit = useLibraryStore((state) => state.startEdit)
  const select = useLibraryStore((state) => state.select)
  const refresh = useLibraryStore((state) => state.refresh)
  const collections = useLibraryStore((state) => state.collections)

  const language = getLanguage(snippet.language)
  const secondary = snippet.description.trim() || snippet.codePreview || 'No description yet'
  const isTrashed = Boolean(snippet.deletedAt)

  const copyCode = async (): Promise<void> => {
    try {
      const detail = await api.snippets.get(snippet.id)
      if (!detail) return
      await copyText(detail.code, { snippetId: detail.id, toastTitle: 'Code copied to clipboard' })
    } catch (error) {
      toast.error('Code could not be copied', errorHint(error) ?? errorMessage(error))
    }
  }

  const copyMarkdown = async (): Promise<void> => {
    try {
      const detail = await api.snippets.get(snippet.id)
      if (!detail) return
      await copyText(snippetToMarkdown(detail), { toastTitle: 'Markdown copied to clipboard' })
    } catch (error) {
      toast.error('Markdown could not be copied', errorHint(error) ?? errorMessage(error))
    }
  }

  const moveToCollection = async (collectionId: string | null): Promise<void> => {
    try {
      await api.snippets.update(snippet.id, { collectionId })
      await refresh({ quiet: true })
    } catch (error) {
      toast.error('That snippet could not be moved', errorHint(error) ?? errorMessage(error))
    }
  }

  const openSource = (): void => {
    void api.snippets
      .get(snippet.id)
      .then((detail) => {
        if (detail?.sourceUrl) return api.system.openExternal(detail.sourceUrl)
        toast.info('This snippet has no source URL')
        return undefined
      })
      .catch(() => undefined)
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          id={`snippet-option-${snippet.id}`}
          role="option"
          aria-selected={selected}
          tabIndex={-1}
          onClick={onSelect}
          className={cn(
            'group relative flex h-full w-full cursor-default flex-col justify-center gap-1 rounded-lg px-2.5 py-2 transition-colors',
            selected ? 'bg-primary-soft' : focused ? 'bg-hover' : 'hover:bg-hover',
            selected && 'ring-1 ring-inset ring-primary-border'
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <LanguageIcon language={language} size="sm" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                snippet.favorite ? 'font-semibold text-fg' : 'font-medium text-fg'
              )}
            >
              {snippet.title}
            </span>
            {snippet.versionCount > 1 ? (
              <Badge tone="neutral" title={`${snippet.versionCount} versions`}>
                v{snippet.versionCount}
              </Badge>
            ) : null}
            {snippet.hasNotes ? <FileText aria-label="Has notes" className="size-3 shrink-0 text-subtle" /> : null}
            <FavoriteStar
              favorite={snippet.favorite}
              size="sm"
              onToggle={() => void toggleFavorite(snippet.id)}
            />
          </div>

          {compact ? null : (
            <p className="truncate pl-7 text-xs leading-snug text-muted">{secondary}</p>
          )}

          <div className="flex min-w-0 items-center gap-1.5 pl-7">
            {snippet.tags.slice(0, 2).map((tag) => (
              <TagChip key={tag.id} tag={tag} className="h-[1.1rem] px-1.5 text-2xs" />
            ))}
            {snippet.tags.length > 2 ? (
              <span className="text-2xs text-subtle">+{snippet.tags.length - 2}</span>
            ) : null}
            <span className="ml-auto shrink-0 text-2xs tabular-nums text-subtle">
              {snippet.copyCount > 0 ? `${snippet.copyCount}×` : ''}
            </span>
            <span className="shrink-0 text-2xs text-subtle">{formatRelativeTime(snippet.updatedAt)}</span>
          </div>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Content>
        <ContextMenu.Item onSelect={onSelect}>
          <BookOpen />
          Open
        </ContextMenu.Item>
        {!isTrashed ? (
          <>
            <ContextMenu.Item
              onSelect={() => {
                void select(snippet.id).then(() => startEdit())
              }}
            >
              <Pencil />
              Edit
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={() => void copyCode()}>
              <Copy />
              Copy Code
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => void copyMarkdown()}>
              <FileText />
              Copy Markdown
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={() => {
                void select(snippet.id).then(() => duplicateSelected())
              }}
            >
              <Plus />
              Duplicate
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={() => void toggleFavorite(snippet.id)}>
              <Star />
              {snippet.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            </ContextMenu.Item>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger>Move to Collection</ContextMenu.SubTrigger>
              <ContextMenu.SubContent>
                <ContextMenu.Item onSelect={() => void moveToCollection(null)}>No collection</ContextMenu.Item>
                <ContextMenu.Separator />
                {collections.map((collection) => (
                  <ContextMenu.Item key={collection.id} onSelect={() => void moveToCollection(collection.id)}>
                    {collection.name}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Sub>
            <ContextMenu.Item
              onSelect={() => {
                void select(snippet.id).then(() => startEdit())
              }}
            >
              <TagIcon />
              Edit tags…
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={onExport}>
              <ExternalLink />
              Export…
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              className="text-danger data-[highlighted]:text-danger"
              onSelect={() => {
                void select(snippet.id).then(() => trashSelected())
              }}
            >
              <Trash2 />
              Move to Trash
            </ContextMenu.Item>
          </>
        ) : (
          <>
            <ContextMenu.Item onSelect={() => void restoreSnippet(snippet.id)}>
              <Undo2 />
              Restore
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              className="text-danger data-[highlighted]:text-danger"
              onSelect={() => void destroySnippet(snippet.id)}
            >
              <Trash2 />
              Delete Permanently
            </ContextMenu.Item>
          </>
        )}
        <ContextMenu.Item onSelect={openSource}>
          <ExternalLink />
          Open Source
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  )
}

/* -------------------------------------------------------------------------- */

function ListEmptyState({
  view,
  query,
  loading,
  onNewSnippet
}: {
  view: string
  query: string
  loading: boolean
  onNewSnippet: () => void
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="space-y-2 px-1 pt-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-[4.3rem] animate-pulse rounded-lg bg-sunken" />
        ))}
      </div>
    )
  }

  if (query.trim()) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="No snippets found."
        description="Try a different keyword, tag, or language."
      />
    )
  }

  if (view === 'trash') {
    return <EmptyState icon={<Trash2 />} title="Trash is empty." compact />
  }

  if (view === 'favorites') {
    return (
      <EmptyState
        icon={<Star />}
        title="No favorites yet."
        description="Star snippets you use frequently to find them here."
      />
    )
  }

  if (view === 'tag' || view === 'collection') {
    return (
      <EmptyState
        icon={<Library />}
        title="Nothing here yet."
        description="Snippets you assign to this will show up here."
        action={
          <Button variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={onNewSnippet}>
            New Snippet
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      artwork={<BrandArtwork />}
      icon={<Library />}
      title="Your developer knowledge base starts here."
      description="Save the solutions you don't want to search for twice."
      action={
        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={onNewSnippet}>
          Create your first snippet
        </Button>
      }
    />
  )
}

/**
 * First-run illustration.
 *
 * The artwork is dark ink on a white sheet, so it is composited rather than
 * framed: multiply on the light theme drops the paper away, and the dark theme
 * inverts it to white lines and screens them in. Either way there is no visible
 * square of background against the panel.
 */
function BrandArtwork(): React.JSX.Element {
  return (
    <img
      src={firefly}
      alt=""
      aria-hidden
      draggable={false}
      className="w-[min(15rem,72%)] opacity-90 mix-blend-multiply dark:invert dark:mix-blend-screen"
    />
  )
}

export { ROW_HEIGHT_REM, ROW_HEIGHT_COMPACT_REM }
