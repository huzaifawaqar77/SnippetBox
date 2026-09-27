import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getLanguage } from '@shared/languages'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export {
  clamp,
  codePreview,
  codeSimilarity,
  formatBytes,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  hostnameOf,
  isHttpUrl,
  lineCount,
  prettifyAccelerator,
  slugify,
  snippetToMarkdown,
  snippetToPlainText,
  truncate,
  uniqueBy
} from '@shared/utils'

export { detectLanguage, getLanguage, languageLabel, LANGUAGES, resolveLanguageId } from '@shared/languages'

/** '2 hours ago' plus the exact timestamp for the tooltip. */
export function relativeWithTitle(iso: string | null | undefined): { label: string; title: string } {
  const label = formatRelativeTimeSafe(iso)
  const title = iso ? new Date(iso).toLocaleString() : 'Never'
  return { label, title }
}

function formatRelativeTimeSafe(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 90) return '1 minute ago'
  if (seconds < 2700) return `${Math.round(seconds / 60)} minutes ago`
  if (seconds < 5400) return '1 hour ago'
  if (seconds < 79_200) return `${Math.round(seconds / 3600)} hours ago`
  if (seconds < 129_600) return 'yesterday'
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)} days ago`
  if (seconds < 2_592_000) return `${Math.round(seconds / 604_800)} weeks ago`
  if (seconds < 31_536_000) return `${Math.round(seconds / 2_592_000)} months ago`
  return `${Math.round(seconds / 31_536_000)} years ago`
}

/** Colour used for a language dot / badge, always readable on any surface. */
export function languageColor(languageId: string | null | undefined): string {
  return getLanguage(languageId)?.color ?? '#94A3B8'
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Parses a `#rrggbb` (or `#rgb`) colour into rgb components for soft backgrounds. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null

  let value = match[1]!
  if (value.length === 3) {
    value = value
      .split('')
      .map((character) => character + character)
      .join('')
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

export function softColor(hex: string, alpha = 0.14): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'transparent'
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function readableOn(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  // Perceived luminance — keeps tag text readable on light tag colours.
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.66 ? '#1f2937' : '#ffffff'
}
