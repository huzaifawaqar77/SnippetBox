import { useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  Braces,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Hash,
  History,
  Link2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Search,
  Settings2,
  Star,
  Trash2,
  Type,
  WholeWord,
  WrapText
} from 'lucide-react'
import type { SnippetDetail, SnippetVersion } from '@shared/types'
import { getLanguage } from '@shared/languages'
import { snippetToMarkdown, snippetToPlainText } from '@shared/utils'
import { formatDateTime } from '@shared/utils'
import { cn, formatRelativeTime, pluralize } from '../../lib/utils'
import { Badge, Button, IconButton, Separator, Spinner } from '@/components/ui/primitives'
import { Menu, Tip } from '@/components/ui/overlays'
import { EmptyState, LanguageIcon, TagChip, usageSummary } from '@/components/ui/bits'
import { CodeMirrorEditor } from '@/components/CodeMirrorEditor'
import { MarkdownView } from '@/components/MarkdownView'
import { AttachmentsPanel, Disclosure, RelatedPanel, VersionHistoryPanel } from './SnippetSidePanels'
import { useCopy } from '../../hooks'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { revealSearchPanel } from '../../lib/codemirror'

export function SnippetDetailPane(): React.JSX.Element {
  const detail = useLibraryStore((state) => state.detail)
  const loading = useLibraryStore((state) => state.detailLoading)
  const selectedId = useLibraryStore((state) => state.selectedId)
  const startCreate = useLibraryStore((state) => state.startCreate)

  if (loading && !detail) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (!detail || !selectedId) {
    return (
      <div className="grid h-full place-items-center">
        <EmptyState
          icon={<FileText />}
          title="No snippet selected."
          description="Pick something from the list, or capture a new solution before you lose it."
          action={
            <Button variant="secondary" size="sm" icon={<Braces className="size-3.5" />} onClick={() => startCreate()}>
              New Snippet
            </Button>
          }
        />
      </div>
    )
  }

  return <SnippetDetailView key={detail.id} detail={detail} />
}

function SnippetDetailView({ detail }: { detail: SnippetDetail }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<SnippetVersion | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.update)
  const startEdit = useLibraryStore((state) => state.startEdit)
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite)
  const duplicateSelected = useLibraryStore((state) => state.duplicateSelected)
  const trashSelected = useLibraryStore((state) => state.trashSelected)
  const saveVersionSnapshot = useLibraryStore((state) => state.saveVersionSnapshot)
  const setView = useLibraryStore((state) => state.setView)
  const openExport = useUiStore((state) => state.openExport)

  const { copy, copiedKey } = useCopy()
  const language = getLanguage(detail.language)

  const code = previewVersion?.code ?? detail.code
  const notes = previewVersion?.notes ?? detail.notes
  const usage = usageSummary(detail)
  const sourceLabel = detail.sourceName || detail.sourceUrl

  const codeActions = useMemo(
    () => (
      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton label="Code display options">
            <Settings2 className="size-4" />
          </IconButton>
        </Menu.Trigger>
        <Menu.Content align="end">
          <Menu.Label>Code display</Menu.Label>
          <Menu.CheckboxItem
            checked={settings.showLineNumbers}
            onCheckedChange={(checked) => void updateSettings({ showLineNumbers: Boolean(checked) })}
          >
            <Hash />
            Line numbers
          </Menu.CheckboxItem>
          <Menu.CheckboxItem
            checked={settings.wordWrap}
            onCheckedChange={(checked) => void updateSettings({ wordWrap: Boolean(checked) })}
          >
            <WrapText />
            Word wrap
          </Menu.CheckboxItem>
          <Menu.Separator />
          <Menu.Label>Font size</Menu.Label>
          <Menu.Item
            onSelect={() => void updateSettings({ codeFontSize: Math.min(32, settings.codeFontSize + 1) })}
          >
            <Type />
            Increase
            <span className="ml-auto text-2xs text-subtle">{settings.codeFontSize}px</span>
          </Menu.Item>
          <Menu.Item
            onSelect={() => void updateSettings({ codeFontSize: Math.max(9, settings.codeFontSize - 1) })}
          >
            <WholeWord />
            Decrease
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>
    ),
    [settings.codeFontSize, settings.showLineNumbers, settings.wordWrap, updateSettings]
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface">
      {/* ---------------------------------------------------------------- header */}
      <header className="shrink-0 border-b border-line px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <LanguageIcon language={language} size="lg" className="mt-0.5" />

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-fg" data-selectable>
              {detail.title}
            </h1>
            {detail.description.trim() ? (
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted" data-selectable>
                {detail.description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={detail.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => void toggleFavorite(detail.id)}
              className={cn(detail.favorite && 'text-star hover:text-star')}
            >
              <Star className={cn('size-4', detail.favorite && 'fill-current')} />
            </IconButton>

            <Tip label="Copy code" shortcut="Ctrl Shift C">
              <Button
                variant="secondary"
                size="sm"
                icon={copiedKey === 'detail' ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                onClick={() => void copy(detail.code, { key: 'detail', snippetId: detail.id })}
              >
                {copiedKey === 'detail' ? 'Copied!' : 'Copy'}
              </Button>
            </Tip>

            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil className="size-3.5" />}
              onClick={() => startEdit()}
            >
              Edit
            </Button>

            <Menu.Root>
              <Menu.Trigger asChild>
                <IconButton label="More actions">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </Menu.Trigger>
              <Menu.Content align="end">
                <Menu.Item
                  onSelect={() =>
                    void copy(snippetToMarkdown(detail), { key: 'md', toastTitle: 'Markdown copied to clipboard' })
                  }
                >
                  <FileText />
                  Copy as Markdown
                </Menu.Item>
                <Menu.Item
                  onSelect={() =>
                    void copy(snippetToPlainText(detail), { key: 'txt', toastTitle: 'Copied to clipboard' })
                  }
                >
                  <Copy />
                  Copy everything
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item onSelect={() => void duplicateSelected()}>
                  <Braces />
                  Duplicate
                </Menu.Item>
                <Menu.Item onSelect={() => void saveVersionSnapshot()}>
                  <History />
                  Save version snapshot
                </Menu.Item>
                <Menu.Item onSelect={() => openExport([detail.id])}>
                  <ExternalLink />
                  Export…
                </Menu.Item>
                {detail.sourceUrl ? (
                  <Menu.Item onSelect={() => void window.snippetbox.system.openExternal(detail.sourceUrl)}>
                    <Globe />
                    Open source
                  </Menu.Item>
                ) : null}
                <Menu.Separator />
                <Menu.Item
                  className="text-danger data-[highlighted]:text-danger"
                  onSelect={() => void trashSelected()}
                >
                  <Trash2 />
                  Move to Trash
                </Menu.Item>
              </Menu.Content>
            </Menu.Root>
          </div>
        </div>

        {detail.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {detail.tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                onClick={() => setView('tag', { tagId: tag.id })}
                className="cursor-pointer"
              />
            ))}
          </div>
        ) : null}

        <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-subtle">
          <div className="flex items-center gap-1">
            <dt className="text-subtle/80">Created</dt>
            <dd title={formatDateTime(detail.createdAt)}>{formatRelativeTime(detail.createdAt)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="text-subtle/80">Updated</dt>
            <dd title={formatDateTime(detail.updatedAt)}>{formatRelativeTime(detail.updatedAt)}</dd>
          </div>
          {detail.collectionName ? (
            <div className="flex items-center gap-1">
              <dt className="text-subtle/80">Collection</dt>
              <dd>
                <button
                  type="button"
                  className="rounded transition-colors hover:text-fg"
                  onClick={() => setView('collection', { collectionId: detail.collectionId })}
                >
                  {detail.collectionName}
                </button>
              </dd>
            </div>
          ) : null}
          {usage ? <dd>{usage}</dd> : null}
        </dl>

        {sourceLabel ? (
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-2xs">
            <Link2 className="size-3 shrink-0 text-subtle" />
            {detail.sourceUrl ? (
              <button
                type="button"
                onClick={() => void window.snippetbox.system.openExternal(detail.sourceUrl)}
                className="truncate text-primary transition-opacity hover:opacity-80"
                title={detail.sourceUrl}
              >
                {sourceLabel}
              </button>
            ) : (
              <span className="truncate text-muted">{sourceLabel}</span>
            )}
            {detail.sourceAuthor ? <span className="text-subtle">· {detail.sourceAuthor}</span> : null}
          </div>
        ) : null}
      </header>

      {/* ------------------------------------------------------------------ body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* code */}
        <section className="px-6 py-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
              <Braces className="size-3.5" />
              Code
            </h2>
            <span className="text-2xs text-subtle">
              {language?.label ?? 'Plain Text'} · {pluralize(detail.lineCount, 'line')}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {codeActions}
              <Tip label="Find in code">
                <IconButton
                  label="Find in code"
                  onClick={() => {
                    const view = editorViewRef.current
                    if (view) revealSearchPanel(view)
                  }}
                >
                  <Search className="size-4" />
                </IconButton>
              </Tip>
              <Tip label={expanded ? 'Collapse code' : 'Expand code'}>
                <IconButton label={expanded ? 'Collapse code' : 'Expand code'} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </IconButton>
              </Tip>
            </div>
          </div>

          {previewVersion ? (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-2.5 py-1.5">
              <History className="size-3.5 text-warning" />
              <span className="text-2xs text-warning">
                Viewing version from {formatDateTime(previewVersion.createdAt)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 text-2xs"
                onClick={() => setPreviewVersion(null)}
              >
                Back to current
              </Button>
            </div>
          ) : null}

          <div
            data-code-editor
            className={cn(
              'relative overflow-hidden rounded-lg border border-line bg-code',
              expanded ? 'h-[70vh]' : 'h-[17.8rem]'
            )}
          >
            <CodeMirrorEditor
              value={code || '// This snippet has no code yet.'}
              language={detail.language}
              readOnly
              showLineNumbers={settings.showLineNumbers}
              wordWrap={settings.wordWrap}
              tabSize={settings.tabSize}
              ariaLabel={`${detail.title} code`}
              onReady={(view) => {
                editorViewRef.current = view
              }}
            />
          </div>
        </section>

        {/* notes */}
        <section className="px-6 pb-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
              <FileText className="size-3.5" />
              Notes
            </h2>
            {!notes.trim() ? (
              <Button size="sm" variant="ghost" className="h-6 text-2xs" onClick={() => startEdit()}>
                Add notes
              </Button>
            ) : null}
          </div>

          {notes.trim() ? (
            <div className="rounded-lg border border-line bg-sunken/50 px-4 py-3">
              <MarkdownView>{notes}</MarkdownView>
            </div>
          ) : (
            <p className="text-xs text-subtle">
              No notes yet. Notes are Markdown, so you can explain <em>why</em> a solution works.
            </p>
          )}
        </section>

        {/* related, attachments, history */}
        <section className="space-y-2 px-6 pb-8">
          <Disclosure
            title="Related snippets"
            icon={<Link2 className="size-3.5" />}
            count={detail.relatedIds.length}
            defaultOpen={detail.relatedIds.length > 0}
          >
            <RelatedPanel detail={detail} />
          </Disclosure>

          <Disclosure
            title="Attachments"
            icon={<Paperclip className="size-3.5" />}
            count={detail.attachments.length}
            defaultOpen={detail.attachments.length > 0}
          >
            <AttachmentsPanel detail={detail} />
          </Disclosure>

          <Disclosure
            title="Version history"
            icon={<History className="size-3.5" />}
            count={detail.versionCount}
            defaultOpen={false}
          >
            <VersionHistoryPanel previewId={previewVersion?.id ?? null} onPreview={setPreviewVersion} />
          </Disclosure>

          <Separator className="!mt-4" />
          <div className="flex flex-wrap items-center gap-2 pt-2 text-2xs text-subtle">
            <Badge tone="neutral">
              <Hash className="size-2.5" />
              {detail.id.slice(0, 8)}
            </Badge>
            <span>Stored locally · nothing leaves this machine</span>
          </div>
        </section>
      </div>
    </div>
  )
}
