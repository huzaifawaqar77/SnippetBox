import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, closeDatabase } from '../db'
import { AppError, log } from '../utils'
import { attachmentsDir, databaseFile, defaultBackupLocation } from './paths'
import { createBackup } from './backup'
import type { BackupContext } from './backup'

/**
 * Moving the data directory is a first-class action: the user owns their data
 * and must be able to keep it on another disk.
 *
 * The move is a copy, never a move-and-delete, so a failed relocation cannot
 * destroy anything. A safety backup is written first.
 */
export interface StorageContext extends BackupContext {}

export function assertUsableDataLocation(target: string): void {
  const trimmed = target.trim()
  if (!trimmed) throw new AppError('Choose a folder for your data.', { code: 'VALIDATION' })

  if (existsSync(trimmed)) {
    if (!statSync(trimmed).isDirectory()) {
      throw new AppError('That path is a file, not a folder.', { code: 'VALIDATION' })
    }
    // Refuse to overwrite a populated SnippetBox database.
    const existing = join(trimmed, 'database.sqlite')
    if (existsSync(existing)) {
      throw new AppError('That folder already contains a SnippetBox database.', {
        code: 'CONFLICT',
        hint: 'Pick an empty folder, or open the existing one from Settings.'
      })
    }
  }

  try {
    mkdirSync(trimmed, { recursive: true })
  } catch (error) {
    throw new AppError('That folder could not be created.', {
      code: 'PERMISSION',
      hint: 'Check that you have write access to the parent folder.',
      cause: error
    })
  }
}

/**
 * Copies the database and attachments to `target` and switches the running app
 * over to it. Returns the new location.
 */
export async function relocateData(
  target: string,
  context: StorageContext
): Promise<{ dataLocation: string; backupLocation: string }> {
  assertUsableDataLocation(target)
  const destination = target.trim()
  if (destination === context.dataLocation) {
    return { dataLocation: context.dataLocation, backupLocation: context.backupLocation }
  }

  // Safety net: the user can always go back to the previous state.
  try {
    await createBackup('pre-restore', context)
  } catch (error) {
    log.warn('could not create a safety backup before moving data', error)
  }

  const sourceDatabase = databaseFile(context.dataLocation)
  closeDatabase()

  try {
    if (existsSync(sourceDatabase)) {
      cpSync(sourceDatabase, join(destination, 'database.sqlite'))
    }

    const sourceAttachments = attachmentsDir(context.dataLocation)
    if (existsSync(sourceAttachments)) {
      cpSync(sourceAttachments, attachmentsDir(destination), { recursive: true })
    }
  } catch (error) {
    // Reopen the original database so the app keeps working.
    openDatabase(sourceDatabase)
    throw new AppError('Your data could not be copied to that folder.', {
      code: 'FILE_SYSTEM',
      hint: 'Nothing was deleted. Check disk space and permissions, then try again.',
      cause: error
    })
  }

  // Only drop the backup folder when it lived inside the old data directory.
  const previousBackups = defaultBackupLocation(context.dataLocation)
  const keepBackupLocation = context.backupLocation !== previousBackups

  const backupLocation = keepBackupLocation ? context.backupLocation : defaultBackupLocation(destination)

  openDatabase(databaseFile(destination))

  if (!keepBackupLocation) {
    try {
      const previous = previousBackups
      if (existsSync(previous)) cpSync(previous, backupLocation, { recursive: true })
    } catch (error) {
      log.warn('existing backups could not be carried over', error)
    }
  }

  return { dataLocation: destination, backupLocation }
}

/** Deletes a folder only when it is empty — used to undo a failed relocation. */
export function removeIfEmpty(directory: string): void {
  try {
    rmSync(directory, { recursive: false })
  } catch {
    /* not empty, or not ours to remove */
  }
}
