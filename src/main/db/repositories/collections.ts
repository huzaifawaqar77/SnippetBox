import type { Collection } from '@shared/types'
import { newId } from '../../utils'
import { AppError, conflict, notFound } from '../../utils'
import { getDb, stmt } from '..'
import { refreshSearchForCollection } from './helpers'

interface CollectionRow {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
  snippet_count?: number
}

const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.parent_id, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM snippets s
           WHERE s.collection_id = c.id AND s.deleted_at IS NULL) AS snippet_count
    FROM collections c
`

function mapCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snippetCount: row.snippet_count ?? 0
  }
}

export function listCollections(): Collection[] {
  const rows = stmt(`${COLLECTION_SELECT} ORDER BY c.name COLLATE NOCASE ASC`).all() as CollectionRow[]
  return rows.map(mapCollection)
}

export function getCollection(id: string): Collection {
  const row = stmt(`${COLLECTION_SELECT} WHERE c.id = ?`).get(id) as CollectionRow | undefined
  if (!row) throw notFound('That collection')
  return mapCollection(row)
}

function assertNameAvailable(name: string, exceptId?: string): void {
  const clash = (
    exceptId
      ? stmt('SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id != ?').get(name, exceptId)
      : stmt('SELECT id FROM collections WHERE name = ? COLLATE NOCASE').get(name)
  ) as { id: string } | undefined

  if (clash) throw conflict(`A collection named “${name}” already exists.`, 'Choose a different name.')
}

function ancestorsOf(id: string): Set<string> {
  const seen = new Set<string>()
  let current: string | null = id
  while (current) {
    if (seen.has(current)) break
    seen.add(current)
    const row = stmt('SELECT parent_id FROM collections WHERE id = ?').get(current) as
      | { parent_id: string | null }
      | undefined
    current = row?.parent_id ?? null
  }
  return seen
}

function assertNoCycle(id: string, parentId: string | null): void {
  if (!parentId) return
  if (parentId === id) {
    throw new AppError('A collection cannot be its own parent.', { code: 'VALIDATION' })
  }
  if (ancestorsOf(parentId).has(id)) {
    throw new AppError('That would create a circular collection tree.', {
      code: 'VALIDATION',
      hint: 'Pick a parent that is not inside this collection.'
    })
  }
}

export function createCollection(input: { name: string; parentId?: string | null }): Collection {
  const name = input.name.trim()
  assertNameAvailable(name)

  const parentId = input.parentId ?? null
  if (parentId && !stmt('SELECT id FROM collections WHERE id = ?').get(parentId)) {
    throw notFound('The parent collection')
  }

  const id = newId()
  const now = new Date().toISOString()
  stmt('INSERT INTO collections (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    parentId,
    now,
    now
  )
  return getCollection(id)
}

export function updateCollection(id: string, patch: { name?: string; parentId?: string | null }): Collection {
  const existing = getCollection(id)
  const name = patch.name?.trim()

  if (name && name.toLowerCase() !== existing.name.toLowerCase()) assertNameAvailable(name, id)

  const assignments: string[] = []
  const values: unknown[] = []

  if (name) {
    assignments.push('name = ?')
    values.push(name)
  }

  if (patch.parentId !== undefined) {
    assertNoCycle(id, patch.parentId)
    if (patch.parentId && !stmt('SELECT id FROM collections WHERE id = ?').get(patch.parentId)) {
      throw notFound('The parent collection')
    }
    assignments.push('parent_id = ?')
    values.push(patch.parentId)
  }

  if (assignments.length > 0) {
    assignments.push('updated_at = ?')
    values.push(new Date().toISOString(), id)
    getDb()
      .prepare(`UPDATE collections SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...(values as never[]))
  }

  // A rename changes the denormalised search column for every member snippet.
  if (name) refreshSearchForCollection(id)
  return getCollection(id)
}

/**
 * Deletes a collection. Snippets and child collections survive — snippets lose
 * the association (ON DELETE SET NULL) and children move up to the root.
 */
export function deleteCollection(id: string): void {
  if (!stmt('SELECT id FROM collections WHERE id = ?').get(id)) throw notFound('That collection')

  const affected = stmt('SELECT id FROM snippets WHERE collection_id = ?').all(id) as Array<{ id: string }>
  const db = getDb()

  db.transaction(() => {
    db.prepare('UPDATE collections SET parent_id = NULL WHERE parent_id = ?').run(id)
    db.prepare('DELETE FROM collections WHERE id = ?').run(id)
    for (const row of affected) {
      db.prepare("UPDATE snippets SET search_collection = '' WHERE id = ?").run(row.id)
    }
  })()
}
