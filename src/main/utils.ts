import { randomUUID } from 'node:crypto'
import type { IpcErrorPayload } from '@shared/ipc'

export function newId(): string {
  return randomUUID()
}

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FILE_SYSTEM'
  | 'DATABASE'
  | 'PERMISSION'
  | 'UNSUPPORTED'
  | 'UNKNOWN'

/**
 * An error that can be shown to a human. `message` is written in plain language
 * (never a SQLite error code) and `hint` explains what the user can do next.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly hint?: string

  constructor(message: string, options: { code?: ErrorCode; hint?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = options.code ?? 'UNKNOWN'
    this.hint = options.hint
  }
}

export function notFound(what: string): AppError {
  return new AppError(`${what} no longer exists.`, {
    code: 'NOT_FOUND',
    hint: 'It may have been deleted in another window. Refresh the list and try again.'
  })
}

export function conflict(message: string, hint?: string): AppError {
  return new AppError(message, { code: 'CONFLICT', hint })
}

/** Translates any thrown value into the envelope the renderer understands. */
export function toIpcError(error: unknown): IpcErrorPayload {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      ...(error.hint ? { hint: error.hint } : {}),
      details: error.stack ?? undefined
    }
  }

  const candidate = error as { message?: string; code?: string; stack?: string }
  const rawMessage = candidate?.message ?? String(error)
  const sqliteCode = typeof candidate?.code === 'string' ? candidate.code : ''

  // Never leak raw SQLite diagnostics as the primary message.
  if (sqliteCode.startsWith('SQLITE_CONSTRAINT')) {
    return {
      message: 'That change conflicts with existing data.',
      code: 'CONFLICT',
      hint: 'Check for duplicate names and try again.',
      details: rawMessage
    }
  }

  if (sqliteCode.startsWith('SQLITE_')) {
    return {
      message: "We couldn't complete that database operation.",
      code: 'DATABASE',
      hint: 'Your data has not been lost. Try again, or restart SnippetBox.',
      details: rawMessage
    }
  }

  return {
    message: 'Something went wrong.',
    code: 'UNKNOWN',
    hint: 'Try again. If it keeps happening, check the logs.',
    details: candidate?.stack ?? rawMessage
  }
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Development is signalled by the Vite dev server, not by NODE_ENV. */
const isDev = (): boolean => Boolean(process.env.ELECTRON_RENDERER_URL)

export const log = {
  info: (message: string, ...rest: unknown[]) => console.log(`[snippetbox] ${message}`, ...rest),
  warn: (message: string, ...rest: unknown[]) => console.warn(`[snippetbox] ${message}`, ...rest),
  error: (message: string, ...rest: unknown[]) => console.error(`[snippetbox] ${message}`, ...rest),
  debug: (message: string, ...rest: unknown[]) => {
    if (isDev()) console.debug(`[snippetbox] ${message}`, ...rest)
  }
}
