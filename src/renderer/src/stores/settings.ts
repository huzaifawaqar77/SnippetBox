import { create } from 'zustand'
import type { AppSettings, PlatformInfo } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { api, errorHint, errorMessage } from '../lib/api'
import { toast } from './toast'

interface SettingsState {
  settings: AppSettings
  platform: PlatformInfo | null
  loaded: boolean
  load: () => Promise<void>
  apply: (settings: AppSettings) => void
  update: (patch: Partial<AppSettings>) => Promise<void>
}

/**
 * Settings live in the main process; this store is a cache so components can
 * read them synchronously while rendering.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  platform: null,
  loaded: false,

  load: async () => {
    try {
      const [settings, platform] = await Promise.all([api.settings.get(), api.system.platform()])
      set({ settings, platform, loaded: true })
    } catch (error) {
      toast.error('Settings could not be loaded', errorHint(error) ?? errorMessage(error))
      set({ loaded: true })
    }
  },

  apply: (settings) => set({ settings, loaded: true }),

  update: async (patch) => {
    const previous = get().settings
    // Optimistic: the UI reacts immediately, the main process is the authority.
    set({ settings: { ...previous, ...patch } })

    try {
      const saved = await api.settings.update(patch)
      set({ settings: saved })
    } catch (error) {
      set({ settings: previous })
      toast.error('That setting could not be saved', errorHint(error) ?? errorMessage(error))
    }
  }
}))

export function settingsSnapshot(): AppSettings {
  return useSettingsStore.getState().settings
}
