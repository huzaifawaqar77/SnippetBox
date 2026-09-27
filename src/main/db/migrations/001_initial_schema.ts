import type { Migration } from '.'

export const migration001InitialSchema: Migration = {
  id: '001_initial_schema',
  up: `
    CREATE TABLE tags (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color      TEXT NOT NULL DEFAULT '#6366F1',
      icon       TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE snippets (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      code            TEXT NOT NULL DEFAULT '',
      language        TEXT NOT NULL DEFAULT 'plaintext',
      notes           TEXT NOT NULL DEFAULT '',
      source_url      TEXT NOT NULL DEFAULT '',
      source_name     TEXT NOT NULL DEFAULT '',
      source_author   TEXT NOT NULL DEFAULT '',
      source_found_at TEXT,
      favorite        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      last_opened_at  TEXT,
      open_count      INTEGER NOT NULL DEFAULT 0,
      copy_count      INTEGER NOT NULL DEFAULT 0,
      deleted_at      TEXT
    );

    CREATE INDEX idx_snippets_updated    ON snippets (updated_at DESC);
    CREATE INDEX idx_snippets_created    ON snippets (created_at DESC);
    CREATE INDEX idx_snippets_opened     ON snippets (last_opened_at DESC);
    CREATE INDEX idx_snippets_deleted    ON snippets (deleted_at);
    CREATE INDEX idx_snippets_language   ON snippets (language);
    CREATE INDEX idx_snippets_favorite   ON snippets (favorite);
    CREATE INDEX idx_snippets_title      ON snippets (title COLLATE NOCASE);

    CREATE TABLE snippet_tags (
      snippet_id TEXT NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
      tag_id     TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
      PRIMARY KEY (snippet_id, tag_id)
    );

    CREATE INDEX idx_snippet_tags_tag ON snippet_tags (tag_id);
  `
}
