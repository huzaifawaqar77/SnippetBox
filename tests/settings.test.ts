import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/constants'
import {
  configureSettingsStore,
  ensureStorageDefaults,
  getSettings,
  resetSettings,
  updateSettings
} from '@main/services/settings'
import { ensureDir, prepareDirectories } from '@main/services/paths'

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'snippetbox-settings-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('settings store', () => {
  it('creates its directory on first write', () => {
    // Regression: bootstrap used to configure the store before the config
    // directory existed, so the very first setting write threw ENOENT.
    const configLocation = join(root, 'config', 'snippetbox')
    expect(existsSync(configLocation)).toBe(false)

    configureSettingsStore(configLocation)
    const settings = ensureStorageDefaults(join(root, 'data'), join(root, 'data', 'backups'))

    expect(settings.dataLocation).toBe(join(root, 'data'))
    expect(settings.backupLocation).toBe(join(root, 'data', 'backups'))
    expect(existsSync(join(configLocation, 'settings.json'))).toBe(true)
  })

  it('persists and reads back a patch', () => {
    const configLocation = ensureDir(join(root, 'config'))
    configureSettingsStore(configLocation)

    updateSettings({ theme: 'dark', codeFontSize: 16, compactMode: true })

    const raw = JSON.parse(readFileSync(join(configLocation, 'settings.json'), 'utf8'))
    expect(raw.theme).toBe('dark')
    expect(raw.codeFontSize).toBe(16)

    // A fresh store instance must see the persisted values.
    configureSettingsStore(configLocation)
    const reloaded = getSettings()
    expect(reloaded.theme).toBe('dark')
    expect(reloaded.compactMode).toBe(true)
  })

  it('falls back to defaults for missing or corrupt files', () => {
    const configLocation = ensureDir(join(root, 'config'))
    configureSettingsStore(configLocation)
    expect(getSettings().theme).toBe(DEFAULT_SETTINGS.theme)

    writeFileSync(join(configLocation, 'settings.json'), '{ this is not json')
    configureSettingsStore(configLocation)
    expect(getSettings().theme).toBe(DEFAULT_SETTINGS.theme)
  })

  it('ignores unknown keys and wrong value types', () => {
    const configLocation = ensureDir(join(root, 'config'))
    writeFileSync(
      join(configLocation, 'settings.json'),
      JSON.stringify({
        theme: 'neon',
        codeFontSize: 'huge',
        compactMode: 'yes',
        telemetry: true,
        somethingRemoved: 42
      })
    )

    configureSettingsStore(configLocation)
    const settings = getSettings()

    // Invalid values fall back; valid ones survive.
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(settings.codeFontSize).toBe(DEFAULT_SETTINGS.codeFontSize)
    expect(settings.compactMode).toBe(DEFAULT_SETTINGS.compactMode)
    expect(settings.telemetry).toBe(true)
    expect(settings).not.toHaveProperty('somethingRemoved')
  })

  it('resets cleanly', () => {
    const configLocation = ensureDir(join(root, 'config'))
    configureSettingsStore(configLocation)
    updateSettings({ theme: 'dark' })
    resetSettings()
    expect(getSettings().theme).toBe(DEFAULT_SETTINGS.theme)
  })
})

describe('path helpers', () => {
  it('creates every directory the app writes to', () => {
    const configLocation = join(root, 'config')
    const dataLocation = join(root, 'data')
    const backupLocation = join(root, 'backups')

    prepareDirectories(configLocation, dataLocation, backupLocation)

    for (const path of [configLocation, dataLocation, backupLocation]) {
      expect(existsSync(path)).toBe(true)
    }
    expect(existsSync(join(dataLocation, 'attachments'))).toBe(true)
    expect(existsSync(join(configLocation, 'logs'))).toBe(true)
  })
})
