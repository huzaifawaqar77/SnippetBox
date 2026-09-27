import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Copy as CopyIcon,
  ExternalLink,
  Eye,
  FolderOpen,
  History,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { SnippetDetail, SnippetSummary, SnippetVersion } from '@shared/types'
import { getLanguage } from '@shared/languages'
import { formatBytes, formatDateTime, formatRelativeTime, snippetToPlainText } from '@shared/utils'
import { cn } from '../../lib/utils'
import { Badge, Button, IconButton, Input, Separator, Spinner } from '@/components/ui/primitives'
import { Modal, Tip } from '@/components/ui/overlays'
import { EmptyState, LanguageIcon } from '@/components/ui/bits'
import { useLibraryStore } from '../../stores/library'
import { api, errorHint, errorMessage } from '../../lib/api'
import { toast } from '../../stores/toast'
import { copyText } from '../../hooks'

/* -------------------------------------------------------------------------- */
/*  Disclosure                                                                 */
/* -------------------------------------------------------------------------- */

export function Disclosure({
  title,
  icon,
  count,
  defaultOpen = false,
  children
}: {
  title: string
  icon: ReactNode
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center gap-2 bg-sunken/50 px-3 text-left transition-colors hover:bg-hover"
      >
        <span className="text-subtle">{icon}</span>
        <span className="text-xs font-medium text-fg-secondary">{title}</span>
        {count !== undefined && count > 0 ? <Badge tone="neutral">{count}</Badge> : null}
        <ChevronDown className={cn('ml-auto size-3.5 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="border-t border-line px-3 py-3">{children}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Related snippets                                                           */
/* -------------------------------------------------------------------------- */

export function RelatedPanel({ detail }: { detail: SnippetDetail }): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const select = useLibraryStore((state) => state.select)
  const setRelated = useLibraryStore((state) => state.setRelated)
  const items = useLibraryStore((state) => state.items)

  const related = useMemo(
    () => detail.relatedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean) as SnippetSummary[],
    [detail.relatedIds, items]
  )

  return (
    <div className="space-y-2">
      {related.length === 0 ? (
        <p className="text-xs text-subtle">
          Link this snippet to others so a solution and its follow-ups stay together.
        </p>
      ) : (
        <ul className="space-y-1">
          {related.map((snippet) => (
            <li key={snippet.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void select(snippet.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1.5 py-1 text-left transition-colors hover:bg-hover"
              >
                <LanguageIcon language={relatedLanguage(snippet.language)} size="sm" />
                <span className="min-w-0 flex-1 truncate text-xs text-fg-secondary">{snippet.title}</span>
              </button>
              <IconButton
                label="Remove relation"
                size="icon-sm"
                onClick={() => void setRelated(detail.relatedIds.filter((id) => id !== snippet.id))}
              >
                <X className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {detail.relatedIds.some((id) => !items.find((item) => item.id === id)) ? (
        <p className="text-2xs text-subtle">
          {detail.relatedIds.filter((id) => !items.find((item) => item.id === id)).length} related snippet(s) are not in
          the current view.
        </p>
      ) : null}

      <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setPickerOpen(true)}>
        Add related snippet
      </Button>

      <RelatedPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={[detail.id, ...detail.relatedIds]}
        onPick={(id) => {
          setPickerOpen(false)
          void setRelated([...detail.relatedIds, id])
        }}
      />
    </div>
  )
}

function relatedLanguage(languageId: string): ReturnType<typeof getLanguage> {
  return getLanguage(languageId)
}

function RelatedPicker({
  open,
  onOpenChange,
  excludeIds,
  onPick
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludeIds: string[]
  onPick: (id: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SnippetSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      return
    }

    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.snippets
        .list({ view: 'all', query, limit: 50 })
        .then((result) => {
          if (cancelled) return
          setResults(result.items.filter((item) => !excludeIds.includes(item.id)))
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 140)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add a related snippet"
      description="Relations are symmetric — the other snippet links back automatically."
      size="sm"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search snippets…"
            className="pl-8"
            aria-label="Search snippets to relate"
          />
        </div>

        {loading ? (
          <div className="grid place-items-center py-6">
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-xs text-subtle">No matching snippets.</p>
        ) : (
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {results.map((snippet) => (
              <li key={snippet.id}>
                <button
                  type="button"
                  onClick={() => onPick(snippet.id)}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-hover"
                >
                  <LanguageIcon language={relatedLanguage(snippet.language)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-fg">{snippet.title}</span>
                    {snippet.description ? (
                      <span className="block truncate text-2xs text-subtle">{snippet.description}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/*  Attachments                                                                */
/* -------------------------------------------------------------------------- */

export function AttachmentsPanel({ detail }: { detail: SnippetDetail }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const refreshDetail = useLibraryStore((state) => state.refreshDetail)

  const addFiles = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      const added = await api.attachments.add(detail.id, paths)
      await refreshDetail()
      toast.success(`Attached ${added.length} file${added.length === 1 ? '' : 's'}`)
    } catch (error) {
      toast.error('That file could not be attached', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const readDroppedFiles = (event: React.DragEvent): string[] =>
    Array.from(event.dataTransfer?.files ?? [])
      .map((file) => api.system.getPathForFile(file))
      .filter(Boolean)

  const pickAndAdd = async (): Promise<void> => {
    const paths = await api.attachments.pickFiles()
    await addFiles(paths)
  }

  return (
    <div
      className={cn(
        'space-y-2 rounded-md transition-colors',
        dragActive && 'bg-primary-soft/60 outline-dashed outline-1 outline-primary'
      )}
      onDragEnter={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDragActive(true)
      }}
      onDragOver={(event) => {
        // Claim the drop so the window-level handler does not import this file
        // as a new snippet instead of attaching it here.
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDragActive(false)
        void addFiles(readDroppedFiles(event))
      }}
    >
      {detail.attachments.length === 0 ? (
        <p className="text-xs text-subtle">
          Attachments are copied into SnippetBox, so your originals are never touched.
        </p>
      ) : (
        <ul className="space-y-1">
          {detail.attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-[6px] border border-line bg-surface px-2 py-1.5"
            >
              {attachment.mimeType.startsWith('image/') ? (
                <ImageIcon className="size-3.5 shrink-0 text-subtle" />
              ) : (
                <Paperclip className="size-3.5 shrink-0 text-subtle" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-fg" title={attachment.path}>
                  {attachment.filename}
                </span>
                <span className="block text-2xs text-subtle">
                  {formatBytes(attachment.size)}
                  {attachment.available ? '' : ' · missing from disk'}
                </span>
              </span>
              <Tip label="Open">
                <IconButton
                  label="Open attachment"
                  size="icon-sm"
                  disabled={!attachment.available}
                  onClick={() =>
                    void api.attachments
                      .open(attachment.id)
                      .catch((error) => toast.error('Could not open that file', errorHint(error) ?? errorMessage(error)))
                  }
                >
                  <Eye className="size-3.5" />
                </IconButton>
              </Tip>
              <Tip label="Show in folder">
                <IconButton
                  label="Show attachment in folder"
                  size="icon-sm"
                  disabled={!attachment.available}
                  onClick={() => void api.attachments.reveal(attachment.id).catch(() => undefined)}
                >
                  <FolderOpen className="size-3.5" />
                </IconButton>
              </Tip>
              <Tip label="Remove">
                <IconButton
                  label="Remove attachment"
                  size="icon-sm"
                  onClick={() =>
                    void api.attachments
                      .remove(attachment.id)
                      .then(() => refreshDetail())
                      .catch((error) => toast.error('Could not remove that file', errorHint(error) ?? errorMessage(error)))
                  }
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </Tip>
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        icon={<Paperclip className="size-3.5" />}
        onClick={() => void pickAndAdd()}
      >
        Attach files
      </Button>
      <p className="text-2xs text-subtle">You can also drop files here.</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Version history                                                            */
/* -------------------------------------------------------------------------- */

export function VersionHistoryPanel({
  previewId,
  onPreview
}: {
  previewId: string | null
  onPreview: (version: SnippetVersion | null) => void
}): React.JSX.Element {
  const versions = useLibraryStore((state) => state.versions)
  const loading = useLibraryStore((state) => state.versionsLoading)
  const loadVersions = useLibraryStore((state) => state.loadVersions)
  const restoreVersion = useLibraryStore((state) => state.restoreVersion)
  const selectedId = useLibraryStore((state) => state.selectedId)

  useEffect(() => {
    if (selectedId) void loadVersions()
  }, [selectedId, loadVersions])

  if (loading && versions.length === 0) {
    return (
      <div className="grid place-items-center py-6">
        <Spinner />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <EmptyState
        compact
        icon={<History />}
        title="No versions yet."
        description="A snapshot is captured the first time you edit a snippet, so you can always go back."
      />
    )
  }

  return (
    <ul className="space-y-1">
      {versions.map((version, index) => (
        <li
          key={version.id}
          className={cn(
            'flex items-center gap-2 rounded-[6px] border border-line px-2 py-1.5',
            previewId === version.id ? 'bg-warning-soft' : 'bg-surface'
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-fg-secondary">
              {index === 0 ? 'Most recent snapshot' : formatRelativeTime(version.createdAt)}
            </span>
            <span className="block truncate text-2xs text-subtle">
              {formatDateTime(version.createdAt)} · {version.code.split('\n').length} lines
              {version.tagNames.length > 0 ? ` · ${version.tagNames.join(', ')}` : ''}
            </span>
          </span>

          <Tip label="Preview this version">
            <IconButton
              label="Preview version"
              size="icon-sm"
              onClick={() => onPreview(previewId === version.id ? null : version)}
              active={previewId === version.id}
            >
              <Eye className="size-3.5" />
            </IconButton>
          </Tip>

          <Tip label="Copy this version">
            <IconButton
              label="Copy version"
              size="icon-sm"
              onClick={() =>
                void copyText(snippetToPlainText({ ...version, sourceUrl: '' }), {
                  toastTitle: 'Version copied to clipboard'
                })
              }
            >
              <CopyIcon className="size-3.5" />
            </IconButton>
          </Tip>

          <Tip label="Restore this version">
            <IconButton
              label="Restore version"
              size="icon-sm"
              onClick={() => void restoreVersion(version.id)}
            >
              <RotateCcw className="size-3.5" />
            </IconButton>
          </Tip>
        </li>
      ))}

      <Separator className="!my-2" />
      <p className="text-2xs text-subtle">
        Restoring keeps your current content as a new version, so nothing is lost.
      </p>
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Source                                                                     */
/* -------------------------------------------------------------------------- */

export function SourcePanel({ detail }: { detail: SnippetDetail }): React.JSX.Element | null {
  if (!detail.sourceUrl && !detail.sourceName && !detail.sourceAuthor) return null

  return (
    <dl className="space-y-1 text-xs">
      {detail.sourceName ? (
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-subtle">Source</dt>
          <dd className="min-w-0 flex-1 truncate text-fg-secondary">{detail.sourceName}</dd>
        </div>
      ) : null}
      {detail.sourceAuthor ? (
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-subtle">Author</dt>
          <dd className="min-w-0 flex-1 truncate text-fg-secondary">{detail.sourceAuthor}</dd>
        </div>
      ) : null}
      {detail.sourceUrl ? (
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-subtle">URL</dt>
          <dd className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void api.system.openExternal(detail.sourceUrl)}
              className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:opacity-80"
            >
              <Link2 className="size-3 shrink-0" />
              <span className="truncate">{detail.sourceUrl}</span>
              <ExternalLink className="size-3 shrink-0" />
            </button>
          </dd>
        </div>
      ) : null}
      {detail.sourceFoundAt ? (
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-subtle">Found</dt>
          <dd className="text-fg-secondary">{formatDateTime(detail.sourceFoundAt)}</dd>
        </div>
      ) : null}
    </dl>
  )
}
