import type {
  AppCommand,
  AppSettings,
  BackupInfo,
  Collection,
  ExportRequest,
  ExportResult,
  ImportPreview,
  ImportResult,
  PlatformInfo,
  SnippetCreateInput,
  SnippetDetail,
  SnippetListOptions,
  SnippetListResult,
  SnippetSummary,
  SnippetUpdateInput,
  SnippetVersion,
  SimilarSnippet,
  Tag,
  UsageStats
} from './types'

/** Renderer-invoked channel names. */
export const IPC = {
  snippets: {
    list: 'snippets:list',
    get: 'snippets:get',
    create: 'snippets:create',
    update: 'snippets:update',
    duplicate: 'snippets:duplicate',
    trash: 'snippets:trash',
    restore: 'snippets:restore',
    destroy: 'snippets:destroy',
    emptyTrash: 'snippets:emptyTrash',
    setFavorite: 'snippets:set-favorite',
    recordOpen: 'snippets:record-open',
    recordCopy: 'snippets:record-copy',
    similar: 'snippets:similar',
    setRelated: 'snippets:set-related',
    versions: 'snippets:versions',
    saveVersion: 'snippets:save-version',
    restoreVersion: 'snippets:restore-version'
  },
  tags: {
    list: 'tags:list',
    create: 'tags:create',
    rename: 'tags:rename',
    update: 'tags:update',
    remove: 'tags:remove',
    merge: 'tags:merge'
  },
  collections: {
    list: 'collections:list',
    create: 'collections:create',
    update: 'collections:update',
    remove: 'collections:remove'
  },
  attachments: {
    list: 'attachments:list',
    add: 'attachments:add',
    remove: 'attachments:remove',
    open: 'attachments:open',
    reveal: 'attachments:reveal',
    pickFiles: 'attachments:pick-files'
  },
  search: {
    query: 'search:query'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    pickDirectory: 'settings:pick-directory',
    revealDataLocation: 'settings:reveal-data-location',
    stats: 'settings:stats'
  },
  backup: {
    list: 'backup:list',
    create: 'backup:create',
    restore: 'backup:restore',
    remove: 'backup:remove',
    pickLocation: 'backup:pick-location'
  },
  transfer: {
    exportSnippets: 'transfer:export',
    pickExportDestination: 'transfer:pick-export-destination',
    previewImport: 'transfer:preview-import',
    commitImport: 'transfer:commit-import',
    pickFiles: 'transfer:pick-files',
    readDroppedFiles: 'transfer:read-dropped-files'
  },
  system: {
    platform: 'system:platform',
    openExternal: 'system:open-external',
    writeClipboard: 'system:write-clipboard',
    readClipboard: 'system:read-clipboard',
    openCaptureWindow: 'system:open-capture-window',
    openLauncherWindow: 'system:open-launcher',
    openSnippetInMain: 'system:open-snippet-in-main',
    setWindowTitle: 'system:set-window-title',
    closeWindow: 'system:close-window',
    hideWindow: 'system:hide-window',
    showMainWindow: 'system:show-main-window',
    setBadgeCount: 'system:set-badge',
    seedSampleData: 'system:seed-sample-data',
    session: 'system:session',
    updateSession: 'system:update-session'
  }
} as const

/** Main-process → renderer channel names. */
export const EVENTS = {
  command: 'app:command',
  dataChanged: 'app:data-changed',
  themeChanged: 'app:theme-changed',
  settingsChanged: 'app:settings-changed'
} as const

export type DataScope = 'snippets' | 'tags' | 'collections' | 'settings' | 'backups'

export interface DataChangedPayload {
  scope: DataScope
  ids?: string[]
}

/**
 * Every `ipcRenderer.invoke` resolves with this envelope rather than throwing
 * across the process boundary, so the renderer gets a readable message instead
 * of Electron's `Error invoking remote method` wrapper.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcErrorPayload }

export interface IpcErrorPayload {
  message: string
  code: string
  /** Human-facing hint shown under "View details". */
  hint?: string
  details?: string
}


/**
 * The complete surface exposed to the renderer through `window.snippetbox`.
 * Every method is validated with Zod in the main process before it touches the
 * database.
 */
export interface SnippetBoxApi {
  snippets: {
    list(options: SnippetListOptions): Promise<SnippetListResult>
    get(id: string): Promise<SnippetDetail | null>
    create(input: SnippetCreateInput): Promise<SnippetDetail>
    update(id: string, input: SnippetUpdateInput): Promise<SnippetDetail>
    duplicate(id: string): Promise<SnippetDetail>
    trash(id: string): Promise<void>
    restore(id: string): Promise<void>
    destroy(id: string): Promise<void>
    emptyTrash(): Promise<number>
    setFavorite(id: string, favorite: boolean): Promise<SnippetDetail>
    recordOpen(id: string): Promise<void>
    recordCopy(id: string): Promise<void>
    similar(input: { code: string; language?: string; excludeId?: string }): Promise<SimilarSnippet[]>
    setRelated(id: string, relatedIds: string[]): Promise<void>
    versions(id: string): Promise<SnippetVersion[]>
    saveVersion(id: string, label?: string): Promise<SnippetVersion | null>
    restoreVersion(versionId: string): Promise<SnippetDetail>
  }
  tags: {
    list(): Promise<Tag[]>
    create(input: { name: string; color?: string; icon?: string | null }): Promise<Tag>
    rename(id: string, name: string): Promise<Tag>
    update(id: string, patch: { name?: string; color?: string; icon?: string | null }): Promise<Tag>
    remove(id: string): Promise<void>
    merge(sourceId: string, targetId: string): Promise<Tag>
  }
  collections: {
    list(): Promise<Collection[]>
    create(input: { name: string; parentId?: string | null }): Promise<Collection>
    update(id: string, patch: { name?: string; parentId?: string | null }): Promise<Collection>
    remove(id: string): Promise<void>
  }
  attachments: {
    list(snippetId: string): Promise<import('./types').Attachment[]>
    add(snippetId: string, filePaths: string[]): Promise<import('./types').Attachment[]>
    remove(attachmentId: string): Promise<void>
    open(attachmentId: string): Promise<void>
    reveal(attachmentId: string): Promise<void>
    pickFiles(): Promise<string[]>
  }
  search: {
    query(options: SnippetListOptions): Promise<SnippetListResult>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
    pickDirectory(defaultPath?: string): Promise<string | null>
    revealDataLocation(): Promise<void>
    stats(): Promise<UsageStats>
  }
  backup: {
    list(): Promise<BackupInfo[]>
    create(): Promise<BackupInfo>
    restore(backupId: string): Promise<void>
    remove(backupId: string): Promise<void>
    pickLocation(): Promise<string | null>
  }
  transfer: {
    exportSnippets(request: Omit<ExportRequest, 'destination'> & { destination?: string }): Promise<ExportResult | null>
    pickExportDestination(format: ExportRequest['format'], suggestedName: string): Promise<string | null>
    previewImport(paths: string[]): Promise<ImportPreview>
    commitImport(candidates: import('./types').ImportCandidate[]): Promise<ImportResult>
    pickFiles(): Promise<string[]>
    readDroppedFiles(paths: string[]): Promise<ImportPreview>
  }
  system: {
    platform(): Promise<PlatformInfo>
    openExternal(url: string): Promise<void>
    writeClipboard(text: string): Promise<void>
    readClipboard(): Promise<string>
    openCaptureWindow(seed?: Partial<SnippetCreateInput>): Promise<void>
    openLauncherWindow(): Promise<void>
    /** Brings the main window forward and opens a snippet there (used by the launcher). */
    openSnippetInMain(id: string): Promise<void>
    setWindowTitle(title: string): Promise<void>
    closeWindow(): Promise<void>
    hideWindow(): Promise<void>
    showMainWindow(): Promise<void>
    setBadgeCount(count: number): Promise<void>
    seedSampleData(): Promise<number>
    /** Restores the last view, selection and panel widths. */
    session(): Promise<import('./types').SessionState>
    updateSession(patch: Partial<import('./types').SessionState>): Promise<import('./types').SessionState>
    /**
     * Resolves the absolute path of a dropped `File`. Runs synchronously in the
     * preload via `webUtils`, because the renderer is sandboxed and `File.path`
     * no longer exists.
     */
    getPathForFile(file: File): string
  }
  events: {
    onCommand(handler: (command: AppCommand) => void): () => void
    onDataChanged(handler: (payload: DataChangedPayload) => void): () => void
    onSettingsChanged(handler: (settings: AppSettings) => void): () => void
  }
}

export const SNIPPET_SUMMARY_FIELDS = [
  'id',
  'title',
  'description',
  'language',
  'favorite',
  'collectionId',
  'collectionName',
  'createdAt',
  'updatedAt',
  'lastOpenedAt',
  'openCount',
  'copyCount',
  'deletedAt',
  'tags',
  'codePreview',
  'lineCount',
  'hasNotes',
  'versionCount'
] as const satisfies ReadonlyArray<keyof SnippetSummary>
