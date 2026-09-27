import { basename, extname } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import type { Attachment } from '@shared/types'
import { AppError, newId, notFound } from '../../utils'
import { getDb, stmt } from '..'
import { mapAttachment, type AttachmentRow } from './helpers'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip'
}

function mimeFor(filename: string): string {
  return MIME_TYPES[extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

export function listAttachments(snippetId: string): Attachment[] {
  const rows = stmt(
    'SELECT id, snippet_id, filename, path, mime_type, size, created_at FROM attachments WHERE snippet_id = ? ORDER BY created_at ASC'
  ).all(snippetId) as AttachmentRow[]

  return rows.map((row) => mapAttachment(row, existsSync(row.path)))
}

/** Registers already-copied files as attachments (the copy happens in the service). */
export function registerAttachment(input: {
  snippetId: string
  filename: string
  path: string
  size: number
}): Attachment {
  const id = newId()
  stmt(
    'INSERT INTO attachments (id, snippet_id, filename, path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, input.snippetId, input.filename, input.path, mimeFor(input.filename), input.size, new Date().toISOString())

  return {
    id,
    snippetId: input.snippetId,
    filename: input.filename,
    path: input.path,
    mimeType: mimeFor(input.filename),
    size: input.size,
    createdAt: new Date().toISOString(),
    available: true
  }
}

export function getAttachment(id: string): AttachmentRow {
  const row = stmt('SELECT id, snippet_id, filename, path, mime_type, size, created_at FROM attachments WHERE id = ?').get(
    id
  ) as AttachmentRow | undefined
  if (!row) throw notFound('That attachment')
  return row
}

/** Removes the row and returns the file path so the caller can delete it. */
export function deleteAttachment(id: string): string {
  const row = getAttachment(id)
  stmt('DELETE FROM attachments WHERE id = ?').run(id)
  return row.path
}

export function attachmentCount(snippetId: string): number {
  return (stmt('SELECT COUNT(*) AS c FROM attachments WHERE snippet_id = ?').get(snippetId) as { c: number }).c
}

export function assertReadableFile(path: string): number {
  let stats
  try {
    stats = statSync(path)
  } catch {
    throw new AppError(`“${basename(path)}” could not be read.`, {
      code: 'FILE_SYSTEM',
      hint: 'Check that the file still exists and that you have permission to read it.'
    })
  }

  if (stats.size > 50 * 1024 * 1024) {
    throw new AppError(`“${basename(path)}” is larger than 50 MB.`, {
      code: 'VALIDATION',
      hint: 'Attachments must be smaller than 50 MB.'
    })
  }

  return stats.size
}

export function sweepOrphanAttachments(): number {
  const rows = getDb().prepare('SELECT id, path FROM attachments').all() as Array<{ id: string; path: string }>
  let removed = 0
  const remove = getDb().prepare('DELETE FROM attachments WHERE id = ?')
  for (const row of rows) {
    if (!existsSync(row.path)) {
      remove.run(row.id)
      removed += 1
    }
  }
  return removed
}
