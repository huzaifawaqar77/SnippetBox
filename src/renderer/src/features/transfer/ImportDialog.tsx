import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileArchive, FileJson, FileText, FolderOpen, Upload } from 'lucide-react'
import type { ImportCandidate, ImportPreview } from '@shared/types'
import { cn } from '../../lib/utils'
import { Badge, Button, Spinner } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/overlays'
import { EmptyState, LanguageIcon } from '@/components/ui/bits'
import { useLibraryStore } from '../../stores/library'
import { useUiStore } from '../../stores/ui'
import { api, errorHint, errorMessage } from '../../lib/api'
import { toast } from '../../stores/toast'
import { getLanguage } from '@shared/languages'

export function ImportDialog(): React.JSX.Element {
  const target = useUiStore((state) => state.importTarget)
  const close = useUiStore((state) => state.closeImport)
  const open = target !== null
  const refresh = useLibraryStore((state) => state.refresh)
  const loadTags = useLibraryStore((state) => state.loadTags)
  const loadCollections = useLibraryStore((state) => state.loadCollections)

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (open) return undefined
    setPreview(null)
    setSelected(new Set())
    setError(null)
    return undefined
  }, [open])

  const duplicateTitles = useMemo(() => {
    const map = new Map<string, ImportPreview['duplicates'][number]>()
    for (const duplicate of preview?.duplicates ?? []) map.set(duplicate.candidateTitle, duplicate)
    return map
  }, [preview])

  const candidates = preview?.candidates ?? []

  const inspect = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setLoading(true)
    setError(null)

    try {
      const result = await api.transfer.previewImport(paths)
      setPreview(result)

      // Everything that is not a likely duplicate is selected by default.
      const keys = result.candidates.map((candidate, index) => candidateKey(candidate, index))
      const duplicates = new Set(result.duplicates.map((duplicate) => duplicate.candidateTitle))
      setSelected(
        new Set(keys.filter((_key, index) => !duplicates.has(result.candidates[index]?.title ?? '')))
      )
    } catch (err) {
      setError(errorHint(err) ?? errorMessage(err))
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  const pickFiles = async (): Promise<void> => {
    const paths = await api.transfer.pickFiles()
    await inspect(paths)
  }

  const runImport = async (): Promise<void> => {
    const chosen = candidates.filter((candidate, index) => selected.has(candidateKey(candidate, index)))
    if (chosen.length === 0) return

    setImporting(true)
    try {
      const result = await api.transfer.commitImport(chosen)
      await Promise.all([refresh({ quiet: true }), loadTags(), loadCollections()])
      toast.success(
        `Imported ${result.imported} snippet${result.imported === 1 ? '' : 's'}`,
        result.skipped > 0 ? `${result.skipped} were skipped.` : undefined
      )
      close()
    } catch (err) {
      toast.error('The import failed', errorHint(err) ?? errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  // Files dropped on the window arrive as an import target and are inspected
  // straight away, so the user lands on the preview rather than an empty dialog.
  useEffect(() => {
    if (!open) return
    const paths = target?.paths
    if (paths && paths.length > 0) void inspect(paths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.paths])

  useEffect(() => {
    if (!open) return undefined

    const onDragOver = (event: DragEvent): void => {
      event.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (): void => setDragging(false)
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      setDragging(false)
      const paths = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => api.system.getPathForFile(file))
        .filter(Boolean)
      void inspect(paths)
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleAll = (): void => {
    if (selected.size === candidates.length) setSelected(new Set())
    else setSelected(new Set(candidates.map((candidate, index) => candidateKey(candidate, index))))
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && close()}
      title="Import snippets"
      description="JSON, Markdown, SnippetBox archives and plain code files. Imported content is treated as data only — nothing is executed."
      size="lg"
      footer={
        <>
          <span className="mr-auto text-2xs text-subtle">
            {candidates.length > 0 ? `${selected.size} of ${candidates.length} selected` : ''}
          </span>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={importing}
            disabled={selected.size === 0}
            icon={<Upload className="size-3.5" />}
            onClick={() => void runImport()}
          >
            Import {selected.size > 0 ? selected.size : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
            dragging ? 'border-primary bg-primary-soft' : 'border-line bg-sunken/50'
          )}
        >
          {loading ? (
            <Spinner className="mx-auto size-5" />
          ) : (
            <>
              <FolderOpen className="mx-auto size-5 text-subtle" />
              <p className="mt-2 text-xs text-muted">Drop files or folders here, or choose them manually.</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => void pickFiles()}>
                Choose files…
              </Button>
            </>
          )}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        ) : null}

        {preview ? (
          candidates.length === 0 ? (
            <EmptyState
              compact
              icon={<FileText />}
              title="Nothing to import."
              description="SnippetBox found no readable snippets in that selection."
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Preview</h3>
                {preview.skipped > 0 ? (
                  <Badge tone="neutral">{preview.skipped} file(s) skipped</Badge>
                ) : null}
                {preview.duplicates.length > 0 ? (
                  <Badge tone="warning">{preview.duplicates.length} possible duplicate(s)</Badge>
                ) : null}
                <Button size="sm" variant="ghost" className="ml-auto h-6 text-2xs" onClick={toggleAll}>
                  {selected.size === candidates.length ? 'Deselect all' : 'Select all'}
                </Button>
              </div>

              <ul className="max-h-[17.8rem] space-y-1 overflow-y-auto">
                {candidates.map((candidate, index) => {
                  const key = candidateKey(candidate, index)
                  const duplicate = duplicateTitles.get(candidate.title)
                  const checked = selected.has(key)

                  return (
                    <li key={key}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                          checked ? 'border-primary-border bg-primary-soft/40' : 'border-line bg-surface hover:bg-hover'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current)
                              if (next.has(key)) next.delete(key)
                              else next.add(key)
                              return next
                            })
                          }
                          className="size-3.5 accent-[var(--primary)]"
                        />
                        <LanguageIcon language={getLanguage(candidate.language)} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-fg">{candidate.title}</span>
                          <span className="block truncate text-2xs text-subtle">
                            {getLanguage(candidate.language)?.label}
                            {candidate.tags.length > 0 ? ` · ${candidate.tags.slice(0, 3).join(', ')}` : ''}
                            {candidate.origin ? ` · ${candidate.origin.split('/').pop()}` : ''}
                          </span>
                        </span>
                        {duplicate ? (
                          <Badge tone="warning" title={`Similar to “${duplicate.existingTitle}”`}>
                            duplicate?
                          </Badge>
                        ) : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        ) : (
          <div className="flex items-center gap-4 rounded-md border border-line bg-sunken/50 px-3 py-2.5">
            <FileJson className="size-4 shrink-0 text-subtle" />
            <p className="text-2xs text-muted">
              A JSON export from SnippetBox, a folder of Markdown notes, a SnippetBox <code>.zip</code>, or loose
              <code> .sh</code>, <code>.py</code>, <code>.ts</code> files all work.
            </p>
            <FileArchive className="ml-auto size-4 shrink-0 text-subtle" />
          </div>
        )}
      </div>
    </Modal>
  )
}

function candidateKey(candidate: ImportCandidate, index: number): string {
  return `${candidate.origin}::${candidate.title}::${index}`
}
