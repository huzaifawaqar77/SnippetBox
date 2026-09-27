import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Pure path helpers — no Electron import, so services stay unit-testable. */

export function ensureDir(path: string): string {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
  return path
}

function xdg(envKey: string, fallback: string): string {
  const value = process.env[envKey]
  return value && value.trim() ? value : join(homedir(), fallback)
}

/** `~/.local/share/snippetbox` — where snippets and attachments live. */
export function defaultDataLocation(): string {
  return join(xdg('XDG_DATA_HOME', '.local/share'), 'snippetbox')
}

/** `~/.config/snippetbox` — settings only, so it survives a data move. */
export function defaultConfigLocation(): string {
  return join(xdg('XDG_CONFIG_HOME', '.config'), 'snippetbox')
}

export function defaultBackupLocation(dataLocation: string): string {
  return join(dataLocation, 'backups')
}

export function databaseFile(dataLocation: string): string {
  return join(dataLocation, 'database.sqlite')
}

export function attachmentsDir(dataLocation: string): string {
  return join(dataLocation, 'attachments')
}

export function exportsDir(dataLocation: string): string {
  return join(dataLocation, 'exports')
}

export function logsDir(configLocation: string): string {
  return join(configLocation, 'logs')
}

export function settingsFile(configLocation: string): string {
  return join(configLocation, 'settings.json')
}

export function backupsDir(backupLocation: string): string {
  return backupLocation
}

export function timestampSlug(date: Date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

/** Ensures every directory the app writes to exists. */
export function prepareDirectories(configLocation: string, dataLocation: string, backupLocation: string): void {
  for (const path of [
    configLocation,
    dataLocation,
    attachmentsDir(dataLocation),
    exportsDir(dataLocation),
    backupsDir(backupLocation),
    logsDir(configLocation)
  ]) {
    ensureDir(path)
  }
}
