import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Attachment } from '@shared/types'
import { AppError, newId, notFound } from '../utils'
import { attachmentsDir, ensureDir } from './paths'
import {
  assertReadableFile,
  deleteAttachment,
  getAttachment,
  listAttachments,
  registerAttachment
} from '../db/repositories/attachments'
import { getSnippet } from '../db/repositories/snippets'

export const MAX_ATTACHMENTS_PER_SNIPPET = 25

/** Keeps the on-disk name readable while removing anything path-ish. */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim()
  return (cleaned || 'attachment').slice(-80)
}

/**
 * Copies files into the app's attachments folder and records them.
 *
 * The original file is never moved or modified — SnippetBox owns its copy, so
 * deleting a snippet can never touch the user's files.
 */
export function addAttachments(options: {
  snippetId: string
  filePaths: string[]
  dataLocation: string
}): Attachment[] {
  if (!getSnippet(options.snippetId)) throw notFound('That snippet')

  const existing = listAttachments(options.snippetId)
  if (existing.length + options.filePaths.length > MAX_ATTACHMENTS_PER_SNIPPET) {
    throw new AppError(`A snippet can hold at most ${MAX_ATTACHMENTS_PER_SNIPPET} attachments.`, {
      code: 'VALIDATION',
      hint: 'Remove an attachment before adding more.'
    })
  }

  const directory = ensureDir(attachmentsDir(options.dataLocation))
  const added: Attachment[] = []

  for (const source of options.filePaths) {
    const size = assertReadableFile(source)
    const target = join(
      directory,
      `${options.snippetId.slice(0, 8)}-${newId().slice(0, 8)}-${safeFilename(basename(source))}`
    )

    copyFileSync(source, target)
    added.push(
      registerAttachment({
        snippetId: options.snippetId,
        filename: basename(source),
        path: target,
        size
      })
    )
  }

  return added
}

export function removeAttachment(id: string): void {
  const filePath = deleteAttachment(id)
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    // The row is gone; a leftover file is harmless and gets swept later.
  }
}

export function attachmentForOpen(id: string): { path: string; filename: string } {
  const row = getAttachment(id)
  if (!existsSync(row.path)) {
    throw new AppError(`“${row.filename}” is missing from the attachments folder.`, {
      code: 'FILE_SYSTEM',
      hint: 'The file may have been moved or deleted outside SnippetBox.'
    })
  }
  return { path: row.path, filename: row.filename }
}
