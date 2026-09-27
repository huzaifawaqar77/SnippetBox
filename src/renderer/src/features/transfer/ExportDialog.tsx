import { useEffect, useState } from 'react'
import { Check, Download, FileArchive, FileJson, FolderTree, Paperclip } from 'lucide-react'
import type { ExportFormat } from '@shared/types'
import { cn, pluralize } from '../../lib/utils'
import { Button, Switch } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/overlays'
import { useLibraryStore } from '../../stores/library'
import { useUiStore } from '../../stores/ui'
import { api, errorHint, errorMessage } from '../../lib/api'
import { toast } from '../../stores/toast'
import { VIEWS } from '@shared/constants'

const FORMATS: Array<{
  id: ExportFormat
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    id: 'json',
    label: 'JSON',
    icon: FileJson,
    description: 'A single file with every field, including notes and source. Best for re-importing.'
  },
  {
    id: 'zip',
    label: 'Archive (.zip)',
    icon: FileArchive,
    description: 'Markdown files plus metadata.json and, optionally, attachments. Best for archiving.'
  },
  {
    id: 'markdown',
    label: 'Markdown folder',
    icon: FolderTree,
    description: 'One .md file per snippet in a folder you choose. Best for docs and READMEs.'
  }
]

export function ExportDialog(): React.JSX.Element {
  const target = useUiStore((state) => state.exportTarget)
  const close = useUiStore((state) => state.closeExport)

  const view = useLibraryStore((state) => state.view)
  const query = useLibraryStore((state) => state.query)
  const total = useLibraryStore((state) => state.total)
  const detail = useLibraryStore((state) => state.detail)
  const selectedId = useLibraryStore((state) => state.selectedId)

  const [format, setFormat] = useState<ExportFormat>('json')
  const [includeAttachments, setIncludeAttachments] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) {
      setFormat('json')
      setIncludeAttachments(false)
    }
  }, [target])

  if (!target) return <></>

  const ids = target.ids
  const isSelection = Array.isArray(ids) && ids.length > 0
  const scopeLabel = isSelection
    ? ids.length === 1
      ? (detail && detail.id === ids[0] ? detail.title : '1 selected snippet')
      : `${ids.length} selected snippets`
    : `${VIEWS.find((entry) => entry.id === view)?.label ?? 'This view'} (${total})`

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.transfer.exportSnippets({
        format,
        view,
        ...(isSelection ? { ids } : { query }),
        includeAttachments: format === 'zip' ? includeAttachments : false
      })

      if (!result) {
        // The user cancelled the destination dialog — not an error.
        return
      }

      toast.success(`Exported ${pluralize(result.count, 'snippet')}`, result.path)
      close()
    } catch (error) {
      toast.error('The export failed', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && close()}
      title="Export snippets"
      description="Your data is always yours — export it at any time."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} icon={<Download className="size-3.5" />} onClick={() => void run()}>
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-line bg-sunken px-3 py-2">
          <p className="text-2xs uppercase tracking-wide text-subtle">Exporting</p>
          <p className="mt-0.5 truncate text-sm text-fg" title={scopeLabel}>
            {scopeLabel}
          </p>
          {isSelection && selectedId ? null : query ? (
            <p className="mt-0.5 truncate text-2xs text-subtle">with search “{query}”</p>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-fg-secondary">Format</legend>
          {FORMATS.map((entry) => {
            const Icon = entry.icon
            const active = format === entry.id

            return (
              <label
                key={entry.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  active ? 'border-primary-border bg-primary-soft/50' : 'border-line bg-surface hover:bg-hover'
                )}
              >
                <input
                  type="radio"
                  name="export-format"
                  checked={active}
                  onChange={() => setFormat(entry.id)}
                  className="mt-0.5 size-3.5 accent-[var(--primary)]"
                />
                <Icon className={cn('mt-0.5 size-4 shrink-0', active ? 'text-primary' : 'text-subtle')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{entry.label}</span>
                  <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{entry.description}</span>
                </span>
                {active ? <Check className="mt-0.5 size-3.5 shrink-0 text-primary" /> : null}
              </label>
            )
          })}
        </fieldset>

        {format === 'zip' ? (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <Paperclip className="size-3.5 text-subtle" />
                Include attachments
              </p>
              <p className="mt-0.5 text-2xs text-muted">
                Copies every attached file into the archive. Archives get noticeably larger.
              </p>
            </div>
            <Switch
              aria-label="Include attachments"
              checked={includeAttachments}
              onCheckedChange={setIncludeAttachments}
            />
          </div>
        ) : null}

        <p className="text-2xs text-subtle">
          You'll be asked where to save it next.
        </p>
      </div>
    </Modal>
  )
}
