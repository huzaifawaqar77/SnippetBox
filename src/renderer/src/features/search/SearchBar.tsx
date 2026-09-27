import { useMemo } from 'react'
import { ArrowDownUp, CornerDownLeft, Search, X } from 'lucide-react'
import type { ParsedQuery, SortKey } from '@shared/types'
import { SORT_OPTIONS } from '@shared/constants'
import { languageLabel, resolveLanguageId } from '@shared/languages'
import { cn, pluralize } from '../../lib/utils'
import { focusTargets } from '../../lib/focus'
import { Badge, IconButton } from '@/components/ui/primitives'
import { Select, Tip } from '@/components/ui/overlays'
import { useLibraryStore } from '../../stores/library'

interface Chip {
  key: string
  label: string
  tone: 'tag' | 'language' | 'collection' | 'flag' | 'date' | 'term'
}

function chipsFor(parsed: ParsedQuery): Chip[] {
  const chips: Chip[] = []

  parsed.tags.forEach((tag, index) => chips.push({ key: `tag:${index}`, label: `#${tag}`, tone: 'tag' }))
  parsed.languages.forEach((language, index) =>
    chips.push({
      key: `language:${index}`,
      label: languageLabel(resolveLanguageId(language) ?? language),
      tone: 'language'
    })
  )
  parsed.collections.forEach((collection, index) =>
    chips.push({ key: `collection:${index}`, label: collection, tone: 'collection' })
  )
  if (parsed.isFavorite) chips.push({ key: 'is:favorite', label: 'favorites', tone: 'flag' })
  if (parsed.isRecent) chips.push({ key: 'is:recent', label: 'recent', tone: 'flag' })
  if (parsed.after) chips.push({ key: 'after', label: `after ${parsed.after.slice(0, 10)}`, tone: 'date' })
  if (parsed.before) chips.push({ key: 'before', label: `before ${parsed.before.slice(0, 10)}`, tone: 'date' })

  return chips
}

/** Rebuilds the query text with one operator removed, keeping free text intact. */
function withoutChip(parsed: ParsedQuery, key: string): string {
  const quoted = parsed.phrases.map((phrase) => `"${phrase}"`)
  const terms = [...quoted, ...parsed.terms]

  const tags = parsed.tags.map((tag, index) => ({ key: `tag:${index}`, value: `tag:${tag}` }))
  const languages = parsed.languages.map((language, index) => ({ key: `language:${index}`, value: `language:${language}` }))
  const collections = parsed.collections.map((collection, index) => ({
    key: `collection:${index}`,
    value: `collection:${collection}`
  }))

  const flags: Array<{ key: string; value: string }> = []
  if (parsed.isFavorite) flags.push({ key: 'is:favorite', value: 'is:favorite' })
  if (parsed.isRecent) flags.push({ key: 'is:recent', value: 'is:recent' })
  if (parsed.after) flags.push({ key: 'after', value: `after:${parsed.after.slice(0, 10)}` })
  if (parsed.before) flags.push({ key: 'before', value: `before:${parsed.before.slice(0, 10)}` })

  const operators = [...tags, ...languages, ...collections, ...flags]
    .filter((entry) => entry.key !== key)
    .map((entry) => entry.value)

  return [...terms, ...operators].join(' ').trim()
}

export function SearchBar(): React.JSX.Element {
  const query = useLibraryStore((state) => state.query)
  const setQuery = useLibraryStore((state) => state.setQuery)
  const parsed = useLibraryStore((state) => state.parsed)
  const total = useLibraryStore((state) => state.total)
  const sort = useLibraryStore((state) => state.sort)
  const setSort = useLibraryStore((state) => state.setSort)
  const loading = useLibraryStore((state) => state.listLoading)

  const chips = useMemo(() => chipsFor(parsed), [parsed])

  return (
    <div className="shrink-0 border-b border-line px-3 pb-2.5 pt-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <input
          ref={(element) => {
            focusTargets.search = element
          }}
          id="global-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              if (query) setQuery('')
              else event.currentTarget.blur()
            }
          }}
          placeholder="Search snippets…"
          aria-label="Search snippets"
          spellCheck={false}
          autoComplete="off"
          className={cn(
            'h-8 w-full rounded-[7px] border border-line bg-surface pl-8 pr-8 text-sm text-fg',
            'placeholder:text-subtle transition-colors hover:border-line-strong',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25',
            '[&::-webkit-search-cancel-button]:hidden'
          )}
        />
        {query ? (
          <IconButton
            label="Clear search"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => {
              setQuery('')
              focusTargets.search?.focus()
            }}
          >
            <X className="size-3.5" />
          </IconButton>
        ) : (
          <Tip label="Operators: tag: · language: · collection: · is:favorite · before: · after:" side="bottom">
            <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-2xs text-subtle/70 sm:block">
              tag: language: is:
            </span>
          </Tip>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-2xs text-subtle">
          {loading ? 'Searching…' : pluralize(total, 'snippet')}
        </span>

        <Tip label="Sort results">
          <span className="inline-flex">
            <Select
              ariaLabel="Sort snippets"
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
              className="h-6 gap-1 border-transparent bg-transparent px-1 text-2xs text-muted hover:border-line"
              options={SORT_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
            />
          </span>
        </Tip>
      </div>

      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setQuery(withoutChip(parsed, chip.key))}
              className={cn(
                'group inline-flex h-5 max-w-[10.6rem] items-center gap-1 rounded-[5px] border px-1.5 text-2xs font-medium transition-colors',
                chip.tone === 'tag' && 'border-primary-border bg-primary-soft text-primary',
                chip.tone === 'language' && 'border-line bg-sunken text-fg-secondary',
                chip.tone === 'collection' && 'border-line bg-sunken text-fg-secondary',
                chip.tone === 'flag' && 'border-warning/30 bg-warning-soft text-warning',
                chip.tone === 'date' && 'border-line bg-sunken text-muted'
              )}
            >
              <span className="truncate">{chip.label}</span>
              <X className="size-2.5 opacity-50 transition group-hover:opacity-100" />
            </button>
          ))}
          <Badge tone="neutral" className="ml-auto">
            <ArrowDownUp className="size-2.5" />
            <CornerDownLeft className="size-2.5" />
            <span>Enter to open</span>
          </Badge>
        </div>
      ) : null}
    </div>
  )
}
