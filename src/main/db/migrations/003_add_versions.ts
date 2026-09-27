import type { Migration } from '.'

export const migration003AddVersions: Migration = {
  id: '003_add_versions',
  up: `
    CREATE TABLE snippet_versions (
      id          TEXT PRIMARY KEY,
      snippet_id  TEXT NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
      title       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      code        TEXT NOT NULL DEFAULT '',
      language    TEXT NOT NULL DEFAULT 'plaintext',
      notes       TEXT NOT NULL DEFAULT '',
      tag_names   TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL
    );

    CREATE INDEX idx_versions_snippet ON snippet_versions (snippet_id, created_at DESC);
  `
}
