import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Braces,
  Check,
  ClipboardPaste,
  Eye,
  EyeOff,
  Hash,
  Loader2,
  Save,
  Sparkles,
  X
} from 'lucide-react'
import type { SnippetCreateInput } from '@shared/types'
import { LANGUAGES, detectLanguage, getLanguage } from '@shared/languages'
import { cn } from '../../lib/utils'
import { Badge, Button, Field, IconButton, Input, Textarea } from '@/components/ui/primitives'
import { Select, Tip } from '@/components/ui/overlays'
import { LanguageIcon, TagChip } from '@/components/ui/bits'
import { CodeMirrorEditor } from '@/components/CodeMirrorEditor'
import { MarkdownView } from '@/components/MarkdownView'
import { readClipboard } from '../../hooks'
import { confirmDialog } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'

export function SnippetEditorPane(): React.JSX.Element {
  const mode = useLibraryStore((state) => state.mode)
  const draft = useLibraryStore((state) => state.draft)
  const tags = useLibraryStore((state) => state.tags)
  const collections = useLibraryStore((state) => state.collections)
  const updateDraft = useLibraryStore((state) => state.updateDraft)
  const saveDraft = useLibraryStore((state) => state.saveDraft)
  const cancelEditor = useLibraryStore((state) => state.cancelEditor)
  const saving = useLibraryStore((state) => state.saving)
  const savedAt = useLibraryStore((state) => state.savedAt)
  const saveError = useLibraryStore((state) => state.saveError)
  const dirty = useLibraryStore((state) => state.dirty)

  const settings = useSettingsStore((state) => state.settings)

  const [languageTouched, setLanguageTouched] = useState(mode === 'edit')
  const [showNotesPreview, setShowNotesPreview] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'create') titleRef.current?.focus()
    if (mode === 'edit') setLanguageTouched(true)
  }, [mode])

  const suggested = useMemo(() => {
    if (!draft?.code || draft.code.trim().length < 12) return null
    const detected = detectLanguage(draft.code)
    if (!detected || detected === draft.language) return null
    return detected
  }, [draft?.code, draft?.language])

  if (!draft) return <div className="grid h-full place-items-center text-sm text-subtle">Nothing to edit.</div>

  const language = getLanguage(draft.language)

  const pasteFromClipboard = async (): Promise<void> => {
    const text = await readClipboard()
    if (!text.trim()) return

    if ((draft.code ?? '').trim()) {
      const confirmed = await confirmDialog({
        title: 'Replace the code?',
        description: 'The editor already has content. Pasting from the clipboard will replace it.',
        confirmLabel: 'Replace'
      })
      if (!confirmed) return
    }

    updateDraft({ code: text })
    if (!languageTouched) {
      const detected = detectLanguage(text)
      if (detected) {
        updateDraft({ code: text, language: detected })
        setLanguageTouched(false)
      }
    }
  }

  const saveState = saving ? 'saving' : saveError ? 'error' : !dirty && savedAt ? 'saved' : 'idle'

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-5">
        <h1 className="text-sm font-semibold text-fg">
          {mode === 'create' ? 'New Snippet' : 'Edit Snippet'}
        </h1>

        {mode === 'edit' ? (
          <span className="flex items-center gap-1.5 text-2xs">
            {saveState === 'saving' ? (
              <>
                <Loader2 className="size-3 animate-spin text-subtle" />
                <span className="text-subtle">Saving…</span>
              </>
            ) : saveState === 'saved' ? (
              <>
                <Check className="size-3 text-success" />
                <span className="text-success">Saved</span>
              </>
            ) : saveState === 'error' ? (
              <>
                <AlertTriangle className="size-3 text-danger" />
                <span className="text-danger">{saveError}</span>
              </>
            ) : (
              <span className="text-subtle">Changes save automatically</span>
            )}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void cancelEditor()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            icon={<Save className="size-3.5" />}
            onClick={() => void saveDraft({ force: true })}
          >
            {mode === 'create' ? 'Save Snippet' : 'Save now'}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-4">
          <Field label="Title" required htmlFor="snippet-title">
            <Input
              id="snippet-title"
              ref={titleRef}
              value={draft.title}
              onChange={(event) => updateDraft({ title: event.target.value })}
              placeholder="Find process using a port"
              maxLength={200}
            />
          </Field>

          <Field label="Description" hint="Optional, but it makes the snippet findable later." htmlFor="snippet-description">
            <Textarea
              id="snippet-description"
              rows={2}
              value={draft.description ?? ''}
              onChange={(event) => updateDraft({ description: event.target.value })}
              placeholder="Find which process is currently using a specific TCP port."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Language" htmlFor="snippet-language">
              <div className="flex items-center gap-2">
                <LanguageIcon language={language} />
                <Select
                  ariaLabel="Language"
                  value={draft.language ?? 'plaintext'}
                  onValueChange={(value) => {
                    setLanguageTouched(true)
                    updateDraft({ language: value })
                  }}
                  options={LANGUAGES.map((entry) => ({ value: entry.id, label: entry.label }))}
                />
              </div>
            </Field>

            <Field label="Collection" hint="Optional" htmlFor="snippet-collection">
              <Select
                ariaLabel="Collection"
                value={draft.collectionId ?? '__none__'}
                onValueChange={(value) => updateDraft({ collectionId: value === '__none__' ? null : value })}
                options={[
                  { value: '__none__', label: 'No collection' },
                  ...collections.map((collection) => ({ value: collection.id, label: collection.name }))
                ]}
              />
            </Field>
          </div>

          {suggested && !languageTouched ? (
            <div className="flex items-center gap-2 rounded-md border border-primary-border bg-primary-soft px-2.5 py-2">
              <Sparkles className="size-3.5 text-primary" />
              <span className="text-xs text-primary">
                Detected language: <strong>{getLanguage(suggested)?.label}</strong>
              </span>
              <Button size="sm" variant="ghost" className="ml-auto h-6 text-2xs" onClick={() => updateDraft({ language: suggested })}>
                Use {getLanguage(suggested)?.label}
              </Button>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="snippet-code" className="text-xs font-medium text-fg-secondary">
                Code
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-2xs text-subtle">
                  {(draft.code ?? '').split('\n').length} lines
                </span>
                <Tip label="Replace the code with the clipboard contents">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-2xs"
                    icon={<ClipboardPaste className="size-3" />}
                    onClick={() => void pasteFromClipboard()}
                  >
                    Paste from clipboard
                  </Button>
                </Tip>
              </div>
            </div>

            <div className="h-[18.9rem] overflow-hidden rounded-lg border border-line bg-code">
              <CodeMirrorEditor
                value={draft.code ?? ''}
                language={draft.language ?? 'plaintext'}
                onChange={(value) => updateDraft({ code: value })}
                showLineNumbers={settings.showLineNumbers}
                wordWrap={settings.wordWrap}
                tabSize={settings.tabSize}
                placeholder="Paste or type the solution…"
                ariaLabel="Snippet code"
              />
            </div>
          </div>

          <Field label="Tags" hint="Press Enter or comma to add.">
            <TagInput
              value={draft.tagNames ?? []}
              suggestions={tags.map((tag) => tag.name)}
              onChange={(tagNames) => updateDraft({ tagNames })}
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="snippet-notes" className="text-xs font-medium text-fg-secondary">
                Notes
              </label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-2xs"
                icon={showNotesPreview ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                onClick={() => setShowNotesPreview((value) => !value)}
              >
                {showNotesPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>

            {showNotesPreview ? (
              <div className="min-h-[6.7rem] rounded-[7px] border border-line bg-sunken/50 px-3 py-2.5">
                {(draft.notes ?? '').trim() ? (
                  <MarkdownView>{draft.notes ?? ''}</MarkdownView>
                ) : (
                  <p className="text-xs text-subtle">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <Textarea
                id="snippet-notes"
                rows={5}
                value={draft.notes ?? ''}
                onChange={(event) => updateDraft({ notes: event.target.value })}
                placeholder={'## Why this works\n\nExplain the parts that are easy to forget.'}
                className="font-mono text-xs"
              />
            )}
          </div>

          <fieldset className="space-y-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-medium text-fg-secondary">Source</legend>
            <Field label="Source URL" htmlFor="snippet-source-url">
              <Input
                id="snippet-source-url"
                value={draft.sourceUrl ?? ''}
                onChange={(event) => updateDraft({ sourceUrl: event.target.value })}
                placeholder="https://stackoverflow.com/…"
                inputMode="url"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source name" htmlFor="snippet-source-name">
                <Input
                  id="snippet-source-name"
                  value={draft.sourceName ?? ''}
                  onChange={(event) => updateDraft({ sourceName: event.target.value })}
                  placeholder="Stack Overflow"
                />
              </Field>
              <Field label="Author" htmlFor="snippet-source-author">
                <Input
                  id="snippet-source-author"
                  value={draft.sourceAuthor ?? ''}
                  onChange={(event) => updateDraft({ sourceAuthor: event.target.value })}
                  placeholder="Whoever wrote it"
                />
              </Field>
            </div>
          </fieldset>

          <div className="flex items-center gap-2 pb-6 pt-1">
            <Badge tone="neutral">
              <Braces className="size-2.5" />
              Stored locally
            </Badge>
            <span className="text-2xs text-subtle">
              SnippetBox never runs stored code — it only keeps it.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tag input                                                                  */
/* -------------------------------------------------------------------------- */

export function TagInput({
  value,
  onChange,
  suggestions,
  autoFocus
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  autoFocus?: boolean
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase()
    const used = new Set(value.map((tag) => tag.toLowerCase()))
    return suggestions
      .filter((tag) => !used.has(tag.toLowerCase()))
      .filter((tag) => (needle ? tag.toLowerCase().includes(needle) : true))
      .slice(0, 6)
  }, [suggestions, text, value])

  const add = (raw: string): void => {
    const tag = raw.trim().replace(/,$/, '')
    if (!tag) return
    if (value.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
      setText('')
      return
    }
    onChange([...value, tag].slice(0, 64))
    setText('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-8 flex-wrap items-center gap-1.5 rounded-[7px] border border-line bg-surface px-2 py-1.5',
          'transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 hover:border-line-strong'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <TagChip key={tag} tag={{ name: tag, color: '#6366F1' }} onRemove={() => onChange(value.filter((entry) => entry !== tag))} />
        ))}

        <input
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          onChange={(event) => {
            const next = event.target.value
            if (next.includes(',')) {
              add(next.split(',')[0] ?? '')
              return
            }
            setText(next)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add(text)
            } else if (event.key === 'Backspace' && !text && value.length > 0) {
              onChange(value.slice(0, -1))
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          onBlur={() => {
            if (text.trim()) add(text)
            setOpen(false)
          }}
          onFocus={() => setOpen(true)}
          placeholder={value.length === 0 ? 'linux, network, debugging' : ''}
          aria-label="Add tags"
          className="h-5 min-w-[6.1rem] flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-subtle"
        />

        {text ? (
          <IconButton label="Add tag" size="icon-sm" onClick={() => add(text)}>
            <Check className="size-3" />
          </IconButton>
        ) : null}
      </div>

      {open && matches.length > 0 ? (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-overlay p-1 shadow-lg">
          {matches.map((match) => (
            <li key={match}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  add(match)
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1 text-left text-xs text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
              >
                <Hash className="size-3 text-subtle" />
                {match}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function SuggestedLanguageChip({
  language,
  onUse,
  onDismiss
}: {
  language: string
  onUse: () => void
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-primary-border bg-primary-soft px-2 py-1 text-2xs text-primary">
      <Sparkles className="size-3" />
      Detected: {getLanguage(language)?.label}
      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-2xs" onClick={onUse}>
        Use
      </Button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="grid size-4 place-items-center rounded hover:bg-black/5">
        <X className="size-2.5" />
      </button>
    </div>
  )
}

export type { SnippetCreateInput }
