import type { Migration } from '.'

export const migration002AddCollections: Migration = {
  id: '002_add_collections',
  up: `
    CREATE TABLE collections (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      parent_id  TEXT REFERENCES collections (id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_collections_parent ON collections (parent_id);
    CREATE INDEX idx_collections_name   ON collections (name COLLATE NOCASE);

    ALTER TABLE snippets ADD COLUMN collection_id TEXT REFERENCES collections (id) ON DELETE SET NULL;

    CREATE INDEX idx_snippets_collection ON snippets (collection_id);
  `
}
