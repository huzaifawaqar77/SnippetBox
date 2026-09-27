import { existsSync } from 'node:fs'
import type { Attachment, Tag } from '@shared/types'
import { DEFAULT_TAG_COLOR, TAG_COLORS } from '@shared/constants'
import { newId } from '../../utils'
import { getDb, stmt } from '..'

export interface TagRow {
  id: string
  name: string
  color: string
  icon: string | null
  created_at: string
  snippet_count?: number
}

export function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
    snippetCount: row.snippet_count ?? 0
  }
}

export interface AttachmentRow {
  id: string
  snippet_id: string
  filename: string
  path: string
  mime_type: string
  size: number
  created_at: string
}

export function mapAttachment(row: AttachmentRow, available: boolean): Attachment {
  return {
    id: row.id,
    snippetId: row.snippet_id,
    filename: row.filename,
    path: row.path,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
    available
  }
}

export const TAG_SELECT = `
  SELECT t.id, t.name, t.color, t.icon, t.created_at,
         (SELECT COUNT(*) FROM snippet_tags st
            JOIN snippets s ON s.id = st.snippet_id
           WHERE st.tag_id = t.id AND s.deleted_at IS NULL) AS snippet_count
    FROM tags t
`

/** Loads tags for many snippets in one round trip (avoids an N+1 in the list). */
export function tagsForSnippets(snippetIds: string[]): Map<string, Tag[]> {
  const result = new Map<string, Tag[]>()
  if (snippetIds.length === 0) return result

  const placeholders = snippetIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT st.snippet_id, t.id, t.name, t.color, t.icon, t.created_at
         FROM snippet_tags st
         JOIN tags t ON t.id = st.tag_id
        WHERE st.snippet_id IN (${placeholders})
        ORDER BY t.name COLLATE NOCASE ASC`
    )
    .all(...snippetIds) as Array<TagRow & { snippet_id: string }>

  for (const row of rows) {
    const bucket = result.get(row.snippet_id)
    const tag = mapTag(row)
    if (bucket) bucket.push(tag)
    else result.set(row.snippet_id, [tag])
  }
  return result
}

/** Finds a tag by name (case-insensitive) or creates it. */
export function ensureTag(name: string, color?: string): string {
  const trimmed = name.trim()
  const existing = stmt('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(trimmed) as
    | { id: string }
    | undefined
  if (existing) return existing.id

  const id = newId()
  const palette = TAG_COLORS.filter((candidate) => candidate !== DEFAULT_TAG_COLOR)
  const auto = color ?? palette[Math.floor(Math.random() * palette.length)] ?? DEFAULT_TAG_COLOR
  stmt('INSERT INTO tags (id, name, color, icon, created_at) VALUES (?, ?, ?, NULL, ?)').run(
    id,
    trimmed,
    auto,
    new Date().toISOString()
  )
  return id
}

export function resolveTagIds(names: string[]): string[] {
  const ids: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const id = ensureTag(trimmed)
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Replaces a snippet's tag set wholesale and refreshes its search columns. */
export function setSnippetTags(snippetId: string, names: string[]): void {
  const db = getDb()
  const tagIds = resolveTagIds(names)

  db.prepare('DELETE FROM snippet_tags WHERE snippet_id = ?').run(snippetId)
  const insert = db.prepare('INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) VALUES (?, ?)')
  for (const tagId of tagIds) insert.run(snippetId, tagId)

  refreshSearchColumns(snippetId)
}

export function snippetTagNames(snippetId: string): string[] {
  return (
    getDb()
      .prepare(
        `SELECT t.name FROM snippet_tags st JOIN tags t ON t.id = st.tag_id
          WHERE st.snippet_id = ? ORDER BY t.name COLLATE NOCASE ASC`
      )
      .all(snippetId) as Array<{ name: string }>
  ).map((row) => row.name)
}

/**
 * Recomputes the materialised search columns from the live relations. The FTS
 * update trigger fires as a result, so the index stays correct without any
 * explicit reindex calls in callers.
 */
export function refreshSearchColumns(snippetId: string): void {
  stmt(
    `UPDATE snippets SET
       search_tags = COALESCE((
         SELECT group_concat(t.name, ' ')
           FROM snippet_tags st JOIN tags t ON t.id = st.tag_id
          WHERE st.snippet_id = snippets.id
       ), ''),
       search_collection = COALESCE((
         SELECT c.name FROM collections c WHERE c.id = snippets.collection_id
       ), '')
     WHERE id = ?`
  ).run(snippetId)
}

export function refreshSearchForTag(tagId: string): void {
  const rows = stmt('SELECT snippet_id FROM snippet_tags WHERE tag_id = ?').all(tagId) as Array<{
    snippet_id: string
  }>
  for (const row of rows) refreshSearchColumns(row.snippet_id)
}

export function refreshSearchForCollection(collectionId: string): void {
  const rows = stmt('SELECT id FROM snippets WHERE collection_id = ?').all(collectionId) as Array<{ id: string }>
  for (const row of rows) refreshSearchColumns(row.id)
}

export interface DerivedColumns {
  codePreview: string
  lineCount: number
  hasNotes: number
}

/** Derives the cheap-to-read columns stored alongside each snippet. */
export function deriveColumns(code: string, notes: string): DerivedColumns {
  const source = code ?? ''
  let preview = ''
  for (const line of source.split('\n')) {
    const collapsed = line.replace(/\s+/g, ' ').trim()
    if (collapsed) {
      preview = collapsed.length > 140 ? `${collapsed.slice(0, 139).trimEnd()}…` : collapsed
      break
    }
  }

  return {
    codePreview: preview,
    lineCount: source ? source.split('\n').length : 0,
    hasNotes: notes.trim() ? 1 : 0
  }
}

export function booleanFromSql(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

/** Batch-loads attachments for many snippets in a single query. */
export function attachmentsForSnippets(snippetIds: string[]): Map<string, Attachment[]> {
  const result = new Map<string, Attachment[]>()
  if (snippetIds.length === 0) return result

  const placeholders = snippetIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT id, snippet_id, filename, path, mime_type, size, created_at
         FROM attachments WHERE snippet_id IN (${placeholders})
        ORDER BY created_at ASC`
    )
    .all(...snippetIds) as AttachmentRow[]

  for (const row of rows) {
    const attachment = mapAttachment(row, existsSync(row.path))
    const bucket = result.get(row.snippet_id)
    if (bucket) bucket.push(attachment)
    else result.set(row.snippet_id, [attachment])
  }
  return result
}

export function relatedForSnippets(snippetIds: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (snippetIds.length === 0) return result

  const placeholders = snippetIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT snippet_id, related_id FROM snippet_related WHERE snippet_id IN (${placeholders})`)
    .all(...snippetIds) as Array<{ snippet_id: string; related_id: string }>

  for (const row of rows) {
    const bucket = result.get(row.snippet_id)
    if (bucket) bucket.push(row.related_id)
    else result.set(row.snippet_id, [row.related_id])
  }
  return result
}
