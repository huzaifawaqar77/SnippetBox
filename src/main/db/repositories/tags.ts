import type { Tag } from '@shared/types'
import { DEFAULT_TAG_COLOR } from '@shared/constants'
import { newId } from '../../utils'
import { AppError, conflict, notFound } from '../../utils'
import { getDb, stmt } from '..'
import { TAG_SELECT, mapTag, refreshSearchColumns, refreshSearchForTag } from './helpers'
import type { TagRow } from './helpers'

export function listTags(): Tag[] {
  const rows = stmt(`${TAG_SELECT} ORDER BY t.name COLLATE NOCASE ASC`).all() as TagRow[]
  return rows.map(mapTag)
}

export function getTag(id: string): Tag {
  const row = stmt(`${TAG_SELECT} WHERE t.id = ?`).get(id) as TagRow | undefined
  if (!row) throw notFound('That tag')
  return mapTag(row)
}

export function createTag(input: { name: string; color?: string; icon?: string | null }): Tag {
  const name = input.name.trim()
  const existing = stmt('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
    | { id: string }
    | undefined

  if (existing) {
    throw conflict(`A tag named “${name}” already exists.`, 'Pick a different name, or rename the existing tag.')
  }

  const id = newId()
  stmt('INSERT INTO tags (id, name, color, icon, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    input.color ?? DEFAULT_TAG_COLOR,
    input.icon ?? null,
    new Date().toISOString()
  )

  return getTag(id)
}

export function updateTag(id: string, patch: { name?: string; color?: string; icon?: string | null }): Tag {
  const current = stmt('SELECT id, name FROM tags WHERE id = ?').get(id) as
    | { id: string; name: string }
    | undefined
  if (!current) throw notFound('That tag')

  const name = patch.name?.trim()

  if (name && name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = stmt('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id) as
      | { id: string }
      | undefined
    if (clash) {
      throw conflict(`A tag named “${name}” already exists.`, 'Merge the two tags instead of renaming.')
    }
  }

  const assignments: string[] = []
  const values: unknown[] = []

  if (name) {
    assignments.push('name = ?')
    values.push(name)
  }
  if (patch.color !== undefined) {
    assignments.push('color = ?')
    values.push(patch.color)
  }
  if (patch.icon !== undefined) {
    assignments.push('icon = ?')
    values.push(patch.icon)
  }

  if (assignments.length > 0) {
    values.push(id)
    getDb()
      .prepare(`UPDATE tags SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...(values as never[]))
  }

  if (name) refreshSearchForTag(id)
  return getTag(id)
}

/** Deleting a tag only detaches it — snippets themselves are untouched. */
export function deleteTag(id: string): void {
  const existing = stmt('SELECT id FROM tags WHERE id = ?').get(id)
  if (!existing) throw notFound('That tag')

  const affected = stmt('SELECT snippet_id FROM snippet_tags WHERE tag_id = ?').all(id) as Array<{
    snippet_id: string
  }>

  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    for (const row of affected) refreshSearchColumns(row.snippet_id)
  })()
}

export function mergeTags(sourceId: string, targetId: string): Tag {
  if (sourceId === targetId) {
    throw new AppError('Pick two different tags to merge.', { code: 'VALIDATION' })
  }

  const source = stmt('SELECT id FROM tags WHERE id = ?').get(sourceId)
  if (!source) throw notFound('The tag being merged')
  const target = stmt('SELECT id FROM tags WHERE id = ?').get(targetId)
  if (!target) throw notFound('The destination tag')

  const affected = stmt('SELECT snippet_id FROM snippet_tags WHERE tag_id = ?').all(sourceId) as Array<{
    snippet_id: string
  }>

  const db = getDb()
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) SELECT snippet_id, ? FROM snippet_tags WHERE tag_id = ?').run(
      targetId,
      sourceId
    )
    db.prepare('DELETE FROM tags WHERE id = ?').run(sourceId)
    for (const row of affected) refreshSearchColumns(row.snippet_id)
  })()

  return getTag(targetId)
}
