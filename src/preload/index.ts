import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppCommand, AppSettings } from '@shared/types'
import { EVENTS, IPC, type DataChangedPayload, type IpcResult, type SnippetBoxApi } from '@shared/ipc'

/**
 * The only bridge between the renderer and the main process.
 *
 * The renderer runs with `contextIsolation: true`, `nodeIntegration: false` and
 * `sandbox: true`, so it has no access to Node.js, the filesystem or SQLite.
 * Everything it can do is the explicit list below.
 */

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok) return result.value
    const error = new Error(result.error.message) as Error & {
      code?: string
      hint?: string
      details?: string
    }
    error.code = result.error.code
    error.hint = result.error.hint
    error.details = result.error.details
    throw error
  }
  // Defensive: an unexpected shape should not silently resolve to undefined.
  throw new Error('SnippetBox received an unexpected response from the main process.')
}

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: SnippetBoxApi = {
  snippets: {
    list: (options) => invoke(IPC.snippets.list, options),
    get: (id) => invoke(IPC.snippets.get, id),
    create: (input) => invoke(IPC.snippets.create, input),
    update: (id, input) => invoke(IPC.snippets.update, id, input),
    duplicate: (id) => invoke(IPC.snippets.duplicate, id),
    trash: (id) => invoke(IPC.snippets.trash, id),
    restore: (id) => invoke(IPC.snippets.restore, id),
    destroy: (id) => invoke(IPC.snippets.destroy, id),
    emptyTrash: () => invoke(IPC.snippets.emptyTrash),
    setFavorite: (id, favorite) => invoke(IPC.snippets.setFavorite, { id, favorite }),
    recordOpen: (id) => invoke(IPC.snippets.recordOpen, { id }),
    recordCopy: (id) => invoke(IPC.snippets.recordCopy, { id }),
    similar: (input) => invoke(IPC.snippets.similar, input),
    setRelated: (id, relatedIds) => invoke(IPC.snippets.setRelated, { id, relatedIds }),
    versions: (id) => invoke(IPC.snippets.versions, id),
    saveVersion: (id, label) => invoke(IPC.snippets.saveVersion, { id, label }),
    restoreVersion: (versionId) => invoke(IPC.snippets.restoreVersion, versionId)
  },
  tags: {
    list: () => invoke(IPC.tags.list),
    create: (input) => invoke(IPC.tags.create, input),
    rename: (id, name) => invoke(IPC.tags.update, id, { name }),
    update: (id, patch) => invoke(IPC.tags.update, id, patch),
    remove: (id) => invoke(IPC.tags.remove, id),
    merge: (sourceId, targetId) => invoke(IPC.tags.merge, { sourceId, targetId })
  },
  collections: {
    list: () => invoke(IPC.collections.list),
    create: (input) => invoke(IPC.collections.create, input),
    update: (id, patch) => invoke(IPC.collections.update, id, patch),
    remove: (id) => invoke(IPC.collections.remove, id)
  },
  attachments: {
    list: (snippetId) => invoke(IPC.attachments.list, snippetId),
    add: (snippetId, filePaths) => invoke(IPC.attachments.add, { snippetId, filePaths }),
    remove: (attachmentId) => invoke(IPC.attachments.remove, attachmentId),
    open: (attachmentId) => invoke(IPC.attachments.open, attachmentId),
    reveal: (attachmentId) => invoke(IPC.attachments.reveal, attachmentId),
    pickFiles: () => invoke(IPC.attachments.pickFiles)
  },
  search: {
    query: (options) => invoke(IPC.search.query, options)
  },
  settings: {
    get: () => invoke(IPC.settings.get),
    update: (patch) => invoke(IPC.settings.update, patch),
    pickDirectory: (defaultPath) => invoke(IPC.settings.pickDirectory, defaultPath),
    revealDataLocation: () => invoke(IPC.settings.revealDataLocation),
    stats: () => invoke(IPC.settings.stats)
  },
  backup: {
    list: () => invoke(IPC.backup.list),
    create: () => invoke(IPC.backup.create),
    restore: (backupId) => invoke(IPC.backup.restore, backupId),
    remove: (backupId) => invoke(IPC.backup.remove, backupId),
    pickLocation: () => invoke(IPC.backup.pickLocation)
  },
  transfer: {
    exportSnippets: (request) => invoke(IPC.transfer.exportSnippets, request),
    pickExportDestination: (format, suggestedName) =>
      invoke(IPC.transfer.pickExportDestination, { format, suggestedName }),
    previewImport: (paths) => invoke(IPC.transfer.previewImport, paths),
    commitImport: (candidates) => invoke(IPC.transfer.commitImport, candidates),
    pickFiles: () => invoke(IPC.transfer.pickFiles),
    readDroppedFiles: (paths) => invoke(IPC.transfer.readDroppedFiles, paths)
  },
  system: {
    platform: () => invoke(IPC.system.platform),
    openExternal: (url) => invoke(IPC.system.openExternal, url),
    writeClipboard: (text) => invoke(IPC.system.writeClipboard, text),
    readClipboard: () => invoke(IPC.system.readClipboard),
    openCaptureWindow: (seed) => invoke(IPC.system.openCaptureWindow, seed),
    openLauncherWindow: () => invoke(IPC.system.openLauncherWindow),
    openSnippetInMain: (id) => invoke(IPC.system.openSnippetInMain, id),
    setWindowTitle: (title) => invoke(IPC.system.setWindowTitle, title),
    closeWindow: () => invoke(IPC.system.closeWindow),
    hideWindow: () => invoke(IPC.system.hideWindow),
    showMainWindow: () => invoke(IPC.system.showMainWindow),
    setBadgeCount: (count) => invoke(IPC.system.setBadgeCount, count),
    seedSampleData: () => invoke(IPC.system.seedSampleData),
    session: () => invoke(IPC.system.session),
    updateSession: (patch) => invoke(IPC.system.updateSession, patch),
    // Synchronous by necessity: the drop handler needs the path immediately.
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  events: {
    onCommand: (handler: (command: AppCommand) => void) => subscribe(EVENTS.command, handler),
    onDataChanged: (handler: (payload: DataChangedPayload) => void) => subscribe(EVENTS.dataChanged, handler),
    onSettingsChanged: (handler: (settings: AppSettings) => void) => subscribe(EVENTS.settingsChanged, handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('snippetbox', api)
} else {
  // Should never happen: the window is created with contextIsolation enabled.
  throw new Error('SnippetBox requires context isolation to be enabled.')
}

export type { SnippetBoxApi }
