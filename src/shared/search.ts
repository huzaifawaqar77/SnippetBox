import type { ParsedQuery } from './types'

const TOKEN_PATTERN = /"([^"]*)"|(\S+)/g

/** Normalises `2026-01-01` / `2026-01-01T10:30` into an ISO string, else null. */
function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00.000Z`)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

export function emptyParsedQuery(): ParsedQuery {
  return {
    terms: [],
    phrases: [],
    tags: [],
    languages: [],
    collections: [],
    isFavorite: false,
    isRecent: false,
    before: null,
    after: null
  }
}

/**
 * Parses the search box into free text plus structured operators.
 *
 * Supported: `tag:`, `language:`/`lang:`, `collection:`/`col:`, `is:favorite`,
 * `is:recent`, `before:`, `after:` and quoted phrases. Unknown `key:value` pairs
 * deliberately fall through to free text so a search for `http://x` still works.
 */
export function parseSearchQuery(input: string): ParsedQuery {
  const parsed = emptyParsedQuery()
  const source = input ?? ''
  if (!source.trim()) return parsed

  TOKEN_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TOKEN_PATTERN.exec(source)) !== null) {
    const quoted = match[1]
    if (quoted !== undefined) {
      const phrase = quoted.trim()
      if (phrase) parsed.phrases.push(phrase)
      continue
    }

    const token = match[2]
    if (!token) continue

    const separator = token.indexOf(':')
    if (separator > 0) {
      const key = token.slice(0, separator).toLowerCase()
      const value = token.slice(separator + 1)
      if (!value) {
        parsed.terms.push(token.toLowerCase())
        continue
      }
      switch (key) {
        case 'tag':
          parsed.tags.push(value.toLowerCase())
          continue
        case 'language':
        case 'lang':
          parsed.languages.push(value.toLowerCase())
          continue
        case 'collection':
        case 'col':
          parsed.collections.push(value.toLowerCase())
          continue
        case 'is': {
          const flag = value.toLowerCase()
          if (flag === 'favorite' || flag === 'favourite' || flag === 'starred') {
            parsed.isFavorite = true
          } else if (flag === 'recent') {
            parsed.isRecent = true
          } else {
            parsed.terms.push(token.toLowerCase())
          }
          continue
        }
        case 'before': {
          const date = normalizeDate(value)
          if (date) parsed.before = date
          else parsed.terms.push(token.toLowerCase())
          continue
        }
        case 'after': {
          const date = normalizeDate(value)
          if (date) parsed.after = date
          else parsed.terms.push(token.toLowerCase())
          continue
        }
        default:
          parsed.terms.push(token.toLowerCase())
          continue
      }
    }

    parsed.terms.push(token.toLowerCase())
  }

  return parsed
}

export function hasStructuredFilters(parsed: ParsedQuery): boolean {
  return (
    parsed.tags.length > 0 ||
    parsed.languages.length > 0 ||
    parsed.collections.length > 0 ||
    parsed.isFavorite ||
    parsed.isRecent ||
    parsed.before !== null ||
    parsed.after !== null
  )
}

export function isQueryEmpty(parsed: ParsedQuery): boolean {
  return parsed.terms.length === 0 && parsed.phrases.length === 0 && !hasStructuredFilters(parsed)
}

const FTS_UNSAFE = /["^*(){}:]/g

/**
 * Converts parsed free text into an FTS5 MATCH expression. Every term is quoted
 * (so operator keywords like NOT/AND are treated as literals) and prefix-matched
 * so typing `dock` already finds `docker`.
 */
export function buildFtsMatch(parsed: ParsedQuery): string | null {
  const parts: string[] = []

  for (const term of parsed.terms) {
    const cleaned = term.replace(FTS_UNSAFE, ' ').trim()
    if (cleaned) parts.push(`"${cleaned.replace(/"/g, '""')}"*`)
  }

  for (const phrase of parsed.phrases) {
    const cleaned = phrase.replace(FTS_UNSAFE, ' ').trim()
    if (cleaned) parts.push(`"${cleaned.replace(/"/g, '""')}"`)
  }

  if (parts.length === 0) return null
  return parts.join(' AND ')
}

export interface QueryChip {
  kind: 'term' | 'phrase' | 'tag' | 'language' | 'collection' | 'flag' | 'range'
  label: string
  value: string
}

/** Renders parsed filters as removable chips in the search bar. */
export function describeQuery(parsed: ParsedQuery, resolveNames?: (parsed: ParsedQuery) => Partial<Record<'tags' | 'languages' | 'collections', string[]>>): QueryChip[] {
  const resolved = resolveNames?.(parsed) ?? {}
  const chips: QueryChip[] = []

  parsed.terms.forEach((term, index) => chips.push({ kind: 'term', label: term, value: `term:${index}` }))
  parsed.phrases.forEach((phrase, index) => chips.push({ kind: 'phrase', label: `"${phrase}"`, value: `phrase:${index}` }))

  parsed.tags.forEach((tag, index) =>
    chips.push({ kind: 'tag', label: resolved.tags?.[index] ?? tag, value: `tag:${index}` })
  )
  parsed.languages.forEach((language, index) =>
    chips.push({ kind: 'language', label: resolved.languages?.[index] ?? language, value: `language:${index}` })
  )
  parsed.collections.forEach((collection, index) =>
    chips.push({ kind: 'collection', label: resolved.collections?.[index] ?? collection, value: `collection:${index}` })
  )

  if (parsed.isFavorite) chips.push({ kind: 'flag', label: 'Favorites', value: 'is:favorite' })
  if (parsed.isRecent) chips.push({ kind: 'flag', label: 'Recent', value: 'is:recent' })
  if (parsed.after) chips.push({ kind: 'range', label: `after ${parsed.after.slice(0, 10)}`, value: 'after' })
  if (parsed.before) chips.push({ kind: 'range', label: `before ${parsed.before.slice(0, 10)}`, value: 'before' })

  return chips
}
