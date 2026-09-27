import type { Migration } from '.'

export const migration004AddAttachments: Migration = {
  id: '004_add_attachments',
  up: `
    CREATE TABLE attachments (
      id         TEXT PRIMARY KEY,
      snippet_id TEXT NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
      filename   TEXT NOT NULL,
      path       TEXT NOT NULL,
      mime_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
      size       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_attachments_snippet ON attachments (snippet_id);
  `
}
