import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { BASE_UI_FONT_SIZE, zoomPercent } from '@shared/constants'
import { api, errorMessage } from '../lib/api'
import { toast } from '../stores/toast'
import { useSettingsStore } from '../stores/settings'

/** Debounces a rapidly changing value (search input, window size, …). */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const MONO_FALLBACK =
  "ui-monospace, 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, 'DejaVu Sans Mono', monospace"

export function codeFontStack(font: string): string {
  const family = font.trim() || 'JetBrains Mono'
  return `'${family.replace(/'/g, '')}', ${MONO_FALLBACK}`
}

/**
 * Pushes appearance settings onto the document as CSS variables and data
 * attributes. Everything visual — including the code editor's syntax colours —
 * hangs off these, so one place controls the whole theme.
 */
export function useAppearance(): void {
  const settings = useSettingsStore((state) => state.settings)

  // Theme resolution, including live reaction to the OS preference.
  useEffect(() => {
    const root = document.documentElement

    const apply = (dark: boolean): void => {
      root.classList.toggle('dark', dark)
      root.style.colorScheme = dark ? 'dark' : 'light'
    }

    if (settings.theme !== 'system') {
      apply(settings.theme === 'dark')
      return
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    apply(query.matches)
    const listener = (event: MediaQueryListEvent): void => apply(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [settings.theme])

  // Typography, zoom, density and motion.
  useEffect(() => {
    const root = document.documentElement
    const zoom = settings.uiFontSize / BASE_UI_FONT_SIZE

    root.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`)
    // Panel widths multiply by this so the layout stays proportional when zoomed.
    root.style.setProperty('--zoom', String(zoom))
    // The code font preference is expressed at 100% zoom and scales with it, so
    // zooming never leaves the code behind while the chrome grows around it.
    root.style.setProperty('--code-font-size', `${(settings.codeFontSize * zoom).toFixed(2)}px`)
    root.style.setProperty('--code-font', codeFontStack(settings.codeFont))
    root.dataset.animations = settings.animations ? 'on' : 'off'
    root.dataset.density = settings.compactMode ? 'compact' : 'comfortable'
    root.dataset.zoom = String(zoomPercent(settings.uiFontSize))
  }, [
    settings.uiFontSize,
    settings.codeFontSize,
    settings.codeFont,
    settings.animations,
    settings.compactMode
  ])
}

/** Live zoom ratio (1 = 100%), for callers that need to convert pointer deltas. */
export function useZoomRatio(): number {
  return useSettingsStore((state) => state.settings.uiFontSize) / BASE_UI_FONT_SIZE
}

/** Whether the interface is currently rendering dark, system preference included. */
export function useIsDarkTheme(): boolean {
  const theme = useSettingsStore((state) => state.settings.theme)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    if (theme !== 'system') return undefined
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    setSystemDark(query.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [theme])

  return theme === 'dark' || (theme === 'system' && systemDark)
}

export interface VirtualItem<T> {
  index: number
  item: T
  offset: number
}

/**
 * Fixed-height windowing.
 *
 * Rows are a deliberate fixed height (the design clamps text to two lines), so
 * measuring is unnecessary and a 10,000-snippet list stays smooth.
 */
export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerRef: RefObject<HTMLElement | null>,
  overscan = 8
): { virtualItems: VirtualItem<T>[]; totalHeight: number } {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return

    const update = (): void => setViewportHeight(element.clientHeight)
    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [containerRef])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    let frame = 0
    const onScroll = (): void => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setScrollTop(element.scrollTop)
      })
    }

    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [containerRef])

  return useMemo(() => {
    const totalHeight = items.length * itemHeight
    if (items.length === 0) return { virtualItems: [], totalHeight: 0 }

    const first = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visible = Math.ceil(viewportHeight / itemHeight) + overscan * 2
    const last = Math.min(items.length, first + visible)

    const virtualItems: VirtualItem<T>[] = []
    for (let index = first; index < last; index++) {
      const item = items[index]
      if (item !== undefined) virtualItems.push({ index, item, offset: index * itemHeight })
    }

    return { virtualItems, totalHeight }
  }, [items, itemHeight, scrollTop, viewportHeight, overscan])
}

/** Scrolls the selected row into view without fighting the virtualiser. */
export function useScrollIntoView(
  containerRef: RefObject<HTMLElement | null>,
  index: number | null,
  itemHeight: number
): void {
  const lastIndex = useRef<number | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element || index === null || index < 0) return
    if (lastIndex.current === index) return
    lastIndex.current = index

    const top = index * itemHeight
    const bottom = top + itemHeight
    if (top < element.scrollTop) element.scrollTo({ top, behavior: 'auto' })
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTo({ top: bottom - element.clientHeight, behavior: 'auto' })
    }
  }, [containerRef, index, itemHeight])
}

export interface CopyOptions {
  /** Feedback key, so several buttons on screen can show their own "Copied!". */
  key?: string
  /** Counts as a use of that snippet (Most Used / usage stats). */
  snippetId?: string
  /** Optional confirmation toast. */
  toastTitle?: string
}

export function useCopy(): {
  copy: (text: string, options?: CopyOptions) => Promise<boolean>
  copiedKey: string | null
} {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const copy = useCallback(async (text: string, options: CopyOptions = {}) => {
    try {
      await api.system.writeClipboard(text)
    } catch (error) {
      toast.error('Could not copy to the clipboard', errorMessage(error))
      return false
    }

    if (options.snippetId) void api.snippets.recordCopy(options.snippetId).catch(() => undefined)

    setCopiedKey(options.key ?? 'default')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiedKey(null), 1800)

    if (options.toastTitle) toast.success(options.toastTitle)
    return true
  }, [])

  return { copy, copiedKey }
}

/** Copies text from outside a component (keyboard handlers, stores). */
export async function copyText(text: string, options: CopyOptions = {}): Promise<boolean> {
  try {
    await api.system.writeClipboard(text)
    if (options.snippetId) void api.snippets.recordCopy(options.snippetId).catch(() => undefined)
    if (options.toastTitle) toast.success(options.toastTitle)
    return true
  } catch (error) {
    toast.error('Could not copy to the clipboard', errorMessage(error))
    return false
  }
}

/** Reads the clipboard through the main process (never silently, always asked). */
export async function readClipboard(): Promise<string> {
  try {
    return await api.system.readClipboard()
  } catch {
    return ''
  }
}
