import type { Db } from '..'
import { migration001InitialSchema } from './001_initial_schema'
import { migration002AddCollections } from './002_add_collections'
import { migration003AddVersions } from './003_add_versions'
import { migration004AddAttachments } from './004_add_attachments'
import { migration005AddRelationsAndSearchColumns } from './005_add_relations_and_search'
import { migration006FullTextSearch } from './006_full_text_search'

export interface Migration {
  id: string
  /** Raw SQL executed inside a transaction. */
  up?: string
  /** Escape hatch for data backfills that need JavaScript. */
  run?: (db: Db) => void
}

/**
 * Ordered list of schema migrations. Never edit an applied migration — append a
 * new one instead.
 */
export const MIGRATIONS: Migration[] = [
  migration001InitialSchema,
  migration002AddCollections,
  migration003AddVersions,
  migration004AddAttachments,
  migration005AddRelationsAndSearchColumns,
  migration006FullTextSearch
]
