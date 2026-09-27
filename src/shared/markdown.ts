import type { ImportCandidate } from './types'
import { detectLanguage, resolveLanguageId } from './languages'

/**
 * Parses the Markdown dialect produced by `snippetToMarkdown` (and the very
 * similar shape people paste out of GitHub READMEs).
 *
 * Layout:
 *
 *     # Title
 *     description…
 *
 *     ```lang
 *     code
 *     ```
 *
 *     ## Notes
 *     …
 *     ## Tags
 *     a, b
 *     ## Source
 *     [label](https://…)
 */

const FENCE_PATTERN = /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/

/**
 * Only these `##` headings start a new section.
 *
 * Anything else is treated as ordinary content, which is what makes notes that
 * contain their own `## Why this works` headings round-trip correctly instead of
 * silently truncating.
 */
const KNOWN_SECTIONS = new Set(['code', 'notes', 'tags', 'source'])

export function parseMarkdownSnippet(markdown: string, origin = ''): ImportCandidate | null {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')

  let title = ''
  let titleIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const match = /^#\s+(.+?)\s*$/.exec(lines[i]!)
    if (match) {
      title = match[1]!.trim()
      titleIndex = i
      break
    }
  }

  const descriptionLines: string[] = []
  let code = ''
  let codeLanguage = ''
  const sections = new Map<string, string[]>()

  let cursor = titleIndex + 1
  let currentSection: string | null = null
  let inFence = false
  let fenceMarker = ''
  let codeLines: string[] = []

  const pushLine = (line: string): void => {
    if (inFence) {
      codeLines.push(line)
      return
    }
    if (currentSection) {
      const bucket = sections.get(currentSection)
      if (bucket) bucket.push(line)
      else sections.set(currentSection, [line])
      return
    }
    descriptionLines.push(line)
  }

  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor]!
    const fence = FENCE_PATTERN.exec(line)

    if (inFence) {
      if (fence && line.trim().startsWith(fenceMarker)) {
        inFence = false
        code = codeLines.join('\n').replace(/\s+$/, '')
        codeLines = []
        continue
      }
      codeLines.push(line)
      continue
    }

    if (fence) {
      // A fence before any code block is *the* snippet, not an example inside prose.
      if (!code) {
        inFence = true
        fenceMarker = fence[2]!
        codeLanguage = fence[3] ?? ''
        continue
      }
      pushLine(line)
      continue
    }

    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      const name = heading[1]!.trim().toLowerCase()
      if (KNOWN_SECTIONS.has(name)) {
        currentSection = name
        if (!sections.has(currentSection)) sections.set(currentSection, [])
        continue
      }
      // An unrecognised heading belongs to whatever section we are already in.
    }

    pushLine(line)
  }

  if (inFence) {
    code = codeLines.join('\n').replace(/\s+$/, '')
  }

  const description = descriptionLines.join('\n').trim()
  const notes = (sections.get('notes') ?? []).join('\n').trim()
  const tagsLine = (sections.get('tags') ?? []).join(' ').trim()
  const tags = tagsLine
    .split(/[,\s]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)

  const sourceText = (sections.get('source') ?? []).join('\n').trim()
  const linkMatch = /\[([^\]]*)\]\(([^)]+)\)/.exec(sourceText)
  const sourceUrl = linkMatch ? linkMatch[2]!.trim() : /^https?:\/\/\S+$/.test(sourceText) ? sourceText : ''
  const sourceName = linkMatch ? linkMatch[1]!.trim() : sourceUrl ? '' : sourceText.split('\n')[0]!.trim()

  const fallbackTitle = origin ? origin.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '') : ''
  const resolvedTitle = title || fallbackTitle

  if (!resolvedTitle && !code) return null

  const resolvedLanguage =
    resolveLanguageId(codeLanguage) ?? detectLanguage(code, origin) ?? (code ? 'plaintext' : 'markdown')

  return {
    title: resolvedTitle || 'Untitled snippet',
    description,
    code,
    language: resolvedLanguage,
    tags,
    notes,
    sourceUrl: sourceUrl.startsWith('http') ? sourceUrl : '',
    sourceName,
    origin
  }
}

/** Formats a duration/quantity list as a Markdown catalogue (index) file. */
export function renderIndex(entries: Array<{ title: string; file: string; tags: string[]; language: string }>): string {
  const lines = ['# SnippetBox export', '', `${entries.length} snippets.`, '']
  for (const entry of entries) {
    const tags = entry.tags.length > 0 ? ` — ${entry.tags.map((tag) => `\`${tag}\``).join(' ')}` : ''
    lines.push(`- [${entry.title}](${entry.file}) (${entry.language})${tags}`)
  }
  return `${lines.join('\n')}\n`
}
