import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import type { BackupFrequency, BackupInfo } from '@shared/types'
import { APP_NAME } from '@shared/constants'
import { appliedMigrations, closeDatabase, getDb, openDatabase } from '../db'
import { AppError, log } from '../utils'
import { attachmentsDir, backupsDir, databaseFile, ensureDir, timestampSlug } from './paths'
import { listZipEntries, readZipEntry, writeZip, type ZipEntryInput } from './zip'

const DAY_MS = 86_400_000
const MANIFEST = 'manifest.json'
const DATABASE_ENTRY = 'database.sqlite'
const ATTACHMENTS_PREFIX = 'attachments/'

export interface BackupContext {
  dataLocation: string
  backupLocation: string
}

interface BackupManifest {
  app: string
  createdAt: string
  reason: BackupInfo['reason']
  appVersion: string
  snippetCount: number
  attachmentCount: number
  migrations: string[]
}

function walkFiles(directory: string, depth = 0): string[] {
  if (!existsSync(directory)) return []
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (depth < 4) files.push(...walkFiles(full, depth + 1))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

function readManifest(file: string): BackupManifest | null {
  try {
    const entry = listZipEntries(file).find((candidate) => candidate.path === MANIFEST)
    if (!entry) return null
    return JSON.parse(readZipEntry(file, entry).toString('utf8')) as BackupManifest
  } catch {
    return null
  }
}

function toBackupInfo(file: string): BackupInfo {
  const stats = statSync(file)
  const manifest = readManifest(file)
  const name = basename(file)

  return {
    id: name,
    filename: name,
    path: file,
    size: stats.size,
    createdAt: manifest?.createdAt ?? stats.mtime.toISOString(),
    reason: manifest?.reason ?? 'manual',
    snippetCount: manifest?.snippetCount ?? 0
  }
}

export function listBackups(context: BackupContext): BackupInfo[] {
  const directory = backupsDir(context.backupLocation)
  if (!existsSync(directory)) return []

  return readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .map((name) => join(directory, name))
    .map((file) => {
      try {
        return toBackupInfo(file)
      } catch {
        return null
      }
    })
    .filter((info): info is BackupInfo => info !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function backupFilePath(filename: string, context: BackupContext): string {
  // Guard against a crafted id escaping the backup directory.
  const safe = basename(filename)
  if (!/^[A-Za-z0-9._-]+\.zip$/.test(safe)) {
    throw new AppError('That backup name is not valid.', { code: 'VALIDATION' })
  }
  return join(backupsDir(context.backupLocation), safe)
}

/**
 * Creates a complete backup: a consistent SQLite snapshot plus every attachment,
 * packaged as a single ZIP so it can be copied anywhere.
 */
export async function createBackup(reason: BackupInfo['reason'], context: BackupContext): Promise<BackupInfo> {
  const directory = ensureDir(backupsDir(context.backupLocation))
  const stamp = timestampSlug()
  const target = join(directory, `snippetbox-${stamp}-${reason}.zip`)
  const temporaryDatabase = join(tmpdir(), `snippetbox-snapshot-${stamp}-${process.pid}.sqlite`)

  const db = getDb()
  const snippetCount = (db.prepare('SELECT COUNT(*) AS c FROM snippets').get() as { c: number }).c
  const attachmentCount = (db.prepare('SELECT COUNT(*) AS c FROM attachments').get() as { c: number }).c

  // better-sqlite3's online backup produces a valid database even while the app
  // keeps writing, which a raw file copy cannot guarantee under WAL.
  await db.backup(temporaryDatabase)

  const manifest: BackupManifest = {
    app: APP_NAME,
    createdAt: new Date().toISOString(),
    reason,
    appVersion: process.env.npm_package_version ?? '1.0.0',
    snippetCount,
    attachmentCount,
    migrations: appliedMigrations()
  }

  const entries: ZipEntryInput[] = [
    { path: MANIFEST, data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8') },
    { path: DATABASE_ENTRY, filePath: temporaryDatabase }
  ]

  const attachmentRoot = attachmentsDir(context.dataLocation)
  for (const file of walkFiles(attachmentRoot)) {
    const archivePath = `${ATTACHMENTS_PREFIX}${relative(attachmentRoot, file).split(/[\\/]/).join('/')}`
    entries.push({ path: archivePath, filePath: file })
  }

  try {
    writeZip(entries, target)
  } finally {
    try {
      unlinkSync(temporaryDatabase)
    } catch {
      /* snapshot already gone */
    }
  }

  log.info(`backup created: ${basename(target)} (${snippetCount} snippets)`)
  return toBackupInfo(target)
}

/**
 * Restores a backup over the live data directory.
 *
 * A safety backup is taken first, so a restore is itself reversible. The
 * database connection is closed and reopened around the file swap because
 * SQLite holds open handles to the old file.
 */
export async function restoreBackup(id: string, context: BackupContext): Promise<void> {
  const file = backupFilePath(id, context)
  if (!existsSync(file)) throw new AppError('That backup file is missing.', { code: 'NOT_FOUND' })

  const entries = listZipEntries(file)
  const databaseEntry = entries.find((entry) => entry.path === DATABASE_ENTRY)
  if (!databaseEntry) {
    throw new AppError('That archive does not contain a SnippetBox database.', {
      code: 'VALIDATION',
      hint: 'Pick a backup created by SnippetBox.'
    })
  }

  await createBackup('pre-restore', context)

  // Verify the snapshot is readable before destroying the current database.
  const snapshot = readZipEntry(file, databaseEntry)
  const temporaryDatabase = join(tmpdir(), `snippetbox-restore-${process.pid}-${Date.now()}.sqlite`)
  writeFileSync(temporaryDatabase, snapshot)

  closeDatabase()

  try {
    const target = databaseFile(context.dataLocation)
    for (const suffix of ['', '-wal', '-shm']) {
      const candidate = `${target}${suffix}`
      if (existsSync(candidate)) unlinkSync(candidate)
    }

    writeFileSync(target, snapshot)

    const attachmentRoot = ensureDir(attachmentsDir(context.dataLocation))
    for (const entry of entries) {
      if (entry.path === MANIFEST || entry.path === DATABASE_ENTRY) continue
      if (!entry.path.startsWith(ATTACHMENTS_PREFIX)) continue

      const relativePath = entry.path.slice(ATTACHMENTS_PREFIX.length)
      if (!relativePath || relativePath.includes('..')) continue

      const destination = join(attachmentRoot, relativePath)
      ensureDir(join(destination, '..'))
      writeFileSync(destination, readZipEntry(file, entry))
    }

    openDatabase(target)
  } finally {
    try {
      unlinkSync(temporaryDatabase)
    } catch {
      /* nothing to clean up */
    }
  }

  log.info(`restored backup ${id}`)
}

export function removeBackup(id: string, context: BackupContext): void {
  const file = backupFilePath(id, context)
  if (!existsSync(file)) throw new AppError('That backup file is missing.', { code: 'NOT_FOUND' })
  unlinkSync(file)
}

/**
 * Creates a scheduled backup when one is due. Returns null when nothing needed
 * to happen, so the caller can stay silent in that case.
 */
export async function runScheduledBackup(
  frequency: BackupFrequency,
  context: BackupContext
): Promise<BackupInfo | null> {
  if (frequency === 'off') return null

  const interval = frequency === 'daily' ? DAY_MS : 7 * DAY_MS
  const existing = listBackups(context).filter((backup) => backup.reason === 'auto')
  const newest = existing[0]

  if (newest && Date.now() - Date.parse(newest.createdAt) < interval) return null

  try {
    return await createBackup('auto', context)
  } catch (error) {
    log.warn('scheduled backup failed', error)
    return null
  }
}
