import { readFileSync, renameSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import type { AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { settingsFile, ensureDir } from './paths'
import { log } from '../utils'

/**
 * Settings are persisted as JSON in the config directory rather than in SQLite.
 *
 * That is deliberate: the database lives in the *data* directory, and the user
 * can move that directory. The pointer to it therefore has to be readable before
 * the database can be opened — keeping settings in the database would be
 * circular.
 */

type Listener = (settings: AppSettings) => void

let configLocation = ''
let cached: AppSettings | null = null
const listeners = new Set<Listener>()

const BOOLEAN_KEYS = [
  'showLineNumbers',
  'wordWrap',
  'minimap',
  'sidebarCollapsed',
  'animations',
  'compactMode',
  'confirmDestructive',
  'rememberLastLocation',
  'startOnLogin',
  'restoreLastSnippet',
  'telemetry',
  'clipboardIntegration',
  'trackUsage',
  'globalQuickCapture',
  'globalSearch',
  'onboardingComplete'
] as const

const NUMBER_KEYS = ['codeFontSize', 'uiFontSize', 'sidebarWidth', 'tabSize'] as const
const STRING_KEYS = ['codeFont', 'dataLocation', 'backupLocation', 'quickCaptureShortcut', 'globalSearchShortcut'] as const

/** Drops any key that is unknown to this version or has the wrong type. */
function sanitize(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== 'object') return {}
  const source = input as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const key of BOOLEAN_KEYS) if (typeof source[key] === 'boolean') result[key] = source[key]
  for (const key of NUMBER_KEYS) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value
  }
  for (const key of STRING_KEYS) if (typeof source[key] === 'string') result[key] = source[key]

  if (source.theme === 'light' || source.theme === 'dark' || source.theme === 'system') {
    result.theme = source.theme
  }
  if (source.autoBackup === 'off' || source.autoBackup === 'daily' || source.autoBackup === 'weekly') {
    result.autoBackup = source.autoBackup
  }

  return result as Partial<AppSettings>
}

export function configureSettingsStore(location: string): void {
  configLocation = location
  cached = null
}

/** The directory holding settings, session state and logs. */
export function currentConfigLocation(): string {
  return configLocation
}

export function getSettings(): AppSettings {
  if (cached) return cached

  const defaults: AppSettings = {
    ...DEFAULT_SETTINGS,
    dataLocation: DEFAULT_SETTINGS.dataLocation || '',
    backupLocation: DEFAULT_SETTINGS.backupLocation || ''
  }

  if (!configLocation || !existsSync(settingsFile(configLocation))) {
    cached = defaults
    return cached
  }

  try {
    const raw = readFileSync(settingsFile(configLocation), 'utf8')
    cached = { ...defaults, ...sanitize(JSON.parse(raw)) }
  } catch (error) {
    log.warn('settings file could not be read; falling back to defaults', error)
    cached = defaults
  }

  return cached
}

function persist(settings: AppSettings): void {
  if (!configLocation) throw new Error('The settings store has not been configured.')

  const target = settingsFile(configLocation)
  const temporary = `${target}.tmp`

  // Never assume the directory exists: settings must be writable even on a
  // first run where nothing has been created yet.
  ensureDir(configLocation)

  // Write-then-rename keeps the file valid even if the process dies mid-write.
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(temporary, target)
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...getSettings(), ...patch }
  cached = next

  try {
    persist(next)
  } catch (error) {
    log.error('failed to persist settings', error)
    throw error
  }

  for (const listener of listeners) listener(next)
  return next
}

export function resetSettings(): AppSettings {
  cached = { ...DEFAULT_SETTINGS }
  if (configLocation) {
    try {
      unlinkSync(settingsFile(configLocation))
    } catch {
      /* nothing to remove */
    }
  }
  for (const listener of listeners) listener(cached)
  return cached
}

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Fills in the machine-specific defaults the very first time the app runs, so
 * the settings screen always shows a real path instead of an empty field.
 */
export function ensureStorageDefaults(dataLocation: string, backupLocation: string): AppSettings {
  const current = getSettings()
  const patch: Partial<AppSettings> = {}
  if (!current.dataLocation) patch.dataLocation = dataLocation
  if (!current.backupLocation) patch.backupLocation = backupLocation
  return Object.keys(patch).length > 0 ? updateSettings(patch) : current
}
