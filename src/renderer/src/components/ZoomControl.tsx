import { Minus, Plus } from 'lucide-react'
import { BASE_UI_FONT_SIZE, MAX_UI_FONT_SIZE, MIN_UI_FONT_SIZE, zoomPercent } from '@shared/constants'
import { cn } from '../lib/utils'
import { zoomReset, zoomStep } from '../lib/zoom'
import { useSettingsStore } from '../stores/settings'
import { IconButton } from './ui/primitives'
import { Tip } from './ui/overlays'

/**
 * Always-visible zoom control. The percentage doubles as a reset button, which
 * is the affordance people reach for after over-zooming.
 */
export function ZoomControl({
  orientation = 'horizontal',
  className
}: {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}): React.JSX.Element {
  const uiFontSize = useSettingsStore((state) => state.settings.uiFontSize)
  const percent = zoomPercent(uiFontSize)
  const atMin = uiFontSize <= MIN_UI_FONT_SIZE
  const atMax = uiFontSize >= MAX_UI_FONT_SIZE
  const isDefault = uiFontSize === BASE_UI_FONT_SIZE

  const decrease = (
    <Tip label="Zoom out" shortcut="Ctrl -" side={orientation === 'vertical' ? 'right' : 'top'}>
      <IconButton
        label="Zoom out"
        size="icon-sm"
        disabled={atMin}
        onClick={() => void zoomStep(-1)}
      >
        <Minus className="size-3.5" />
      </IconButton>
    </Tip>
  )

  const increase = (
    <Tip label="Zoom in" shortcut="Ctrl +" side={orientation === 'vertical' ? 'right' : 'top'}>
      <IconButton
        label="Zoom in"
        size="icon-sm"
        disabled={atMax}
        onClick={() => void zoomStep(1)}
      >
        <Plus className="size-3.5" />
      </IconButton>
    </Tip>
  )

  const readout = (
    <button
      type="button"
      onClick={() => (isDefault ? undefined : void zoomReset())}
      disabled={isDefault}
      title={isDefault ? `Zoom ${percent}%` : `Reset zoom to 100% (currently ${percent}%)`}
      aria-label={`Zoom level ${percent} percent`}
      className={cn(
        'min-w-[3.25rem] shrink-0 rounded-[5px] px-1 text-center text-2xs tabular-nums transition-colors',
        isDefault ? 'text-subtle' : 'text-fg-secondary hover:bg-hover'
      )}
    >
      {percent}%
    </button>
  )

  if (orientation === 'vertical') {
    return (
      <div className={cn('flex flex-col items-center gap-0.5', className)}>
        <Tip label="Zoom in" shortcut="Ctrl +" side="right">
          <IconButton label="Zoom in" size="icon-sm" disabled={atMax} onClick={() => void zoomStep(1)}>
            <Plus className="size-3.5" />
          </IconButton>
        </Tip>
        <button
          type="button"
          onClick={() => (isDefault ? undefined : void zoomReset())}
          disabled={isDefault}
          title={`Reset zoom to 100% (currently ${percent}%)`}
          aria-label={`Zoom level ${percent} percent`}
          className={cn(
            'rounded-[5px] px-0.5 text-[0.62rem] tabular-nums leading-tight transition-colors',
            isDefault ? 'text-subtle' : 'text-fg-secondary hover:bg-hover'
          )}
        >
          {percent}
        </button>
        <Tip label="Zoom out" shortcut="Ctrl -" side="right">
          <IconButton label="Zoom out" size="icon-sm" disabled={atMin} onClick={() => void zoomStep(-1)}>
            <Minus className="size-3.5" />
          </IconButton>
        </Tip>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {decrease}
      {readout}
      {increase}
    </div>
  )
}
