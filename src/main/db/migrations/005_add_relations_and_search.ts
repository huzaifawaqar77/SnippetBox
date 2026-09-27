import type { Migration } from '.'

/**
 * Adds the materialised columns the snippet list needs (so listing thousands of
 * snippets never loads full code blocks) plus manual snippet↔snippet relations.
 */
export const migration005AddRelationsAndSearchColumns: Migration = {
  id: '005_add_relations_and_search',
  up: `
    ALTER TABLE snippets ADD COLUMN code_preview TEXT NOT NULL DEFAULT '';
    ALTER TABLE snippets ADD COLUMN line_count   INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE snippets ADD COLUMN has_notes    INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE snippets ADD COLUMN search_tags  TEXT NOT NULL DEFAULT '';
    ALTER TABLE snippets ADD COLUMN search_collection TEXT NOT NULL DEFAULT '';

    CREATE TABLE snippet_related (
      snippet_id TEXT NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
      related_id TEXT NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
      PRIMARY KEY (snippet_id, related_id)
    );

    CREATE INDEX idx_snippet_related_related ON snippet_related (related_id);
  `,
  run: (db) => {
    // Backfill the derived columns for rows created before this migration.
    const rows = db
      .prepare('SELECT id, code, notes FROM snippets')
      .all() as Array<{ id: string; code: string; notes: string }>

    const update = db.prepare('UPDATE snippets SET code_preview = ?, line_count = ?, has_notes = ? WHERE id = ?')

    for (const row of rows) {
      const firstLine = row.code
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .find((line) => line.length > 0)

      update.run(
        firstLine ? (firstLine.length > 140 ? `${firstLine.slice(0, 139).trimEnd()}…` : firstLine) : '',
        row.code ? row.code.split('\n').length : 0,
        row.notes.trim() ? 1 : 0,
        row.id
      )
    }
  }
}
