import { useEffect, useRef, useState } from 'react'
import { Check, ClipboardPaste, Loader2, Save, X } from 'lucide-react'
import type { SnippetCreateInput } from '@shared/types'
import { LANGUAGES, detectLanguage } from '@shared/languages'
import { Badge, Button, Field, IconButton, Input } from '@/components/ui/primitives'
import { Select } from '@/components/ui/overlays'
import { LanguageIcon, TagChip } from '@/components/ui/bits'
import { CodeMirrorEditor } from '@/components/CodeMirrorEditor'
import { TagInput } from '@/features/snippets/SnippetEditor'
import { readClipboard } from '@/hooks'
import { api, errorHint, errorMessage } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useSettingsStore } from '@/stores/settings'
import { useLibraryStore } from '@/stores/library'
import { cn } from '@/lib/utils'

const EMPTY: SnippetCreateInput = {
  title: '',
  description: '',
  code: '',
  language: 'plaintext',
  notes: '',
  collectionId: null,
  sourceUrl: '',
  sourceName: '',
  sourceAuthor: '',
  tagNames: [],
  relatedIds: []
}

/**
 * The quick capture window (section 20 of the product spec).
 *
 * Deliberately tiny and frameless: the point is to save something in a few
 * seconds without leaving what you were doing.
 */
export function QuickCaptureApp(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const tags = useLibraryStore((state) => state.tags)
  const loadTags = useLibraryStore((state) => state.loadTags)

  const [form, setForm] = useState<SnippetCreateInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const patch = (value: Partial<SnippetCreateInput>): void => setForm((current) => ({ ...current, ...value }))

  useEffect(() => {
    titleRef.current?.focus()
    void loadTags()
  }, [loadTags])

  // Opt-in only: read the clipboard once on open, never in the background.
  useEffect(() => {
    if (!settings.clipboardIntegration) return
    let cancelled = false

    void readClipboard().then((text) => {
      if (cancelled || !text.trim()) return
      setForm((current) => {
        if ((current.code ?? '').trim()) return current
        const detected = detectLanguage(text)
        return { ...current, code: text, ...(detected ? { language: detected } : {}) }
      })
    })

    return () => {
      cancelled = true
    }
  }, [settings.clipboardIntegration])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void api.system.hideWindow()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        void save()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const pasteFromClipboard = async (): Promise<void> => {
    const text = await readClipboard()
    if (!text.trim()) {
      toast.info('The clipboard is empty')
      return
    }
    const detected = detectLanguage(text)
    patch({ code: text, ...(detected ? { language: detected } : {}) })
  }

  const save = async (): Promise<void> => {
    if (!form.title.trim()) {
      setError('A title is required.')
      titleRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)

    try {
      await api.snippets.create({
        ...form,
        title: form.title.trim(),
        collectionId: form.collectionId ?? null
      })
      setSaved(true)
      // Brief confirmation, then the window gets out of the way.
      setTimeout(() => {
        void api.system.hideWindow()
        setForm(EMPTY)
        setSaved(false)
      }, 650)
    } catch (err) {
      setError(errorHint(err) ?? errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <header className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span aria-hidden className="grid size-5 place-items-center rounded-[5px] bg-primary text-[0.5rem] font-bold text-on-primary">
          SB
        </span>
        <h1 className="text-xs font-semibold text-fg">Save to SnippetBox</h1>
        <Badge tone="neutral" className="no-drag ml-1">
          Ctrl+Enter to save
        </Badge>
        <div className="no-drag ml-auto flex items-center gap-1">
          {saved ? (
            <span className="flex items-center gap-1 text-2xs text-success">
              <Check className="size-3" />
              Saved
            </span>
          ) : null}
          {saving ? <Loader2 className="size-3.5 animate-spin text-subtle" /> : null}
          <IconButton label="Close" size="icon-sm" onClick={() => void api.system.hideWindow()}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <Field label="Title" required error={error} htmlFor="capture-title">
          <Input
            id="capture-title"
            ref={titleRef}
            value={form.title}
            onChange={(event) => {
              patch({ title: event.target.value })
              setError(null)
            }}
            placeholder="Find process using a port"
            maxLength={200}
          />
        </Field>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Language">
            <div className="flex items-center gap-2">
              <LanguageIcon language={LANGUAGES.find((entry) => entry.id === form.language)} />
              <Select
                ariaLabel="Language"
                value={form.language ?? 'plaintext'}
                onValueChange={(value) => patch({ language: value })}
                options={LANGUAGES.map((entry) => ({ value: entry.id, label: entry.label }))}
              />
            </div>
          </Field>
          <Button
            variant="secondary"
            size="sm"
            icon={<ClipboardPaste className="size-3.5" />}
            onClick={() => void pasteFromClipboard()}
          >
            Paste
          </Button>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-fg-secondary">Code</span>
          <div
            className={cn(
              'h-[11.1rem] overflow-hidden rounded-lg border border-line bg-code',
              'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25'
            )}
          >
            <CodeMirrorEditor
              value={form.code ?? ''}
              language={form.language ?? 'plaintext'}
              onChange={(value) => patch({ code: value })}
              showLineNumbers={false}
              wordWrap={settings.wordWrap}
              tabSize={settings.tabSize}
              placeholder="Paste the solution…"
              ariaLabel="Snippet code"
            />
          </div>
        </div>

        <Field label="Tags" hint="Enter or comma to add">
          {form.tagNames && form.tagNames.length > 0 ? (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {form.tagNames.map((tag) => (
                <TagChip
                  key={tag}
                  tag={{ name: tag, color: '#6366F1' }}
                  onRemove={() => patch({ tagNames: (form.tagNames ?? []).filter((entry) => entry !== tag) })}
                />
              ))}
            </div>
          ) : null}
          <TagInput
            value={form.tagNames ?? []}
            suggestions={tags.map((tag) => tag.name)}
            onChange={(tagNames) => patch({ tagNames })}
          />
        </Field>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
        <p className="text-2xs text-subtle">Stored locally. Nothing is uploaded.</p>
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          loading={saving}
          icon={<Save className="size-3.5" />}
          onClick={() => void save()}
        >
          Save
        </Button>
      </footer>
    </div>
  )
}
