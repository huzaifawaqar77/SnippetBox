import { BASE_UI_FONT_SIZE, clampFontSize, stepFontSize, zoomPercent } from '@shared/constants'
import { useSettingsStore } from '../stores/settings'
import { toast } from '../stores/toast'

/**
 * Zoom is a single stored number: the interface font size. Because the type
 * scale and Tailwind's spacing are both rem-based, one value scales the whole
 * interface — panes, text, icons and the code editor — and persists in
 * settings.json, so it survives restarts.
 */

export async function zoomStep(direction: 1 | -1): Promise<void> {
  const { settings, update } = useSettingsStore.getState()
  const next = stepFontSize(settings.uiFontSize, direction)

  if (next === settings.uiFontSize) {
    toast.info(direction > 0 ? 'Maximum zoom reached' : 'Minimum zoom reached')
    return
  }

  await update({ uiFontSize: next })
  toast.info(`Zoom ${zoomPercent(next)}%`)
}

export async function zoomReset(): Promise<void> {
  const { settings, update } = useSettingsStore.getState()
  if (settings.uiFontSize === BASE_UI_FONT_SIZE) return

  await update({ uiFontSize: BASE_UI_FONT_SIZE })
  toast.info('Zoom 100%')
}

export async function zoomSet(size: number): Promise<void> {
  const { settings, update } = useSettingsStore.getState()
  const next = clampFontSize(size)
  if (next === settings.uiFontSize) return

  await update({ uiFontSize: next })
  toast.info(`Zoom ${zoomPercent(next)}%`)
}
