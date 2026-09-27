import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search, Sparkles } from 'lucide-react'
import type { SnippetSummary } from '@shared/types'
import { formatRelativeTime } from '@shared/utils'
import { cn } from '../../lib/utils'
import { Kbd, Spinner } from '@/components/ui/primitives'
import { EmptyState, LanguageIcon } from '@/components/ui/bits'
import { getLanguage } from '@shared/languages'
import { api } from '@/lib/api'

/**
 * Global search launcher (section 58 of the product spec).
 *
 * A frameless window that appears over whatever you are doing, searches, and
 * hands the chosen snippet to the main window.
 */
export function LauncherApp(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SnippetSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const timer = setTimeout(() => {
      void api.snippets
        .list({ view: 'all', query, limit: 20 })
        .then((result) => {
          if (cancelled) return
          setResults(result.items)
          setCursor(0)
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 90)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const hint = useMemo(() => (query.trim() ? 'Enter to open in SnippetBox' : 'Start typing to search'), [query])

  const open = async (snippet: SnippetSummary | undefined): Promise<void> => {
    if (!snippet) return
    await api.system.openSnippetInMain(snippet.id)
    await api.system.hideWindow()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-overlay shadow-lg">
      <div className="drag-region flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Search className="size-3.5 shrink-0 text-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              void api.system.hideWindow()
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((value) => Math.min(results.length - 1, value + 1))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((value) => Math.max(0, value - 1))
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              void open(results[cursor])
            }
          }}
          placeholder="Search SnippetBox…"
          aria-label="Search SnippetBox"
          spellCheck={false}
          className="h-8 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
        />
        {loading ? <Spinner className="size-3.5" /> : null}
        <Kbd>Esc</Kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {results.length === 0 ? (
          loading ? null : (
            <EmptyState
              compact
              icon={query.trim() ? <Search /> : <Sparkles />}
              title={query.trim() ? 'Nothing found.' : 'Search your whole library.'}
              description={query.trim() ? 'Try a tag, a language or a phrase from the code.' : hint}
            />
          )
        ) : (
          <ul role="listbox" aria-label="Search results">
            {results.map((snippet, index) => (
              <li key={snippet.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => void open(snippet)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left transition-colors',
                    index === cursor ? 'bg-primary-soft' : 'hover:bg-hover'
                  )}
                >
                  <LanguageIcon language={getLanguage(snippet.language)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', index === cursor ? 'text-primary' : 'text-fg')}>
                      {snippet.title}
                    </span>
                    <span className="block truncate text-2xs text-subtle">
                      {snippet.description || snippet.codePreview || getLanguage(snippet.language)?.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-2xs text-subtle">{formatRelativeTime(snippet.updatedAt)}</span>
                  {index === cursor ? <CornerDownLeft className="size-3 shrink-0 text-primary" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-line px-3 py-1.5 text-2xs text-subtle">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto">Opens in the main window</span>
      </footer>
    </div>
  )
}
