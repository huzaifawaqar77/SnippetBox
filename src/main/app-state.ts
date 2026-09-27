import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionState, ViewId } from '@shared/types'
import { log } from './utils'

/**
 * Ephemeral session state: window geometry and "where was I" bookkeeping.
 *
 * Kept apart from settings because it changes constantly and is worthless if it
 * gets lost — a corrupt file must never break preferences.
 */

const DEFAULTS: SessionState = {
  window: { x: null, y: null, width: 1360, height: 860, maximized: false },
  listWidth: 340,
  lastView: 'all',
  lastTagId: null,
  lastCollectionId: null,
  lastSnippetId: null
}

let file = ''
let cached: SessionState | null = null

export function configureSessionStore(configLocation: string): void {
  file = join(configLocation, 'session.json')
  cached = null
}

const VIEW_IDS: ViewId[] = [
  'all',
  'favorites',
  'recent-added',
  'recent-updated',
  'recent-opened',
  'most-used',
  'trash',
  'tag',
  'collection'
]

function sanitize(input: unknown): Partial<SessionState> {
  if (!input || typeof input !== 'object') return {}
  const source = input as Record<string, unknown>
  const result: Partial<SessionState> = {}

  const window = source.window as Record<string, unknown> | undefined
  if (window && typeof window === 'object') {
    result.window = {
      x: typeof window.x === 'number' && Number.isFinite(window.x) ? window.x : null,
      y: typeof window.y === 'number' && Number.isFinite(window.y) ? window.y : null,
      width: typeof window.width === 'number' && window.width >= 900 ? Math.round(window.width) : DEFAULTS.window.width,
      height:
        typeof window.height === 'number' && window.height >= 600 ? Math.round(window.height) : DEFAULTS.window.height,
      maximized: window.maximized === true
    }
  }

  if (typeof source.listWidth === 'number' && source.listWidth >= 260 && source.listWidth <= 720) {
    result.listWidth = Math.round(source.listWidth)
  }

  if (typeof source.lastView === 'string' && VIEW_IDS.includes(source.lastView as ViewId)) {
    result.lastView = source.lastView as ViewId
  }

  for (const key of ['lastTagId', 'lastCollectionId', 'lastSnippetId'] as const) {
    const value = source[key]
    result[key] = typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null
  }

  return result
}

export function readSession(): SessionState {
  if (cached) return cached

  if (!file || !existsSync(file)) {
    cached = { ...DEFAULTS }
    return cached
  }

  try {
    cached = { ...DEFAULTS, ...sanitize(JSON.parse(readFileSync(file, 'utf8'))) }
  } catch (error) {
    log.warn('session file could not be read; using defaults', error)
    cached = { ...DEFAULTS }
  }

  return cached
}

export function updateSession(patch: Partial<SessionState>): SessionState {
  const next: SessionState = { ...readSession(), ...patch }
  cached = next

  if (!file) return next

  try {
    const temporary = `${file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(temporary, file)
  } catch (error) {
    log.warn('session state could not be persisted', error)
  }

  return next
}
