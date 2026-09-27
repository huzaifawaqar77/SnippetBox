import type { SnippetBoxApi } from '@shared/ipc'

/**
 * The renderer's only conduit to the system. Everything here is validated again
 * in the main process — this wrapper exists for ergonomics and error shaping,
 * not for security.
 */
export const api: SnippetBoxApi = window.snippetbox

export interface ApiError extends Error {
  code?: string
  hint?: string
  details?: string
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}

export function errorHint(error: unknown): string | undefined {
  if (error instanceof Error) {
    const hint = (error as ApiError).hint
    if (typeof hint === 'string' && hint.trim()) return hint
  }
  return undefined
}

export function errorDetails(error: unknown): string | undefined {
  if (error instanceof Error) {
    const details = (error as ApiError).details
    if (typeof details === 'string' && details.trim()) return details
  }
  return undefined
}

/** True for "the thing you asked for is gone" — callers usually refetch. */
export function isNotFound(error: unknown): boolean {
  return error instanceof Error && (error as ApiError).code === 'NOT_FOUND'
}
