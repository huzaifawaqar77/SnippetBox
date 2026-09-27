import type { Migration } from '.'

/**
 * SQLite FTS5 full-text index over snippets.
 *
 * Uses an *external content* table so the indexed text is not duplicated on
 * disk — FTS5 reads straight from `snippets`. Triggers keep the index in sync
 * for every insert/update/delete, which means bulk paths (import, restore,
 * backup recovery) stay consistent without extra bookkeeping.
 */
export const migration006FullTextSearch: Migration = {
  id: '006_full_text_search',
  up: `
    CREATE VIRTUAL TABLE snippets_fts USING fts5(
      title,
      description,
      code,
      notes,
      search_tags,
      search_collection,
      source_url,
      content='snippets',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER snippets_fts_insert AFTER INSERT ON snippets BEGIN
      INSERT INTO snippets_fts (
        rowid, title, description, code, notes, search_tags, search_collection, source_url
      ) VALUES (
        new.rowid, new.title, new.description, new.code, new.notes,
        new.search_tags, new.search_collection, new.source_url
      );
    END;

    CREATE TRIGGER snippets_fts_delete AFTER DELETE ON snippets BEGIN
      INSERT INTO snippets_fts (
        snippets_fts, rowid, title, description, code, notes, search_tags, search_collection, source_url
      ) VALUES (
        'delete', old.rowid, old.title, old.description, old.code, old.notes,
        old.search_tags, old.search_collection, old.source_url
      );
    END;

    CREATE TRIGGER snippets_fts_update
    AFTER UPDATE OF title, description, code, notes, search_tags, search_collection, source_url ON snippets
    BEGIN
      INSERT INTO snippets_fts (
        snippets_fts, rowid, title, description, code, notes, search_tags, search_collection, source_url
      ) VALUES (
        'delete', old.rowid, old.title, old.description, old.code, old.notes,
        old.search_tags, old.search_collection, old.source_url
      );
      INSERT INTO snippets_fts (
        rowid, title, description, code, notes, search_tags, search_collection, source_url
      ) VALUES (
        new.rowid, new.title, new.description, new.code, new.notes,
        new.search_tags, new.search_collection, new.source_url
      );
    END;
  `,
  run: (db) => {
    // Rebuild from the content table to index everything that already exists.
    db.prepare("INSERT INTO snippets_fts (snippets_fts) VALUES ('rebuild')").run()
  }
}
