/**
 * Domain model shared by the main process, the preload bridge and the renderer.
 *
 * Timestamps are stored as ISO-8601 strings (UTC) so they survive JSON IPC and
 * round-trip through SQLite text columns losslessly.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export type SortKey = 'relevance' | 'updated' | 'created' | 'title' | 'opened' | 'copies'

export type BackupFrequency = 'off' | 'daily' | 'weekly'

/** Logical destinations in the left sidebar. */
export type ViewId =
  | 'all'
  | 'favorites'
  | 'recent-added'
  | 'recent-updated'
  | 'recent-opened'
  | 'most-used'
  | 'trash'
  | 'tag'
  | 'collection'

export interface Tag {
  id: string
  name: string
  color: string
  icon: string | null
  createdAt: string
  snippetCount: number
}

export interface Collection {
  id: string
  name: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  snippetCount: number
}

export interface Attachment {
  id: string
  snippetId: string
  filename: string
  path: string
  mimeType: string
  size: number
  createdAt: string
  /** True when the file is still present on disk. */
  available: boolean
}

/**
 * What the snippet list renders. Deliberately excludes `code` and `notes` so a
 * list of 10,000 snippets never pulls megabytes of source into the renderer.
 */
export interface SnippetSummary {
  id: string
  title: string
  description: string
  language: string
  favorite: boolean
  collectionId: string | null
  collectionName: string | null
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
  openCount: number
  copyCount: number
  deletedAt: string | null
  tags: Tag[]
  /** First meaningful line of the code block, truncated for preview. */
  codePreview: string
  lineCount: number
  hasNotes: boolean
  versionCount: number
}

/** Full record, loaded only when a snippet is opened. */
export interface SnippetDetail extends SnippetSummary {
  code: string
  notes: string
  sourceUrl: string
  sourceName: string
  sourceAuthor: string
  sourceFoundAt: string | null
  relatedIds: string[]
  attachments: Attachment[]
}

export interface SnippetVersion {
  id: string
  snippetId: string
  title: string
  description: string
  code: string
  language: string
  notes: string
  tagNames: string[]
  createdAt: string
}

export interface SnippetCreateInput {
  title: string
  description?: string
  code?: string
  language?: string
  notes?: string
  collectionId?: string | null
  sourceUrl?: string
  sourceName?: string
  sourceAuthor?: string
  sourceFoundAt?: string | null
  favorite?: boolean
  tagNames?: string[]
  relatedIds?: string[]
}

export type SnippetUpdateInput = Partial<Omit<SnippetCreateInput, 'tagNames'>> & {
  tagNames?: string[]
  /** Set to true when the caller wants a version snapshot recorded. */
  snapshot?: boolean
}

export interface SnippetListOptions {
  view: ViewId
  /** Free-text query, possibly containing operators (see `parseSearchQuery`). */
  query?: string
  tagIds?: string[]
  collectionId?: string | null
  language?: string | null
  favorite?: boolean
  sort?: SortKey
  limit?: number
  offset?: number
  /** Include trashed snippets (only the trash view should). */
  includeTrashed?: boolean
}

export interface SnippetListResult {
  items: SnippetSummary[]
  total: number
  /** Operators understood in the query, surfaced as removable filter chips. */
  parsed: ParsedQuery
}

export interface ParsedQuery {
  terms: string[]
  phrases: string[]
  tags: string[]
  languages: string[]
  collections: string[]
  isFavorite: boolean
  isRecent: boolean
  before: string | null
  after: string | null
}

export interface AppSettings {
  theme: ThemeMode

  codeFont: string
  codeFontSize: number
  uiFontSize: number
  tabSize: number
  showLineNumbers: boolean
  wordWrap: boolean
  minimap: boolean

  sidebarWidth: number
  sidebarCollapsed: boolean
  animations: boolean
  compactMode: boolean

  confirmDestructive: boolean
  rememberLastLocation: boolean
  startOnLogin: boolean
  restoreLastSnippet: boolean

  dataLocation: string
  backupLocation: string
  autoBackup: BackupFrequency

  telemetry: boolean
  clipboardIntegration: boolean
  trackUsage: boolean

  globalQuickCapture: boolean
  quickCaptureShortcut: string
  globalSearch: boolean
  globalSearchShortcut: string

  onboardingComplete: boolean
}

export interface BackupInfo {
  id: string
  filename: string
  path: string
  size: number
  createdAt: string
  reason: 'manual' | 'auto' | 'pre-restore'
  snippetCount: number
}

export interface ImportCandidate {
  title: string
  description: string
  code: string
  language: string
  tags: string[]
  notes: string
  sourceUrl: string
  sourceName: string
  /** Origin of the candidate, e.g. a filename. */
  origin: string
}

export interface ImportPreview {
  candidates: ImportCandidate[]
  duplicates: Array<{ candidateTitle: string; existingId: string; existingTitle: string }>
  skipped: number
}

export interface ImportResult {
  imported: number
  skipped: number
}

export type ExportFormat = 'json' | 'markdown' | 'zip'

export interface ExportRequest {
  format: ExportFormat
  view: ViewId
  ids?: string[]
  query?: string
  includeAttachments?: boolean
  /** Absolute destination path chosen by the user. */
  destination: string
}

export interface ExportResult {
  count: number
  path: string
}

export interface SimilarSnippet {
  id: string
  title: string
  score: number
}

export interface UsageStats {
  totalSnippets: number
  totalTags: number
  totalCollections: number
  trashedSnippets: number
  favoriteSnippets: number
  totalCopies: number
  languages: Array<{ language: string; count: number }>
  storageBytes: number
}

export interface LanguageOption {
  id: string
  label: string
  /** Lowercase extensions without the dot, used for drag & drop and detection. */
  extensions: string[]
  aliases: string[]
  color: string
  /** Logical highlighter family understood by the renderer. */
  highlight: string
}

/** Commands dispatched from the native menu, tray or global shortcuts. */
export type AppCommand =
  | { type: 'new-snippet'; seed?: Partial<SnippetCreateInput> }
  | { type: 'quick-capture' }
  | { type: 'focus-search' }
  | { type: 'command-palette' }
  | { type: 'toggle-sidebar' }
  | { type: 'toggle-theme' }
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  | { type: 'zoom-reset' }
  | { type: 'open-view'; view: ViewId }
  | { type: 'open-settings' }
  | { type: 'open-shortcuts' }
  | { type: 'open-about' }
  | { type: 'toggle-favorite' }
  | { type: 'edit-snippet' }
  | { type: 'duplicate-snippet' }
  | { type: 'copy-code' }
  | { type: 'copy-markdown' }
  | { type: 'trash-snippet' }
  | { type: 'import' }
  | { type: 'export' }
  | { type: 'create-backup' }
  | { type: 'open-snippet'; id: string }

export type WindowKind = 'main' | 'capture' | 'launcher'

/** Mirrors Node's `process.platform` without depending on Node type definitions. */
export type NodePlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export interface PlatformInfo {
  platform: NodePlatform
  arch: string
  appVersion: string
  electronVersion: string
  isPackaged: boolean
}

/**
 * "Where was I" state, restored on the next launch (section 56 of the spec).
 * Deliberately separate from settings: it changes constantly and a corrupt file
 * must never affect preferences.
 */
export interface SessionState {
  window: { x: number | null; y: number | null; width: number; height: number; maximized: boolean }
  listWidth: number
  lastView: ViewId
  lastTagId: string | null
  lastCollectionId: string | null
  lastSnippetId: string | null
}

export interface ToastMessage {
  id: string
  title: string
  description?: string
  variant: 'default' | 'success' | 'error'
}
