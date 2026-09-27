import Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations'

export type Db = Database.Database
export type Row = Record<string, unknown>

let connection: Db | null = null
const statementCache = new Map<string, Database.Statement>()

export class MigrationError extends Error {
  constructor(migrationId: string, cause: unknown) {
    super(`Database migration "${migrationId}" failed: ${(cause as Error)?.message ?? String(cause)}`)
    this.name = 'MigrationError'
  }
}

/**
 * Opens (or creates) the SQLite database and brings the schema up to date.
 * Deliberately free of Electron imports so tests can drive it directly.
 */
export function openDatabase(file: string): Db {
  if (connection) return connection

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')

  runMigrations(db)
  connection = db
  statementCache.clear()
  return db
}

export function getDb(): Db {
  if (!connection) throw new Error('Database has not been opened yet.')
  return connection
}

export function isDatabaseOpen(): boolean {
  return connection !== null
}

/** Prepared-statement cache — better-sqlite3 compiles on first use. */
export function stmt(sql: string): Database.Statement {
  const cached = statementCache.get(sql)
  if (cached) return cached
  const prepared = getDb().prepare(sql)
  statementCache.set(sql, prepared)
  return prepared
}

export function inTransaction<T>(fn: () => T): T {
  const db = getDb()
  return db.transaction(fn)()
}

export function closeDatabase(): void {
  statementCache.clear()
  if (!connection) return
  try {
    connection.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* checkpoint is best effort */
  }
  connection.close()
  connection = null
}

export function runMigrations(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set(
    (db.prepare('SELECT id FROM migrations').all() as Array<{ id: string }>).map((row) => row.id)
  )

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    try {
      const apply = db.transaction(() => {
        if (migration.up) db.exec(migration.up)
        migration.run?.(db)
        db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString())
      })
      apply()
    } catch (error) {
      throw new MigrationError(migration.id, error)
    }
  }
}

export function appliedMigrations(): string[] {
  return (
    getDb().prepare('SELECT id FROM migrations ORDER BY id').all() as Array<{ id: string }>
  ).map((row) => row.id)
}
