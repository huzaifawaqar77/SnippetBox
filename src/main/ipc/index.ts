import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import type { z } from 'zod'
import type { AppSettings, SessionState, SnippetListOptions } from '@shared/types'
import { APP_NAME } from '@shared/constants'
import { EVENTS, IPC, type DataScope, type DataChangedPayload, type IpcResult } from '@shared/ipc'
import {
  clipboardTextSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
  exportRequestSchema,
  favoritePayloadSchema,
  filePathsSchema,
  idSchema,
  importCommitSchema,
  openExternalSchema,
  recordPayloadSchema,
  relatedIdsSchema,
  seedSchema,
  settingsPatchSchema,
  similarCodeSchema,
  snippetCreateSchema,
  snippetListOptionsSchema,
  snippetUpdateSchema,
  tagCreateSchema,
  tagUpdateSchema,
  versionSaveSchema,
  windowTitleSchema
} from '@shared/schemas'
import { AppError, log, messageOf, toIpcError } from '../utils'
import * as snippetsRepo from '../db/repositories/snippets'
import * as tagsRepo from '../db/repositories/tags'
import * as collectionsRepo from '../db/repositories/collections'
import * as attachmentsRepo from '../db/repositories/attachments'
import { seedSampleData } from '../db/seed'
import { getSettings, currentConfigLocation, updateSettings } from '../services/settings'
import { addAttachments, attachmentForOpen, removeAttachment } from '../services/attachments'
import { createBackup, listBackups, removeBackup, restoreBackup } from '../services/backup'
import { commitImport, exportSnippets, previewImport } from '../services/transfer'
import { relocateData } from '../services/storage'
import { prepareDirectories } from '../services/paths'
import { readSession, updateSession } from '../app-state'
import {
  applyBackgroundToWindows,
  closeWindowOfSender,
  createMainWindow,
  getFocusedWindow,
  hideWindowOfSender,
  isTrustedSender,
  broadcast,
  openCaptureWindow,
  openLauncherWindow,
  sendCommand
} from '../windows'

/**
 * Every renderer→main call goes through `handle`.
 *
 * Responsibilities kept in one place:
 *  - reject calls from web contents we did not create,
 *  - validate the payload with Zod before anything touches the database,
 *  - convert thrown errors into a readable envelope,
 *  - tell the renderer which data changed so its caches can be invalidated.
 */

interface Validator<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown }
}

type Notify = DataScope[] | 'none'

function describeIssues(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return ''
  return issues
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : ''
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

function notify(channels: Notify, payload?: DataChangedPayload): void {
  if (channels === 'none') return
  const scopes = channels
  if (scopes.length === 0) return
  for (const scope of scopes) {
    broadcast(EVENTS.dataChanged, { scope, ids: payload?.ids })
  }
}

function dataContext(): { dataLocation: string; backupLocation: string } {
  const settings = getSettings()
  return { dataLocation: settings.dataLocation, backupLocation: settings.backupLocation }
}

function handle<TInput, TOutput>(
  channel: string,
  validator: Validator<TInput>,
  handler: (input: TInput, event: IpcMainInvokeEvent) => TOutput | Promise<TOutput>,
  channels: Notify = 'none'
): void {
  ipcMain.handle(channel, async (event, raw): Promise<IpcResult<TOutput>> => {
    try {
      if (!isTrustedSender(event.sender.id)) {
        return {
          ok: false,
          error: { message: 'That request did not come from SnippetBox.', code: 'PERMISSION' }
        }
      }

      const parsed = validator.safeParse(raw)
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            message: 'That request was not valid.',
            code: 'VALIDATION',
            hint: 'Check the highlighted fields and try again.',
            details: describeIssues(parsed.error)
          }
        }
      }

      const value = await handler(parsed.data, event)
      notify(channels)
      return { ok: true, value }
    } catch (error) {
      log.debug(`IPC ${channel} failed: ${messageOf(error)}`)
      return { ok: false, error: toIpcError(error) }
    }
  })
}

function directoryPicker(defaultPath?: string): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Choose a folder',
    properties: ['openDirectory', 'createDirectory'],
    ...(defaultPath ? { defaultPath } : {})
  }
  const parent = getFocusedWindow()
  return (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)).then((result) =>
    result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null)
  )
}

function directorySize(directory: string, depth = 0): number {
  if (!existsSync(directory) || depth > 4) return 0
  let total = 0
  try {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) total += directorySize(full, depth + 1)
      else if (entry.isFile()) total += statSync(full).size
    }
  } catch {
    /* unreadable entries do not break the total */
  }
  return total
}

export function registerIpc(): void {
  // --- snippets -------------------------------------------------------------
  handle(IPC.snippets.list, snippetListOptionsSchema, (options) => snippetsRepo.listSnippets(options as SnippetListOptions))
  handle(IPC.search.query, snippetListOptionsSchema, (options) => snippetsRepo.listSnippets(options as SnippetListOptions))
  handle(IPC.snippets.get, idSchema, (id) => snippetsRepo.getSnippet(id))
  handle(IPC.snippets.create, snippetCreateSchema, (input) => snippetsRepo.createSnippet(input), ['snippets'])
  handle(
    IPC.snippets.update,
    { safeParse: (value) => tupleValidator(idSchema, snippetUpdateSchema, value) },
    ([id, patch]) => snippetsRepo.updateSnippet(id, patch),
    ['snippets']
  )
  handle(IPC.snippets.duplicate, idSchema, (id) => snippetsRepo.duplicateSnippet(id), ['snippets'])
  handle(IPC.snippets.trash, idSchema, (id) => snippetsRepo.trashSnippet(id), ['snippets'])
  handle(IPC.snippets.restore, idSchema, (id) => snippetsRepo.restoreSnippet(id), ['snippets'])

  handle(
    IPC.snippets.destroy,
    idSchema,
    (id) => {
      const paths = snippetsRepo.destroySnippet(id)
      for (const path of paths) {
        try {
          shell.trashItem(path).catch(() => undefined)
        } catch {
          /* best effort */
        }
      }
    },
    ['snippets']
  )

  handle(
    IPC.snippets.emptyTrash,
    voidValidator(),
    () => {
      const { count } = snippetsRepo.emptyTrash()
      return count
    },
    ['snippets']
  )

  handle(IPC.snippets.setFavorite, favoritePayloadSchema, ({ id, favorite }) =>
    snippetsRepo.setFavorite(id, favorite), ['snippets'])
  handle(IPC.snippets.recordOpen, recordPayloadSchema, ({ id }) => {
    if (!getSettings().trackUsage) return
    snippetsRepo.recordOpen(id)
  })
  handle(IPC.snippets.recordCopy, recordPayloadSchema, ({ id }) => {
    if (!getSettings().trackUsage) return
    snippetsRepo.recordCopy(id)
  })
  handle(IPC.snippets.similar, similarCodeSchema, (input) => snippetsRepo.findSimilar(input))
  handle(
    IPC.snippets.setRelated,
    { safeParse: (value) => tupleValidator(idSchema, relatedIdsSchema, value) },
    ([id, relatedIds]) => snippetsRepo.setRelatedSnippets(id, relatedIds),
    ['snippets']
  )
  handle(IPC.snippets.versions, idSchema, (id) => snippetsRepo.listVersions(id))
  handle(IPC.snippets.saveVersion, versionSaveSchema, ({ id }) => {
    const snippet = snippetsRepo.requireSnippet(id)
    return snippetsRepo.recordVersion(snippet, { force: true })
  })
  handle(IPC.snippets.restoreVersion, idSchema, (versionId) => snippetsRepo.restoreVersion(versionId), ['snippets'])

  // --- tags -----------------------------------------------------------------
  handle(IPC.tags.list, voidValidator(), () => tagsRepo.listTags())
  handle(IPC.tags.create, tagCreateSchema, (input) => tagsRepo.createTag(input), ['tags', 'snippets'])
  handle(
    IPC.tags.update,
    { safeParse: (value) => tupleValidator(idSchema, tagUpdateSchema, value) },
    ([id, patch]) => tagsRepo.updateTag(id, patch),
    ['tags', 'snippets']
  )
  handle(IPC.tags.remove, idSchema, (id) => tagsRepo.deleteTag(id), ['tags', 'snippets'])
  handle(
    IPC.tags.merge,
    {
      safeParse: (value) =>
        tupleValidator(idSchema, idSchema, value) as
          | { success: true; data: [string, string] }
          | { success: false; error: unknown }
    },
    ([sourceId, targetId]) => tagsRepo.mergeTags(sourceId, targetId),
    ['tags', 'snippets']
  )

  // --- collections ----------------------------------------------------------
  handle(IPC.collections.list, voidValidator(), () => collectionsRepo.listCollections())
  handle(IPC.collections.create, collectionCreateSchema, (input) => collectionsRepo.createCollection(input), [
    'collections',
    'snippets'
  ])
  handle(
    IPC.collections.update,
    { safeParse: (value) => tupleValidator(idSchema, collectionUpdateSchema, value) },
    ([id, patch]) => collectionsRepo.updateCollection(id, patch),
    ['collections', 'snippets']
  )
  handle(IPC.collections.remove, idSchema, (id) => collectionsRepo.deleteCollection(id), [
    'collections',
    'snippets'
  ])

  // --- attachments ----------------------------------------------------------
  handle(IPC.attachments.list, idSchema, (snippetId) => attachmentsRepo.listAttachments(snippetId))
  handle(
    IPC.attachments.add,
    {
      safeParse: (value) => {
        const result = tupleValidator(idSchema, filePathsSchema, value)
        return result as
          | { success: true; data: [string, string[]] }
          | { success: false; error: unknown }
      }
    },
    ([snippetId, filePaths]) => addAttachments({ snippetId, filePaths, dataLocation: dataContext().dataLocation }),
    ['snippets']
  )
  handle(IPC.attachments.remove, idSchema, (attachmentId) => removeAttachment(attachmentId), ['snippets'])
  handle(IPC.attachments.open, idSchema, async (attachmentId) => {
    const { path } = attachmentForOpen(attachmentId)
    const error = await shell.openPath(path)
    if (error) throw new AppError('That file could not be opened.', { code: 'FILE_SYSTEM', hint: error })
  })
  handle(IPC.attachments.reveal, idSchema, (attachmentId) => {
    const { path } = attachmentForOpen(attachmentId)
    shell.showItemInFolder(path)
  })
  handle(IPC.attachments.pickFiles, voidValidator(), async () => {
    const options: OpenDialogOptions = {
      title: 'Attach files',
      properties: ['openFile', 'multiSelections']
    }
    const parent = getFocusedWindow()
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  // --- settings -------------------------------------------------------------
  handle(IPC.settings.get, voidValidator(), () => getSettings())
  handle(IPC.settings.update, settingsPatchSchema, async (patch) => {
    const current = getSettings()
    const next = patch as Partial<AppSettings>

    let locationPatch: Partial<AppSettings> = {}

    if (next.dataLocation && next.dataLocation !== current.dataLocation) {
      const relocated = await relocateData(next.dataLocation, dataContext())
      locationPatch = {
        dataLocation: relocated.dataLocation,
        backupLocation: relocated.backupLocation
      }
      if (next.backupLocation === current.backupLocation && relocated.backupLocation !== current.backupLocation) {
        delete next.backupLocation
      }
      prepareDirectories(currentConfigLocation(), relocated.dataLocation, relocated.backupLocation)
    }

    const saved = updateSettings({ ...next, ...locationPatch })
    return saved
  }, ['settings'])
  handle(IPC.settings.pickDirectory, { safeParse: (value) => optionalStringValidator(value) }, (defaultPath) =>
    directoryPicker(defaultPath)
  )
  handle(IPC.settings.revealDataLocation, voidValidator(), () => {
    shell.showItemInFolder(join(dataContext().dataLocation, 'database.sqlite'))
  })
  handle(IPC.settings.stats, voidValidator(), () => {
    const { dataLocation } = dataContext()
    return snippetsRepo.usageStats(directorySize(dataLocation))
  })

  // --- backup ---------------------------------------------------------------
  handle(IPC.backup.list, voidValidator(), () => listBackups(dataContext()))
  handle(IPC.backup.create, voidValidator(), () => createBackup('manual', dataContext()), ['backups'])
  handle(IPC.backup.restore, idSchema, async (id) => {
    await restoreBackup(id, dataContext())
    const settings = getSettings()
    applyBackgroundToWindows(settings.theme)
  }, ['snippets', 'tags', 'collections', 'backups'])
  handle(IPC.backup.remove, idSchema, (id) => removeBackup(id, dataContext()), ['backups'])
  handle(IPC.backup.pickLocation, voidValidator(), () => directoryPicker(dataContext().backupLocation))

  // --- import / export ------------------------------------------------------
  handle(
    IPC.transfer.exportSnippets,
    exportRequestSchema,
    async (request: z.infer<typeof exportRequestSchema>) => {
      let destination = request.destination

      if (!destination) {
        destination = (await suggestDestination(request.format, 'snippetbox-export')) ?? undefined
        if (!destination) return null
      }

      return exportSnippets({
        format: request.format,
        view: request.view,
        ids: request.ids,
        query: request.query,
        includeAttachments: request.includeAttachments,
        destination
      })
    },
    []
  )

  handle(
    IPC.transfer.pickExportDestination,
    { safeParse: (value) => exportDestinationValidator(value) },
    ({ format, suggestedName }) => suggestDestination(format, suggestedName)
  )

  handle(IPC.transfer.previewImport, filePathsSchema, (paths) => previewImport(paths))
  handle(IPC.transfer.readDroppedFiles, filePathsSchema, (paths) => previewImport(paths))
  handle(IPC.transfer.commitImport, importCommitSchema, (candidates) => commitImport(candidates), ['snippets'])
  handle(IPC.transfer.pickFiles, voidValidator(), async () => {
    const options: OpenDialogOptions = {
      title: 'Import snippets',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [
        { name: 'All supported', extensions: ['json', 'md', 'markdown', 'zip', 'txt'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'SnippetBox archive', extensions: ['zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const parent = getFocusedWindow()
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  // --- system ---------------------------------------------------------------
  handle(IPC.system.platform, voidValidator(), () => ({
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    isPackaged: app.isPackaged
  }))

  handle(IPC.system.openExternal, openExternalSchema, async (url) => {
    await shell.openExternal(url)
  })

  handle(IPC.system.writeClipboard, clipboardTextSchema, (text) => {
    clipboard.writeText(text)
  })

  handle(IPC.system.readClipboard, voidValidator(), () => clipboard.readText())

  handle(IPC.system.openCaptureWindow, seedSchema, (seed) => {
    openCaptureWindow(seed)
  })

  handle(IPC.system.openLauncherWindow, voidValidator(), () => {
    openLauncherWindow()
  })

  handle(IPC.system.openSnippetInMain, idSchema, (id) => {
    // Raise the main window and let it navigate to the snippet.
    const window = createMainWindow()
    window.show()
    window.focus()
    sendCommand({ type: 'open-snippet', id })
  })

  handle(IPC.system.setWindowTitle, windowTitleSchema, (title, event) => {
    const window = getFocusedWindow()
    if (window && window.webContents.id === event.sender.id) window.setTitle(title)
  })

  handle(IPC.system.closeWindow, voidValidator(), (_input, event) => {
    closeWindowOfSender(event.sender.id)
  })

  handle(IPC.system.hideWindow, voidValidator(), (_input, event) => {
    hideWindowOfSender(event.sender.id)
  })

  handle(IPC.system.showMainWindow, voidValidator(), () => {
    const window = createMainWindow()
    window.show()
    window.focus()
  })

  handle(IPC.system.setBadgeCount, { safeParse: (value) => badgeValidator(value) }, (count) => {
    if (typeof app.setBadgeCount === 'function') app.setBadgeCount(count)
    return count
  })

  handle(IPC.system.seedSampleData, voidValidator(), () => seedSampleData(), ['snippets', 'collections'])

  handle(IPC.system.session, voidValidator(), () => readSession())

  handle(IPC.system.updateSession, sessionPatchValidator(), (patch) => updateSession(patch))

  log.debug(`registered IPC handlers for ${APP_NAME}`)
}

function suggestDestination(format: 'json' | 'markdown' | 'zip', suggestedName: string): Promise<string | null> {
  const parent = getFocusedWindow()

  if (format === 'markdown') {
    return (parent
      ? dialog.showOpenDialog(parent, {
          title: 'Choose an export folder',
          properties: ['openDirectory', 'createDirectory']
        })
      : dialog.showOpenDialog({ title: 'Choose an export folder', properties: ['openDirectory', 'createDirectory'] })
    ).then((result) => (result.canceled || !result.filePaths[0] ? null : result.filePaths[0]))
  }

  const extension = format === 'json' ? 'json' : 'zip'
  const options: SaveDialogOptions = {
    title: 'Export snippets',
    defaultPath: `${suggestedName}.${extension}`,
    filters: [
      {
        name: format === 'json' ? 'JSON' : 'SnippetBox archive',
        extensions: [extension]
      }
    ]
  }

  return (parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)).then((result) =>
    result.canceled || !result.filePath ? null : result.filePath
  )
}

// --- small validator helpers -------------------------------------------------

function voidValidator(): Validator<undefined> {
  return {
    safeParse: (value) =>
      value === undefined || value === null ? { success: true, data: undefined } : { success: false, error: null }
  }
}

function optionalStringValidator(value: unknown): { success: true; data: string | undefined } | { success: false; error: unknown } {
  if (value === undefined || value === null) return { success: true, data: undefined }
  if (typeof value === 'string' && value.length <= 4096) return { success: true, data: value }
  return { success: false, error: null }
}

function badgeValidator(value: unknown): { success: true; data: number } | { success: false; error: unknown } {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999) {
    return { success: true, data: value }
  }
  return { success: false, error: null }
}

interface ExportDestinationRequest {
  format: 'json' | 'markdown' | 'zip'
  suggestedName: string
}

function exportDestinationValidator(
  value: unknown
): { success: true; data: ExportDestinationRequest } | { success: false; error: unknown } {
  const record = value as { format?: unknown; suggestedName?: unknown } | null
  if (!record) return { success: false, error: null }

  const { format } = record
  if (format !== 'json' && format !== 'markdown' && format !== 'zip') return { success: false, error: null }

  const { suggestedName } = record
  if (typeof suggestedName !== 'string' || suggestedName.length > 300) return { success: false, error: null }

  return { success: true, data: { format, suggestedName } }
}

function tupleValidator<A, B>(
  first: Validator<A>,
  second: Validator<B>,
  value: unknown
): { success: true; data: [A, B] } | { success: false; error: unknown } {
  if (!Array.isArray(value) || value.length !== 2) return { success: false, error: null }
  const left = first.safeParse(value[0])
  if (!left.success) return { success: false, error: left.error }
  const right = second.safeParse(value[1])
  if (!right.success) return { success: false, error: right.error }
  return { success: true, data: [left.data, right.data] }
}

/**
 * Session patches arrive from the renderer and are already sanitised on write,
 * so this only has to reject non-objects and hand the rest through.
 */
function sessionPatchValidator(): Validator<Partial<SessionState>> {
  return {
    safeParse: (value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? { success: true, data: value as Partial<SessionState> }
        : { success: false, error: null }
  }
}
