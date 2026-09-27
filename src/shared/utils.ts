import { getLanguage, languageLabel } from './languages'
import type { NodePlatform, SnippetDetail } from './types'

export function nowIso(): string {
  return new Date().toISOString()
}

export function toIso(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function uniqueBy<T, K>(items: T[], key: (item: T) => K): T[] {
  const seen = new Set<K>()
  const result: T[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    result.push(item)
  }
  return result
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** Collapses whitespace in the first meaningful line of a code block. */
export function codePreview(code: string, max = 140): string {
  if (!code) return ''
  const lines = code.split('\n')
  for (const line of lines) {
    const collapsed = line.replace(/\s+/g, ' ').trim()
    if (collapsed) return truncate(collapsed, max)
  }
  return ''
}

export function lineCount(code: string): number {
  if (!code) return 0
  return code.split('\n').length
}

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 ? 0 : fractionDigits
  return `${value.toFixed(digits)} ${units[exponent]}`
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'snippet'
  )
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const index = base.lastIndexOf('.')
  return index > 0 ? base.slice(index + 1).toLowerCase() : ''
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim())
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'

  const seconds = Math.round((now.getTime() - then) / 1000)
  const future = seconds < 0
  const magnitude = Math.abs(seconds)

  if (magnitude < 45) return future ? 'in a moment' : 'just now'

  const plural = (value: number, unit: string) => `${value} ${unit}${value === 1 ? '' : 's'}`
  const phrase = (value: number, unit: string) =>
    future ? `in ${plural(value, unit)}` : `${plural(value, unit)} ago`

  if (magnitude < 90) return phrase(1, 'minute')
  if (magnitude < 45 * 60) return phrase(Math.round(magnitude / 60), 'minute')
  if (magnitude < 90 * 60) return phrase(1, 'hour')
  if (magnitude < 22 * 3600) return phrase(Math.round(magnitude / 3600), 'hour')
  if (magnitude < 36 * 3600) return future ? 'tomorrow' : 'yesterday'
  if (magnitude < 7 * 86400) return phrase(Math.round(magnitude / 86400), 'day')
  if (magnitude < 30 * 86400) return phrase(Math.round(magnitude / (7 * 86400)), 'week')
  if (magnitude < 365 * 86400) return phrase(Math.round(magnitude / (30 * 86400)), 'month')
  return phrase(Math.round(magnitude / (365 * 86400)), 'year')
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** `CommandOrControl+Shift+F` → `Ctrl+Shift+F` on Linux/Windows, `⌘⇧F` on macOS. */
export function prettifyAccelerator(accelerator: string, platform: NodePlatform = 'linux'): string {
  const parts = accelerator.split('+')
  return parts
    .map((part) => {
      switch (part.toLowerCase()) {
        case 'commandorcontrol':
        case 'cmdorctrl':
        case 'command':
          return platform === 'darwin' ? '⌘' : 'Ctrl'
        case 'control':
        case 'ctrl':
          return platform === 'darwin' ? '⌃' : 'Ctrl'
        case 'shift':
          return platform === 'darwin' ? '⇧' : 'Shift'
        case 'alt':
        case 'option':
          return platform === 'darwin' ? '⌥' : 'Alt'
        case 'super':
        case 'meta':
          return platform === 'darwin' ? '⌘' : 'Super'
        case 'escape':
          return 'Esc'
        case 'return':
          return 'Enter'
        case 'space':
          return 'Space'
        case 'delete':
          return 'Del'
        default:
          return part.length === 1 ? part.toUpperCase() : part
      }
    })
    .join(platform === 'darwin' ? '' : '+')
}

// --- duplicate detection ----------------------------------------------------

const CODE_NOISE = /[\s]+/g

/** Whitespace-insensitive, case-insensitive form used for duplicate detection. */
export function normalizeCode(code: string): string {
  return code
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(CODE_NOISE, ' ')
    .trim()
    .toLowerCase()
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .split(/[^a-z0-9_$]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  )
}

/**
 * Sørensen–Dice coefficient over word tokens: 1 means identical, 0 means no
 * shared vocabulary. Good enough for "this looks similar" prompts and cheap
 * enough to run against a handful of candidates.
 */
export function codeSimilarity(a: string, b: string): number {
  const left = tokenize(normalizeCode(a))
  const right = tokenize(normalizeCode(b))
  if (left.size === 0 || right.size === 0) return left.size === right.size ? 1 : 0

  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return (2 * shared) / (left.size + right.size)
}

export const DUPLICATE_THRESHOLD = 0.82

// --- markdown rendering -----------------------------------------------------

function fenceFor(code: string): string {
  const longest = (code.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** Everything `snippetToMarkdown` needs — notably only the tag *names*. */
export interface MarkdownRenderInput {
  title: string
  description: string
  code: string
  language: string
  notes: string
  tags: Array<{ name: string }>
  sourceUrl: string
  sourceName: string
}

/** Renders a snippet as portable Markdown (section 40 of the product spec). */
export function snippetToMarkdown(snippet: MarkdownRenderInput): string {
  const parts: string[] = [`# ${snippet.title}`]

  if (snippet.description.trim()) parts.push(snippet.description.trim())

  if (snippet.code.trim()) {
    const fence = fenceFor(snippet.code)
    parts.push('## Code')
    parts.push([`${fence}${getLanguage(snippet.language)?.id ?? ''}`, snippet.code.replace(/\s+$/, ''), fence].join('\n'))
  }

  if (snippet.notes.trim()) parts.push('## Notes', snippet.notes.trim())

  if (snippet.tags.length > 0) {
    parts.push('## Tags', snippet.tags.map((tag) => tag.name).join(', '))
  }

  if (snippet.sourceUrl.trim() || snippet.sourceName.trim()) {
    const label = snippet.sourceName.trim() || snippet.sourceUrl.trim()
    const link = snippet.sourceUrl.trim() ? `[${label}](${snippet.sourceUrl.trim()})` : label
    parts.push('## Source', link)
  }

  return `${parts.join('\n\n')}\n`
}

export function snippetToPlainText(snippet: Pick<SnippetDetail, 'title' | 'description' | 'code' | 'notes' | 'sourceUrl'>): string {
  const parts = [snippet.title]
  if (snippet.description.trim()) parts.push(snippet.description.trim())
  if (snippet.code.trim()) parts.push(snippet.code.replace(/\s+$/, ''))
  if (snippet.notes.trim()) parts.push(snippet.notes.trim())
  if (snippet.sourceUrl.trim()) parts.push(snippet.sourceUrl.trim())
  return `${parts.join('\n\n')}\n`
}

export function snippetDisplayTitle(snippet: { title: string; code: string }): string {
  if (snippet.title.trim()) return snippet.title.trim()
  return codePreview(snippet.code, 60) || 'Untitled snippet'
}

export function languageBadgeLabel(languageId: string | null | undefined): string {
  return languageLabel(languageId)
}
