import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type {
  ExportResult,
  ImportCandidate,
  ImportPreview,
  ImportResult,
  SnippetDetail,
  SnippetListOptions
} from '@shared/types'
import { LANGUAGES, detectLanguage, languageFromFilename } from '@shared/languages'
import { parseMarkdownSnippet, renderIndex } from '@shared/markdown'
import { DUPLICATE_THRESHOLD, codeSimilarity, slugify, snippetToMarkdown } from '@shared/utils'
import { AppError } from '../utils'
import { createSnippet, findByTitle, findSimilar, getSnippet, listSnippetDetails } from '../db/repositories/snippets'
import { ensureDir } from './paths'
import { isZipFile, listZipEntries, readZip, readZipEntry, writeZip, type ZipEntryInput } from './zip'

const MAX_EXPORT_SNIPPETS = 5000
const MAX_IMPORT_FILES = 2000
const MAX_TEXT_FILE_BYTES = 4 * 1024 * 1024
const MAX_JSON_FILE_BYTES = 64 * 1024 * 1024

/** Extensions we are willing to read as plain-text snippet imports. */
const TEXT_EXTENSIONS = new Set<string>(
  LANGUAGES.flatMap((language) => language.extensions).concat(['txt', 'text', 'md', 'markdown'])
)

export interface ExportRecord {
  title: string
  description: string
  language: string
  code: string
  tags: string[]
  notes: string
  sourceUrl: string
  sourceName: string
  sourceAuthor: string
  sourceFoundAt: string | null
  collection: string | null
  favorite: boolean
  createdAt: string
  updatedAt: string
  openCount: number
  copyCount: number
  attachments?: Array<{ filename: string; archivePath: string }>
}

export interface ExportEnvelope {
  app: 'SnippetBox'
  schema: 1
  exportedAt: string
  count: number
  snippets: ExportRecord[]
}

function toRecord(snippet: SnippetDetail): ExportRecord {
  return {
    title: snippet.title,
    description: snippet.description,
    language: snippet.language,
    code: snippet.code,
    tags: snippet.tags.map((tag) => tag.name),
    notes: snippet.notes,
    sourceUrl: snippet.sourceUrl,
    sourceName: snippet.sourceName,
    sourceAuthor: snippet.sourceAuthor,
    sourceFoundAt: snippet.sourceFoundAt,
    collection: snippet.collectionName,
    favorite: snippet.favorite,
    createdAt: snippet.createdAt,
    updatedAt: snippet.updatedAt,
    openCount: snippet.openCount,
    copyCount: snippet.copyCount
  }
}

function envelope(snippets: SnippetDetail[], records?: ExportRecord[]): ExportEnvelope {
  return {
    app: 'SnippetBox',
    schema: 1,
    exportedAt: new Date().toISOString(),
    count: snippets.length,
    snippets: records ?? snippets.map(toRecord)
  }
}

export function collectForExport(request: { view: SnippetListOptions['view']; ids?: string[]; query?: string }): SnippetDetail[] {
  if (request.ids && request.ids.length > 0) {
    return request.ids
      .slice(0, MAX_EXPORT_SNIPPETS)
      .map((id) => getSnippet(id))
      .filter((snippet): snippet is SnippetDetail => snippet !== null)
  }

  return listSnippetDetails({
    view: request.view,
    query: request.query ?? '',
    limit: MAX_EXPORT_SNIPPETS,
    includeTrashed: request.view === 'trash'
  })
}

function uniqueFileNames(snippets: SnippetDetail[]): Map<string, string> {
  const used = new Set<string>()
  const names = new Map<string, string>()

  for (const snippet of snippets) {
    const base = slugify(snippet.title)
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}-${suffix++}`
    }
    used.add(candidate)
    names.set(snippet.id, `${candidate}.md`)
  }

  return names
}

/**
 * Writes an export to `destination`.
 *
 * - `json`     → a single .json file (`destination` is a file path)
 * - `markdown` → a folder containing one .md per snippet plus metadata.json
 * - `zip`      → a single .zip with snippets/*.md, metadata.json and attachments
 */
export function exportSnippets(request: {
  format: 'json' | 'markdown' | 'zip'
  view: SnippetListOptions['view']
  ids?: string[]
  query?: string
  includeAttachments?: boolean
  destination: string
}): ExportResult {
  const snippets = collectForExport(request)
  if (snippets.length === 0) {
    throw new AppError('There is nothing to export in this view.', {
      code: 'VALIDATION',
      hint: 'Pick a view that contains snippets, or select some first.'
    })
  }

  const names = uniqueFileNames(snippets)

  if (request.format === 'json') {
    writeFileSync(request.destination, `${JSON.stringify(envelope(snippets), null, 2)}\n`, 'utf8')
    return { count: snippets.length, path: request.destination }
  }

  if (request.format === 'markdown') {
    const directory = ensureDir(request.destination)
    for (const snippet of snippets) {
      writeFileSync(join(directory, names.get(snippet.id)!), snippetToMarkdown(snippet), 'utf8')
    }
    writeFileSync(join(directory, 'metadata.json'), `${JSON.stringify(envelope(snippets), null, 2)}\n`, 'utf8')
    writeFileSync(
      join(directory, 'index.md'),
      renderIndex(
        snippets.map((snippet) => ({
          title: snippet.title,
          file: names.get(snippet.id)!,
          tags: snippet.tags.map((tag) => tag.name),
          language: snippet.language
        }))
      ),
      'utf8'
    )
    return { count: snippets.length, path: directory }
  }

  // --- zip ---
  const records = snippets.map(toRecord)
  const entries: ZipEntryInput[] = []

  snippets.forEach((snippet, index) => {
    entries.push({ path: `snippets/${names.get(snippet.id)!}`, data: Buffer.from(snippetToMarkdown(snippet), 'utf8') })

    if (request.includeAttachments && snippet.attachments.length > 0) {
      const attachments: Array<{ filename: string; archivePath: string }> = []
      for (const attachment of snippet.attachments) {
        if (!existsSync(attachment.path)) continue
        const archivePath = `attachments/${snippet.id.slice(0, 8)}/${attachment.filename}`
        entries.push({ path: archivePath, filePath: attachment.path })
        attachments.push({ filename: attachment.filename, archivePath })
      }
      if (attachments.length > 0) records[index]!.attachments = attachments
    }
  })

  entries.push({ path: 'metadata.json', data: Buffer.from(`${JSON.stringify(envelope(snippets, records), null, 2)}\n`, 'utf8') })
  entries.push({
    path: 'index.md',
    data: Buffer.from(
      renderIndex(
        snippets.map((snippet) => ({
          title: snippet.title,
          file: `snippets/${names.get(snippet.id)!}`,
          tags: snippet.tags.map((tag) => tag.name),
          language: snippet.language
        }))
      ),
      'utf8'
    )
  })

  writeZip(entries, request.destination)
  return { count: snippets.length, path: request.destination }
}

// --- import -----------------------------------------------------------------

function normalizeTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return []
}

function stringField(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string') return value
  }
  return ''
}

function normalizeRecord(raw: unknown, origin: string): ImportCandidate | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>

  const title = stringField(source, 'title', 'name', 'snippet', 'heading').trim()
  const code = stringField(source, 'code', 'snippet', 'body', 'content', 'source')
  const description = stringField(source, 'description', 'desc', 'summary', 'comment')
  const notes = stringField(source, 'notes', 'note')
  const sourceUrl = stringField(source, 'sourceUrl', 'source_url', 'url', 'link')
  const sourceName = stringField(source, 'sourceName', 'source_name', 'source')
  const languageToken = stringField(source, 'language', 'lang', 'syntax')

  if (!title && !code) return null

  const resolvedLanguage =
    LANGUAGES.find((language) => language.id === languageToken.toLowerCase() || language.label.toLowerCase() === languageToken.toLowerCase())?.id ??
    detectLanguage(code, origin) ??
    'plaintext'

  return {
    title: title || code.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 80) || 'Imported snippet',
    description,
    code,
    language: resolvedLanguage,
    tags: normalizeTagList(source.tags ?? source.tag),
    notes,
    sourceUrl: sourceUrl.startsWith('http') ? sourceUrl : '',
    sourceName: sourceName.startsWith('http') ? '' : sourceName,
    origin
  }
}

function candidatesFromJson(text: string, origin: string): ImportCandidate[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AppError(`“${basename(origin)}” is not valid JSON.`, {
      code: 'VALIDATION',
      hint: 'Export a fresh copy from SnippetBox and try again.'
    })
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { snippets?: unknown }).snippets)
      ? ((parsed as { snippets: unknown[] }).snippets ?? [])
      : [parsed]

  return list
    .map((item) => normalizeRecord(item, origin))
    .filter((candidate): candidate is ImportCandidate => candidate !== null)
}

function candidatesFromZip(file: string): ImportCandidate[] {
  const entries = listZipEntries(file)
  const metadata = entries.find((entry) => entry.path === 'metadata.json')

  if (metadata) {
    try {
      const parsed = JSON.parse(readZipEntry(file, metadata).toString('utf8')) as { snippets?: unknown[] }
      if (Array.isArray(parsed.snippets)) {
        const candidates = parsed.snippets
          .map((item) => normalizeRecord(item, file))
          .filter((candidate): candidate is ImportCandidate => candidate !== null)
        if (candidates.length > 0) return candidates
      }
    } catch {
      // Fall through to reading the Markdown files instead.
    }
  }

  return entries
    .filter((entry) => /\.(md|markdown)$/i.test(entry.path))
    .map((entry) => parseMarkdownSnippet(readZipEntry(file, entry).toString('utf8'), entry.path))
    .filter((candidate): candidate is ImportCandidate => candidate !== null)
}

function isTextImportable(path: string): boolean {
  const extension = extname(path).slice(1).toLowerCase()
  return TEXT_EXTENSIONS.has(extension)
}

function candidatesFromFile(path: string): ImportCandidate[] {
  const extension = extname(path).toLowerCase()

  if (extension === '.json') {
    if (statSync(path).size > MAX_JSON_FILE_BYTES) {
      throw new AppError(`“${basename(path)}” is too large to import.`, { code: 'VALIDATION' })
    }
    return candidatesFromJson(readFileSync(path, 'utf8'), path)
  }

  if (extension === '.zip') return candidatesFromZip(path)

  if (extension === '.md' || extension === '.markdown') {
    const parsed = parseMarkdownSnippet(readFileSync(path, 'utf8'), path)
    return parsed ? [parsed] : []
  }

  if (!isTextImportable(path)) return []
  if (statSync(path).size > MAX_TEXT_FILE_BYTES) return []

  const code = readFileSync(path, 'utf8')
  if (!code.trim()) return []

  const name = basename(path)
  return [
    {
      title: name.replace(/\.[^.]+$/, ''),
      description: '',
      code,
      language: languageFromFilename(name) ?? detectLanguage(code, name) ?? 'plaintext',
      tags: [],
      notes: '',
      sourceUrl: '',
      sourceName: '',
      origin: path
    }
  ]
}

function walk(target: string, depth = 0): string[] {
  const stats = statSync(target)
  if (stats.isFile()) return [target]
  if (!stats.isDirectory() || depth > 4) return []

  const found: string[] = []
  for (const entry of readdirSync(target)) {
    if (entry.startsWith('.')) continue
    found.push(...walk(join(target, entry), depth + 1))
    if (found.length > MAX_IMPORT_FILES) break
  }
  return found
}

/**
 * Reads import sources and reports what would be created, flagging anything
 * that looks like it already exists. Nothing is written to the database.
 */
export function previewImport(paths: string[]): ImportPreview {
  const candidates: ImportCandidate[] = []
  let skipped = 0

  for (const path of paths) {
    if (!existsSync(path)) {
      skipped += 1
      continue
    }

    let files: string[]
    try {
      files = walk(path).slice(0, MAX_IMPORT_FILES)
    } catch {
      skipped += 1
      continue
    }

    for (const file of files) {
      try {
        const found = candidatesFromFile(file)
        if (found.length === 0) skipped += 1
        candidates.push(...found)
      } catch {
        skipped += 1
      }
    }
  }

  const duplicates: ImportPreview['duplicates'] = []

  for (const candidate of candidates) {
    const titleMatch = candidate.title ? findByTitle(candidate.title) : null
    if (titleMatch) {
      duplicates.push({
        candidateTitle: candidate.title,
        existingId: titleMatch.id,
        existingTitle: titleMatch.title
      })
      continue
    }

    if (candidate.code.trim().length >= 30) {
      const similar = findSimilar({ code: candidate.code })
      const best = similar[0]
      if (best) {
        duplicates.push({
          candidateTitle: candidate.title,
          existingId: best.id,
          existingTitle: best.title
        })
      }
    }
  }

  return {
    candidates: candidates.slice(0, MAX_IMPORT_FILES),
    duplicates,
    skipped
  }
}

export function commitImport(candidates: ImportCandidate[]): ImportResult {
  let imported = 0
  let skipped = 0

  for (const candidate of candidates) {
    try {
      createSnippet({
        title: candidate.title.trim() || 'Imported snippet',
        description: candidate.description ?? '',
        code: candidate.code ?? '',
        language: candidate.language || 'plaintext',
        notes: candidate.notes ?? '',
        sourceUrl: candidate.sourceUrl ?? '',
        sourceName: candidate.sourceName ?? '',
        tagNames: candidate.tags ?? []
      })
      imported += 1
    } catch {
      skipped += 1
    }
  }

  return { imported, skipped }
}

export function similarityOf(a: string, b: string): number {
  return codeSimilarity(a, b)
}

export { DUPLICATE_THRESHOLD, readZip, isZipFile }
