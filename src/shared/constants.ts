import type { AppSettings, SortKey, ViewId } from './types'

export const APP_NAME = 'SnippetBox'
export const APP_TAGLINE = 'Save the solutions you never want to search for twice.'
export const APP_DESCRIPTION = 'Your personal developer knowledge base.'

export interface ViewDefinition {
  id: ViewId
  label: string
  icon: string
  shortcut?: string
}

export const VIEWS: ViewDefinition[] = [
  { id: 'all', label: 'All Snippets', icon: 'library' },
  { id: 'favorites', label: 'Favorites', icon: 'star', shortcut: 'Mod+Shift+F' },
  { id: 'recent-added', label: 'Recently Added', icon: 'calendar-plus' },
  { id: 'recent-updated', label: 'Recently Updated', icon: 'history' },
  { id: 'recent-opened', label: 'Recently Viewed', icon: 'eye' },
  { id: 'most-used', label: 'Most Used', icon: 'flame' },
  { id: 'trash', label: 'Trash', icon: 'trash' }
]

export const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: 'relevance', label: 'Best match' },
  { id: 'updated', label: 'Last updated' },
  { id: 'created', label: 'Newest first' },
  { id: 'title', label: 'Title (A–Z)' },
  { id: 'opened', label: 'Last opened' },
  { id: 'copies', label: 'Most copied' }
]

export const DEFAULT_SORT: Record<ViewId, SortKey> = {
  all: 'updated',
  favorites: 'updated',
  'recent-added': 'created',
  'recent-updated': 'updated',
  'recent-opened': 'opened',
  'most-used': 'copies',
  trash: 'updated',
  tag: 'updated',
  collection: 'updated'
}

export const TAG_COLORS = [
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#64748B'
]

export const DEFAULT_TAG_COLOR = TAG_COLORS[0]!

/** Tag suggestions offered on an empty database so the app is never blank-slate. */
export const STARTER_TAGS: Array<{ name: string; color: string }> = [
  { name: 'linux', color: '#F59E0B' },
  { name: 'bash', color: '#84CC16' },
  { name: 'javascript', color: '#EAB308' },
  { name: 'typescript', color: '#3B82F6' },
  { name: 'python', color: '#0EA5E9' },
  { name: 'docker', color: '#06B6D4' },
  { name: 'git', color: '#F97316' },
  { name: 'database', color: '#8B5CF6' },
  { name: 'network', color: '#14B8A6' },
  { name: 'debugging', color: '#EF4444' }
]

export const EDITOR_FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Source Code Pro',
  'SF Mono',
  'Menlo',
  'DejaVu Sans Mono',
  'Liberation Mono',
  'monospace'
]

export const CODE_FONT_SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32]

/* ---------------------------------------------------------------------------
   Zoom
   `uiFontSize` doubles as the zoom level: the root font size drives both the
   type scale and Tailwind's rem-based spacing, so one number scales everything.
--------------------------------------------------------------------------- */

/** The size that counts as 100%. */
export const BASE_UI_FONT_SIZE = 18
export const MIN_UI_FONT_SIZE = 12
export const MAX_UI_FONT_SIZE = 30
export const ZOOM_STEP = 1

/** Percent shown to the user, rounded to something readable (e.g. 105%, 120%). */
export function zoomPercent(uiFontSize: number): number {
  return Math.round((uiFontSize / BASE_UI_FONT_SIZE) * 100)
}

export function zoomFromPercent(percent: number): number {
  return clampFontSize(Math.round((percent / 100) * BASE_UI_FONT_SIZE))
}

export function clampFontSize(size: number): number {
  return Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(size)))
}

/** Step one zoom level, clamped. Positive = bigger. */
export function stepFontSize(size: number, direction: 1 | -1): number {
  return clampFontSize(size + direction * ZOOM_STEP)
}

export const CODE_FONT_SIZE_MIN = 9
export const CODE_FONT_SIZE_MAX = 32
export const TAB_SIZES = [2, 4, 8]

export const SEARCH_DEBOUNCE_MS = 120
export const AUTOSAVE_DEBOUNCE_MS = 700
export const RECENT_WINDOW_DAYS = 14

export interface ShortcutDefinition {
  id: string
  label: string
  /** Electron accelerator syntax; also rendered (prettified) in the UI. */
  accelerator: string
  category: 'File' | 'Navigation' | 'Editing' | 'Snippet' | 'View' | 'Application'
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: 'new-snippet', label: 'New snippet', accelerator: 'CommandOrControl+N', category: 'File' },
  { id: 'quick-capture', label: 'Quick capture window', accelerator: 'CommandOrControl+Shift+N', category: 'File' },
  { id: 'import', label: 'Import snippets', accelerator: 'CommandOrControl+Shift+I', category: 'File' },
  { id: 'export', label: 'Export snippets', accelerator: 'CommandOrControl+Shift+E', category: 'File' },
  { id: 'search', label: 'Search snippets', accelerator: 'CommandOrControl+K', category: 'Navigation' },
  { id: 'command-palette', label: 'Command palette', accelerator: 'CommandOrControl+P', category: 'Navigation' },
  { id: 'focus-list', label: 'Focus snippet list', accelerator: 'CommandOrControl+1', category: 'Navigation' },
  { id: 'focus-detail', label: 'Focus snippet detail', accelerator: 'CommandOrControl+2', category: 'Navigation' },
  { id: 'find', label: 'Find in current view', accelerator: 'CommandOrControl+F', category: 'Editing' },
  { id: 'save', label: 'Save snippet', accelerator: 'CommandOrControl+S', category: 'Editing' },
  { id: 'edit', label: 'Edit selected snippet', accelerator: 'CommandOrControl+E', category: 'Snippet' },
  { id: 'toggle-favorite', label: 'Toggle favorite', accelerator: 'CommandOrControl+Shift+F', category: 'Snippet' },
  { id: 'copy-code', label: 'Copy code', accelerator: 'CommandOrControl+Shift+C', category: 'Snippet' },
  { id: 'copy-markdown', label: 'Copy as Markdown', accelerator: 'CommandOrControl+Shift+M', category: 'Snippet' },
  { id: 'duplicate', label: 'Duplicate snippet', accelerator: 'CommandOrControl+D', category: 'Snippet' },
  { id: 'trash', label: 'Move to Trash', accelerator: 'Delete', category: 'Snippet' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', accelerator: 'CommandOrControl+B', category: 'View' },
  { id: 'zoom-in', label: 'Zoom in', accelerator: 'CommandOrControl+=', category: 'View' },
  { id: 'zoom-out', label: 'Zoom out', accelerator: 'CommandOrControl+-', category: 'View' },
  { id: 'zoom-reset', label: 'Reset zoom to 100%', accelerator: 'CommandOrControl+0', category: 'View' },
  { id: 'toggle-theme', label: 'Toggle light / dark', accelerator: 'CommandOrControl+Shift+L', category: 'View' },
  { id: 'settings', label: 'Open settings', accelerator: 'CommandOrControl+,', category: 'Application' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', accelerator: 'CommandOrControl+/', category: 'Application' },
  { id: 'close', label: 'Close dialog or cancel', accelerator: 'Escape', category: 'Application' }
]

export const GLOBAL_SHORTCUTS = {
  quickCapture: 'Control+Alt+S',
  globalSearch: 'Control+Alt+Space'
}

export const SIDEBAR_MIN_WIDTH = 208
export const SIDEBAR_MAX_WIDTH = 400
export const SIDEBAR_COLLAPSED_WIDTH = 60
export const LIST_MIN_WIDTH = 260
export const LIST_MAX_WIDTH = 720
export const LIST_DEFAULT_WIDTH = 380

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',

  codeFont: 'JetBrains Mono',
  codeFontSize: 14,
  uiFontSize: BASE_UI_FONT_SIZE,
  tabSize: 2,
  showLineNumbers: true,
  wordWrap: false,
  minimap: false,

  sidebarWidth: 260,
  sidebarCollapsed: false,
  animations: true,
  compactMode: false,

  confirmDestructive: true,
  rememberLastLocation: true,
  startOnLogin: false,
  restoreLastSnippet: true,

  dataLocation: '',
  backupLocation: '',
  autoBackup: 'off',

  telemetry: false,
  clipboardIntegration: false,
  trackUsage: true,

  globalQuickCapture: false,
  quickCaptureShortcut: GLOBAL_SHORTCUTS.quickCapture,
  globalSearch: false,
  globalSearchShortcut: GLOBAL_SHORTCUTS.globalSearch,

  onboardingComplete: false
}
