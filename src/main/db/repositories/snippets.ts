import type {
  SnippetCreateInput,
  SnippetDetail,
  SnippetListOptions,
  SnippetListResult,
  SnippetSummary,
  SnippetUpdateInput,
  SnippetVersion,
  SimilarSnippet,
  SortKey,
  Tag,
  UsageStats
} from '@shared/types'
import { DEFAULT_SORT, RECENT_WINDOW_DAYS } from '@shared/constants'
import { buildFtsMatch, parseSearchQuery } from '@shared/search'
import { resolveLanguageId } from '@shared/languages'
import { DUPLICATE_THRESHOLD, codeSimilarity } from '@shared/utils'
import { getDb, stmt } from '..'
import { AppError, newId, notFound } from '../../utils'
import {
  attachmentsForSnippets,
  deriveColumns,
  mapAttachment,
  mapTag,
  refreshSearchColumns,
  relatedForSnippets,
  setSnippetTags,
  snippetTagNames,
  tagsForSnippets,
  type AttachmentRow,
  type TagRow
} from './helpers'

/** Minimum gap between automatically captured versions of the same snippet. */
export const VERSION_THROTTLE_MS = 60_000
/** Hard cap on retained versions per snippet. */
export const MAX_VERSIONS_PER_SNIPPET = 50

/** bm25 column weights: title > tags > description > code > notes. */
const BM25 = 'bm25(snippets_fts, 10.0, 4.0, 1.5, 1.0, 6.0, 2.0, 1.0)'

const SUMMARY_COLUMNS = `
  s.id, s.title, s.description, s.language, s.favorite, s.collection_id,
  c.name AS collection_name, s.created_at, s.updated_at, s.last_opened_at,
  s.open_count, s.copy_count, s.deleted_at, s.code_preview, s.line_count, s.has_notes,
  (SELECT COUNT(*) FROM snippet_versions v WHERE v.snippet_id = s.id) AS version_count
`

interface SummaryRow {
  id: string
  title: string
  description: string
  language: string
  favorite: number
  collection_id: string | null
  collection_name: string | null
  created_at: string
  updated_at: string
  last_opened_at: string | null
  open_count: number
  copy_count: number
  deleted_at: string | null
  code_preview: string
  line_count: number
  has_notes: number
  version_count: number
}

interface DetailRow extends SummaryRow {
  code: string
  notes: string
  source_url: string
  source_name: string
  source_author: string
  source_found_at: string | null
}

function mapSummary(row: SummaryRow, tags: Tag[]): SnippetSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    language: row.language,
    favorite: row.favorite === 1,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    openCount: row.open_count,
    copyCount: row.copy_count,
    deletedAt: row.deleted_at,
    tags,
    codePreview: row.code_preview,
    lineCount: row.line_count,
    hasNotes: row.has_notes === 1,
    versionCount: row.version_count
  }
}

// --- listing & search -------------------------------------------------------

interface ListPlan {
  from: string
  where: string[]
  params: unknown[]
  orderBy: string
}

const ORDER_BY: Record<SortKey, string> = {
  relevance: `${BM25} ASC, s.updated_at DESC`,
  // rowid tiebreakers keep ordering stable when rows share a timestamp.
  updated: 's.updated_at DESC, s.rowid DESC',
  created: 's.created_at DESC, s.rowid DESC',
  title: 's.title COLLATE NOCASE ASC',
  opened: 's.last_opened_at IS NULL ASC, s.last_opened_at DESC, s.updated_at DESC',
  copies: 's.copy_count DESC, s.updated_at DESC'
}

function scopeFilters(options: SnippetListOptions): { where: string[]; params: unknown[] } {
  const where: string[] = []
  const params: unknown[] = []

  if (options.view === 'trash' || options.includeTrashed) {
    where.push('s.deleted_at IS NOT NULL')
  } else {
    where.push('s.deleted_at IS NULL')
  }

  if (options.view === 'favorites') where.push('s.favorite = 1')

  if (options.view === 'recent-opened') where.push('s.last_opened_at IS NOT NULL')

  if (options.language) {
    where.push('s.language = ?')
    params.push(options.language)
  }

  if (options.favorite) where.push('s.favorite = 1')

  if (options.collectionId) {
    where.push('s.collection_id = ?')
    params.push(options.collectionId)
  }

  for (const tagId of options.tagIds ?? []) {
    where.push('EXISTS (SELECT 1 FROM snippet_tags filter_st WHERE filter_st.snippet_id = s.id AND filter_st.tag_id = ?)')
    params.push(tagId)
  }

  return { where, params }
}

function operatorFilters(options: SnippetListOptions): { where: string[]; params: unknown[] } {
  const parsed = parseSearchQuery(options.query ?? '')
  const where: string[] = []
  const params: unknown[] = []

  for (const tag of parsed.tags) {
    where.push(
      `EXISTS (SELECT 1 FROM snippet_tags qst JOIN tags qt ON qt.id = qst.tag_id
                WHERE qst.snippet_id = s.id AND (lower(qt.name) = ? OR lower(qt.name) LIKE ? || '%'))`
    )
    params.push(tag, tag)
  }

  for (const language of parsed.languages) {
    const resolved = resolveLanguageId(language)
    where.push('(s.language = ? OR lower(s.language) LIKE ? || \'%\')')
    params.push(resolved ?? language, resolved ?? language)
  }

  for (const collection of parsed.collections) {
    where.push(
      `EXISTS (SELECT 1 FROM collections qc
                WHERE qc.id = s.collection_id AND lower(qc.name) LIKE ? || '%')`
    )
    params.push(collection)
  }

  if (parsed.isFavorite) where.push('s.favorite = 1')

  if (parsed.isRecent) {
    const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString()
    where.push('COALESCE(s.last_opened_at, s.updated_at) >= ?')
    params.push(since)
  }

  if (parsed.after) {
    where.push('s.created_at >= ?')
    params.push(parsed.after)
  }

  if (parsed.before) {
    where.push('s.created_at < ?')
    params.push(parsed.before)
  }

  return { where, params }
}

function planList(options: SnippetListOptions): ListPlan {
  const parsed = parseSearchQuery(options.query ?? '')
  const ftsMatch = buildFtsMatch(parsed)

  const from = ftsMatch
    ? 'FROM snippets s JOIN snippets_fts ON snippets_fts.rowid = s.rowid LEFT JOIN collections c ON c.id = s.collection_id'
    : 'FROM snippets s LEFT JOIN collections c ON c.id = s.collection_id'

  const scope = scopeFilters(options)
  const operators = operatorFilters(options)

  const where = [...scope.where, ...operators.where]
  const params = [...scope.params, ...operators.params]

  if (ftsMatch) {
    where.push('snippets_fts MATCH ?')
    params.push(ftsMatch)
  }

  const requestedSort = options.sort ?? (ftsMatch ? 'relevance' : DEFAULT_SORT[options.view])
  const orderBy = requestedSort === 'relevance' && !ftsMatch ? ORDER_BY.updated : ORDER_BY[requestedSort]

  return { from, where, params, orderBy }
}

export function listSnippets(options: SnippetListOptions): SnippetListResult {
  const plan = planList(options)
  const parsed = parseSearchQuery(options.query ?? '')
  const whereSql = plan.where.length > 0 ? `WHERE ${plan.where.join(' AND ')}` : ''
  const limit = options.limit ?? 200
  const offset = options.offset ?? 0

  const rows = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} ${plan.from} ${whereSql} ORDER BY ${plan.orderBy} LIMIT ? OFFSET ?`
    )
    .all(...(plan.params as never[]), limit, offset) as SummaryRow[]

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS total ${plan.from} ${whereSql}`)
      .get(...(plan.params as never[])) as { total: number }
  ).total

  const tagMap = tagsForSnippets(rows.map((row) => row.id))

  return {
    items: rows.map((row) => mapSummary(row, tagMap.get(row.id) ?? [])),
    total,
    parsed
  }
}

// --- detail -----------------------------------------------------------------

export function getSnippet(id: string): SnippetDetail | null {
  const row = stmt(
    `SELECT ${SUMMARY_COLUMNS}, s.code, s.notes, s.source_url, s.source_name, s.source_author, s.source_found_at
       FROM snippets s
       LEFT JOIN collections c ON c.id = s.collection_id
      WHERE s.id = ?`
  ).get(id) as DetailRow | undefined

  if (!row) return null

  const tagRows = stmt(
    `SELECT t.id, t.name, t.color, t.icon, t.created_at
       FROM snippet_tags st JOIN tags t ON t.id = st.tag_id
      WHERE st.snippet_id = ?
      ORDER BY t.name COLLATE NOCASE ASC`
  ).all(id) as TagRow[]

  const attachmentRows = stmt(
    `SELECT id, snippet_id, filename, path, mime_type, size, created_at
       FROM attachments WHERE snippet_id = ? ORDER BY created_at ASC`
  ).all(id) as AttachmentRow[]

  const relatedIds = (
    stmt('SELECT related_id FROM snippet_related WHERE snippet_id = ?').all(id) as Array<{
      related_id: string
    }>
  ).map((related) => related.related_id)

  return {
    ...mapSummary(row, tagRows.map(mapTag)),
    code: row.code,
    notes: row.notes,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    sourceAuthor: row.source_author,
    sourceFoundAt: row.source_found_at,
    relatedIds,
    attachments: attachmentRows.map((attachment) => mapAttachment(attachment, true))
  }
}

export function requireSnippet(id: string): SnippetDetail {
  const snippet = getSnippet(id)
  if (!snippet) throw notFound('That snippet')
  return snippet
}

// --- mutations --------------------------------------------------------------

export function createSnippet(input: SnippetCreateInput): SnippetDetail {
  const id = newId()
  const now = new Date().toISOString()
  const derived = deriveColumns(input.code ?? '', input.notes ?? '')

  stmt(
    `INSERT INTO snippets (
       id, title, description, code, language, notes, collection_id,
       source_url, source_name, source_author, source_found_at,
       favorite, created_at, updated_at, last_opened_at, open_count, copy_count, deleted_at,
       code_preview, line_count, has_notes, search_tags, search_collection
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, NULL, ?, ?, ?, '', '')`
  ).run(
    id,
    input.title.trim(),
    input.description ?? '',
    input.code ?? '',
    input.language || 'plaintext',
    input.notes ?? '',
    input.collectionId ?? null,
    input.sourceUrl ?? '',
    input.sourceName ?? '',
    input.sourceAuthor ?? '',
    input.sourceFoundAt ?? null,
    input.favorite ? 1 : 0,
    now,
    now,
    derived.codePreview,
    derived.lineCount,
    derived.hasNotes
  )

  if (input.tagNames && input.tagNames.length > 0) setSnippetTags(id, input.tagNames)
  if (input.relatedIds && input.relatedIds.length > 0) setRelatedSnippets(id, input.relatedIds)

  return requireSnippet(id)
}

function contentChanged(existing: SnippetDetail, patch: SnippetUpdateInput): boolean {
  if (patch.code !== undefined && patch.code !== existing.code) return true
  if (patch.notes !== undefined && patch.notes !== existing.notes) return true
  if (patch.description !== undefined && patch.description !== existing.description) return true
  if (patch.title !== undefined && patch.title.trim() !== existing.title) return true
  if (patch.language !== undefined && patch.language !== existing.language) return true
  return false
}

function lastVersionAt(snippetId: string): number {
  const row = stmt('SELECT created_at FROM snippet_versions WHERE snippet_id = ? ORDER BY created_at DESC LIMIT 1').get(
    snippetId
  ) as { created_at: string } | undefined
  return row ? Date.parse(row.created_at) : 0
}

/**
 * Records the *current* state of a snippet as a version. Called before a change
 * is applied, so the version list reads as history rather than duplicates.
 */
export function recordVersion(snippet: SnippetDetail, options: { force?: boolean } = {}): SnippetVersion | null {
  if (!options.force) {
    const elapsed = Date.now() - lastVersionAt(snippet.id)
    if (elapsed < VERSION_THROTTLE_MS) return null
  }

  const id = newId()
  const createdAt = new Date().toISOString()
  const tagNames = snippet.tags.map((tag) => tag.name)

  stmt(
    `INSERT INTO snippet_versions (id, snippet_id, title, description, code, language, notes, tag_names, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, snippet.id, snippet.title, snippet.description, snippet.code, snippet.language, snippet.notes, JSON.stringify(tagNames), createdAt)

  // Retain only the newest snapshots so the database cannot grow unbounded.
  stmt(
    `DELETE FROM snippet_versions
      WHERE snippet_id = ?
        AND id NOT IN (
          SELECT id FROM snippet_versions WHERE snippet_id = ? ORDER BY created_at DESC LIMIT ?
        )`
  ).run(snippet.id, snippet.id, MAX_VERSIONS_PER_SNIPPET)

  return {
    id,
    snippetId: snippet.id,
    title: snippet.title,
    description: snippet.description,
    code: snippet.code,
    language: snippet.language,
    notes: snippet.notes,
    tagNames,
    createdAt
  }
}

export function updateSnippet(id: string, patch: SnippetUpdateInput): SnippetDetail {
  const existing = requireSnippet(id)

  if (patch.snapshot && contentChanged(existing, patch)) {
    recordVersion(existing)
  }

  const assignments: string[] = []
  const values: unknown[] = []
  const set = (column: string, value: unknown): void => {
    assignments.push(`${column} = ?`)
    values.push(value)
  }

  if (patch.title !== undefined) set('title', patch.title.trim())
  if (patch.description !== undefined) set('description', patch.description)
  if (patch.language !== undefined) set('language', patch.language)
  if (patch.sourceUrl !== undefined) set('source_url', patch.sourceUrl)
  if (patch.sourceName !== undefined) set('source_name', patch.sourceName)
  if (patch.sourceAuthor !== undefined) set('source_author', patch.sourceAuthor)
  if (patch.sourceFoundAt !== undefined) set('source_found_at', patch.sourceFoundAt)
  if (patch.favorite !== undefined) set('favorite', patch.favorite ? 1 : 0)
  if (patch.collectionId !== undefined) set('collection_id', patch.collectionId)

  if (patch.code !== undefined || patch.notes !== undefined) {
    const derived = deriveColumns(patch.code ?? existing.code, patch.notes ?? existing.notes)
    set('code_preview', derived.codePreview)
    set('line_count', derived.lineCount)
    set('has_notes', derived.hasNotes)
  }

  if (patch.code !== undefined) set('code', patch.code)
  if (patch.notes !== undefined) set('notes', patch.notes)

  if (assignments.length > 0) {
    set('updated_at', new Date().toISOString())
    values.push(id)
    getDb()
      .prepare(`UPDATE snippets SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...(values as never[]))
  }

  if (patch.tagNames !== undefined) setSnippetTags(id, patch.tagNames)
  if (patch.relatedIds !== undefined) setRelatedSnippets(id, patch.relatedIds)
  if (patch.tagNames !== undefined || patch.collectionId !== undefined) refreshSearchColumns(id)

  return requireSnippet(id)
}

export function duplicateSnippet(id: string): SnippetDetail {
  const source = requireSnippet(id)
  return createSnippet({
    title: `${source.title} (copy)`,
    description: source.description,
    code: source.code,
    language: source.language,
    notes: source.notes,
    collectionId: source.collectionId,
    sourceUrl: source.sourceUrl,
    sourceName: source.sourceName,
    sourceAuthor: source.sourceAuthor,
    sourceFoundAt: source.sourceFoundAt,
    favorite: false,
    tagNames: source.tags.map((tag) => tag.name)
  })
}

export function setFavorite(id: string, favorite: boolean): SnippetDetail {
  const existing = requireSnippet(id)
  stmt('UPDATE snippets SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, existing.id)
  return requireSnippet(id)
}

export function trashSnippet(id: string): void {
  const existing = stmt('SELECT id FROM snippets WHERE id = ?').get(id)
  if (!existing) throw notFound('That snippet')
  stmt('UPDATE snippets SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

export function restoreSnippet(id: string): void {
  const existing = stmt('SELECT id FROM snippets WHERE id = ?').get(id)
  if (!existing) throw notFound('That snippet')
  stmt('UPDATE snippets SET deleted_at = NULL WHERE id = ?').run(id)
}

/**
 * Permanently deletes a snippet and returns the attachment files that the
 * caller must remove from disk (the database row is gone either way).
 */
export function destroySnippet(id: string): string[] {
  const existing = stmt('SELECT id FROM snippets WHERE id = ?').get(id)
  if (!existing) throw notFound('That snippet')

  const paths = (
    stmt('SELECT path FROM attachments WHERE snippet_id = ?').all(id) as Array<{ path: string }>
  ).map((row) => row.path)

  stmt('DELETE FROM snippets WHERE id = ?').run(id)
  return paths
}

export function emptyTrash(): { count: number; paths: string[] } {
  const rows = stmt('SELECT id FROM snippets WHERE deleted_at IS NOT NULL').all() as Array<{ id: string }>
  const paths = (
    stmt(
      `SELECT a.path FROM attachments a
        JOIN snippets s ON s.id = a.snippet_id
       WHERE s.deleted_at IS NOT NULL`
    ).all() as Array<{ path: string }>
  ).map((row) => row.path)

  getDb().prepare('DELETE FROM snippets WHERE deleted_at IS NOT NULL').run()
  return { count: rows.length, paths }
}

export function recordOpen(id: string): void {
  stmt('UPDATE snippets SET last_opened_at = ?, open_count = open_count + 1 WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
}

export function recordCopy(id: string): void {
  stmt('UPDATE snippets SET copy_count = copy_count + 1 WHERE id = ?').run(id)
}

// --- relations --------------------------------------------------------------

/**
 * Related snippets are symmetric: relating A→B also makes B→A so the
 * relationship is visible from either side.
 */
export function setRelatedSnippets(id: string, relatedIds: string[]): void {
  const unique = [...new Set(relatedIds.filter((relatedId) => relatedId !== id))]

  for (const relatedId of unique) {
    if (!stmt('SELECT id FROM snippets WHERE id = ?').get(relatedId)) {
      throw new AppError('One of the related snippets no longer exists.', { code: 'NOT_FOUND' })
    }
  }

  const db = getDb()
  db.transaction(() => {
    const previous = (
      db.prepare('SELECT related_id FROM snippet_related WHERE snippet_id = ?').all(id) as Array<{
        related_id: string
      }>
    ).map((row) => row.related_id)

    db.prepare('DELETE FROM snippet_related WHERE snippet_id = ?').run(id)

    const link = db.prepare('INSERT OR IGNORE INTO snippet_related (snippet_id, related_id) VALUES (?, ?)')
    for (const relatedId of unique) {
      link.run(id, relatedId)
      link.run(relatedId, id)
    }

    // Drop the reverse links we no longer own.
    const unlink = db.prepare('DELETE FROM snippet_related WHERE snippet_id = ? AND related_id = ?')
    for (const removed of previous.filter((relatedId) => !unique.includes(relatedId))) {
      unlink.run(removed, id)
    }
  })()
}

// --- versions ---------------------------------------------------------------

export function listVersions(snippetId: string): SnippetVersion[] {
  requireSnippet(snippetId)
  const rows = stmt(
    'SELECT id, snippet_id, title, description, code, language, notes, tag_names, created_at FROM snippet_versions WHERE snippet_id = ? ORDER BY created_at DESC'
  ).all(snippetId) as Array<{
    id: string
    snippet_id: string
    title: string
    description: string
    code: string
    language: string
    notes: string
    tag_names: string
    created_at: string
  }>

  return rows.map((row) => {
    let tagNames: string[] = []
    try {
      const parsed = JSON.parse(row.tag_names)
      if (Array.isArray(parsed)) tagNames = parsed.filter((value): value is string => typeof value === 'string')
    } catch {
      tagNames = []
    }

    return {
      id: row.id,
      snippetId: row.snippet_id,
      title: row.title,
      description: row.description,
      code: row.code,
      language: row.language,
      notes: row.notes,
      tagNames,
      createdAt: row.created_at
    }
  })
}

/** Restores an old version, keeping the current state recoverable first. */
export function restoreVersion(versionId: string): SnippetDetail {
  const row = stmt(
    'SELECT id, snippet_id, title, description, code, language, notes, tag_names FROM snippet_versions WHERE id = ?'
  ).get(versionId) as
    | {
        id: string
        snippet_id: string
        title: string
        description: string
        code: string
        language: string
        notes: string
        tag_names: string
      }
    | undefined

  if (!row) throw notFound('That version')

  const snippet = requireSnippet(row.snippet_id)
  recordVersion(snippet, { force: true })

  let tagNames: string[] = []
  try {
    const parsed = JSON.parse(row.tag_names)
    if (Array.isArray(parsed)) tagNames = parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    tagNames = []
  }

  return updateSnippet(row.snippet_id, {
    title: row.title || snippet.title,
    description: row.description,
    code: row.code,
    language: row.language || 'plaintext',
    notes: row.notes,
    tagNames
  })
}

// --- duplicate detection ----------------------------------------------------

export function findSimilar(input: { code: string; language?: string; excludeId?: string }): SimilarSnippet[] {
  const code = input.code ?? ''
  if (code.trim().length < 30) return []

  const min = Math.floor(code.length * 0.5)
  const max = Math.ceil(code.length * 2)

  const rows = getDb()
    .prepare(
      `SELECT id, title, code FROM snippets
        WHERE deleted_at IS NULL AND code != '' AND length(code) BETWEEN ? AND ?
          ${input.excludeId ? 'AND id != ?' : ''}
        ORDER BY updated_at DESC
        LIMIT 400`
    )
    .all(...([min, max, ...(input.excludeId ? [input.excludeId] : [])] as never[])) as Array<{
    id: string
    title: string
    code: string
  }>

  return rows
    .map((row) => ({ id: row.id, title: row.title, score: codeSimilarity(code, row.code) }))
    .filter((candidate) => candidate.score >= DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

// --- statistics -------------------------------------------------------------

export function usageStats(storageBytes = 0): UsageStats {
  const db = getDb()
  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed,
         SUM(CASE WHEN favorite = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS favorites,
         COALESCE(SUM(copy_count), 0) AS copies
       FROM snippets`
    )
    .get() as { total: number; trashed: number | null; favorites: number | null; copies: number }

  const tagCount = (db.prepare('SELECT COUNT(*) AS c FROM tags').get() as { c: number }).c
  const collectionCount = (db.prepare('SELECT COUNT(*) AS c FROM collections').get() as { c: number }).c

  const languages = db
    .prepare(
      `SELECT language, COUNT(*) AS count FROM snippets
        WHERE deleted_at IS NULL GROUP BY language ORDER BY count DESC LIMIT 8`
    )
    .all() as Array<{ language: string; count: number }>

  return {
    totalSnippets: counts.total - (counts.trashed ?? 0),
    totalTags: tagCount,
    totalCollections: collectionCount,
    trashedSnippets: counts.trashed ?? 0,
    favoriteSnippets: counts.favorites ?? 0,
    totalCopies: counts.copies,
    languages,
    storageBytes
  }
}

export function attachmentPathsForSnippets(ids: string[]): string[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return (
    getDb()
      .prepare(`SELECT path FROM attachments WHERE snippet_id IN (${placeholders})`)
      .all(...(ids as never[])) as Array<{ path: string }>
  ).map((row) => row.path)
}

export function snippetsByIds(ids: string[]): SnippetSummary[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM snippets s
        LEFT JOIN collections c ON c.id = s.collection_id
       WHERE s.id IN (${placeholders})`
    )
    .all(...(ids as never[])) as SummaryRow[]
  const tagMap = tagsForSnippets(rows.map((row) => row.id))
  return rows.map((row) => mapSummary(row, tagMap.get(row.id) ?? []))
}

/**
 * Loads full records (including code and attachments) in a bounded number of
 * queries. Used by export and backup, never by the snippet list.
 */
export function listSnippetDetails(options: SnippetListOptions): SnippetDetail[] {
  const plan = planList(options)
  const whereSql = plan.where.length > 0 ? `WHERE ${plan.where.join(' AND ')}` : ''

  const rows = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, s.code, s.notes, s.source_url, s.source_name, s.source_author, s.source_found_at
       ${plan.from} ${whereSql} ORDER BY ${plan.orderBy} LIMIT ? OFFSET ?`
    )
    .all(...(plan.params as never[]), options.limit ?? 500, options.offset ?? 0) as DetailRow[]

  const ids = rows.map((row) => row.id)
  const tagMap = tagsForSnippets(ids)
  const attachmentMap = attachmentsForSnippets(ids)
  const relatedMap = relatedForSnippets(ids)

  return rows.map((row) => ({
    ...mapSummary(row, tagMap.get(row.id) ?? []),
    code: row.code,
    notes: row.notes,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    sourceAuthor: row.source_author,
    sourceFoundAt: row.source_found_at,
    relatedIds: relatedMap.get(row.id) ?? [],
    attachments: attachmentMap.get(row.id) ?? []
  }))
}

export function tagNamesOf(snippetId: string): string[] {
  return snippetTagNames(snippetId)
}

/** Exact (case-insensitive) title lookup, used by duplicate detection on import. */
export function findByTitle(title: string): { id: string; title: string } | null {
  const row = stmt(
    'SELECT id, title FROM snippets WHERE deleted_at IS NULL AND title = ? COLLATE NOCASE LIMIT 1'
  ).get(title.trim()) as { id: string; title: string } | undefined
  return row ?? null
}

export { mapAttachment }
