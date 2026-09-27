import { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  Check,
  Cpu,
  FolderCog,
  HardDrive,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  Type
} from 'lucide-react'
import type { AppSettings, BackupFrequency, BackupInfo, ThemeMode, UsageStats } from '@shared/types'
import { CODE_FONT_SIZES, EDITOR_FONTS, TAB_SIZES, zoomPercent } from '@shared/constants'
import { formatBytes, formatDateTime, prettifyAccelerator } from '@shared/utils'
import { cn, pluralize } from '../../lib/utils'
import { Badge, Button, IconButton, SectionHeading, SettingRow, Separator, Spinner, Switch } from '@/components/ui/primitives'
import { Modal, Select, Tip } from '@/components/ui/overlays'
import { EmptyState } from '@/components/ui/bits'
import { ZoomControl } from '@/components/ZoomControl'
import { useSettingsStore } from '../../stores/settings'
import { confirmDialog, useUiStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { api, errorHint, errorMessage } from '../../lib/api'
import { toast } from '../../stores/toast'

type SectionId = 'general' | 'appearance' | 'editor' | 'storage' | 'privacy' | 'about'

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: Type },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'about', label: 'About', icon: Info }
]

export function SettingsDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.settingsOpen)
  const close = useUiStore((state) => state.closeSettings)
  const openShortcuts = useUiStore((state) => state.openShortcuts)
  const openAbout = useUiStore((state) => state.openAbout)

  const [section, setSection] = useState<SectionId>('general')

  useEffect(() => {
    if (open) setSection('general')
  }, [open])

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && close()}
      title="Settings"
      description="Everything is stored on this machine."
      size="xl"
      bodyClassName="p-0 overflow-hidden"
    >
      {/* The body opts out of padding (p-0) and this fills it, so the nav's
          divider and the content's own padding sit flush against the modal. */}
      <div className="flex h-[72vh] min-h-0">
        <nav aria-label="Settings sections" className="w-48 shrink-0 border-r border-line bg-sunken p-2">
          <ul className="space-y-0.5">
            {SECTIONS.map((entry) => {
              const Icon = entry.icon
              const active = section === entry.id
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setSection(entry.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-sm transition-colors',
                      active ? 'bg-primary-soft font-medium text-primary' : 'text-fg-secondary hover:bg-hover hover:text-fg'
                    )}
                  >
                    <Icon className={cn('size-3.5', active ? 'text-primary' : 'text-subtle')} />
                    {entry.label}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-3 border-t border-line pt-2">
            <button
              type="button"
              onClick={openShortcuts}
              className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
            >
              <Keyboard className="size-3.5 text-subtle" />
              Shortcuts
            </button>
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
          {section === 'general' ? <GeneralSection /> : null}
          {section === 'appearance' ? <AppearanceSection /> : null}
          {section === 'editor' ? <EditorSection /> : null}
          {section === 'storage' ? <StorageSection /> : null}
          {section === 'privacy' ? <PrivacySection /> : null}
          {section === 'about' ? (
            <div className="space-y-4">
              <SectionHeading hint="Version information, credits and where your data lives.">
                About SnippetBox
              </SectionHeading>
              <Button variant="secondary" onClick={openAbout}>
                Open About dialog
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/*  General                                                                    */
/* -------------------------------------------------------------------------- */

function GeneralSection(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const platform = useSettingsStore((state) => state.platform?.platform)
  const update = useSettingsStore((state) => state.update)
  const patch = (value: Partial<AppSettings>): void => void update(value)

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading hint="How SnippetBox behaves when it starts and when you delete things.">
          Behaviour
        </SectionHeading>
        <div className="divide-y divide-line">
          <SettingRow
            label="Start on system login"
            description="Launches SnippetBox in the background so quick capture is always available. Support depends on your desktop environment."
          >
            <Switch
              aria-label="Start on system login"
              checked={settings.startOnLogin}
              onCheckedChange={(checked) => patch({ startOnLogin: checked })}
            />
          </SettingRow>

          <SettingRow
            label="Reopen the last snippet"
            description="Restores the view and snippet you had open when you last quit."
          >
            <Switch
              aria-label="Reopen the last snippet"
              checked={settings.restoreLastSnippet}
              onCheckedChange={(checked) => patch({ restoreLastSnippet: checked })}
            />
          </SettingRow>

          <SettingRow
            label="Confirm destructive actions"
            description="Ask before moving snippets to Trash, deleting them permanently, or emptying Trash."
          >
            <Switch
              aria-label="Confirm destructive actions"
              checked={settings.confirmDestructive}
              onCheckedChange={(checked) => patch({ confirmDestructive: checked })}
            />
          </SettingRow>

          <SettingRow
            label="Track usage"
            description="Counts opens and copies so “Most Used” works. Purely local — it never leaves this machine."
          >
            <Switch
              aria-label="Track usage"
              checked={settings.trackUsage}
              onCheckedChange={(checked) => patch({ trackUsage: checked })}
            />
          </SettingRow>
        </div>
      </section>

      <section>
        <SectionHeading hint="System-wide shortcuts that work while SnippetBox is in the background.">
          Global shortcuts
        </SectionHeading>
        <div className="divide-y divide-line">
          <SettingRow
            label="Quick capture from anywhere"
            description={`Currently ${prettifyAccelerator(settings.quickCaptureShortcut, platform ?? 'linux')}. Registers a system-wide shortcut.`}
          >
            <Switch
              aria-label="Global quick capture"
              checked={settings.globalQuickCapture}
              onCheckedChange={(checked) => patch({ globalQuickCapture: checked })}
            />
          </SettingRow>

          <SettingRow
            label="Global search launcher"
            description={`Currently ${prettifyAccelerator(settings.globalSearchShortcut, platform ?? 'linux')}. A small search window over whatever you're doing.`}
          >
            <Switch
              aria-label="Global search"
              checked={settings.globalSearch}
              onCheckedChange={(checked) => patch({ globalSearch: checked })}
            />
          </SettingRow>
        </div>
        <p className="mt-2 text-2xs text-subtle">
          If another application already owns a combination, SnippetBox reports it and leaves it alone.
        </p>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Appearance                                                                 */
/* -------------------------------------------------------------------------- */

function AppearanceSection(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const patch = (value: Partial<AppSettings>): void => void update(value)

  const themes: Array<{ id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor }
  ]

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading hint="Light and dark are designed separately, not inverted.">Theme</SectionHeading>
        <div className="flex gap-2">
          {themes.map((theme) => {
            const Icon = theme.icon
            const active = settings.theme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => patch({ theme: theme.id })}
                aria-pressed={active}
                className={cn(
                  'flex flex-1 flex-col items-center gap-2 rounded-lg border px-3 py-3 transition-colors',
                  active
                    ? 'border-primary-border bg-primary-soft text-primary'
                    : 'border-line bg-surface text-fg-secondary hover:bg-hover'
                )}
              >
                <Icon className="size-4" />
                <span className="text-xs font-medium">{theme.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-2xs text-subtle">
          “System” follows your desktop's colour scheme and updates live when it changes.
        </p>
      </section>

      <Separator />

      <section>
        <SectionHeading hint="Density and motion preferences.">Interface</SectionHeading>
        <div className="divide-y divide-line">
          <SettingRow
            label="Zoom"
            description={`Scales the entire interface, the code editor included. Ctrl + / Ctrl − to step, Ctrl 0 to reset. Saved between sessions — currently ${zoomPercent(settings.uiFontSize)}%.`}
          >
            <ZoomControl />
          </SettingRow>

          <SettingRow
            label="Compact mode"
            description="Tighter rows and spacing — more snippets on screen."
          >
            <Switch
              aria-label="Compact mode"
              checked={settings.compactMode}
              onCheckedChange={(checked) => patch({ compactMode: checked })}
            />
          </SettingRow>

          <SettingRow label="Animations" description="Subtle transitions. Turn off for a completely still interface.">
            <Switch
              aria-label="Animations"
              checked={settings.animations}
              onCheckedChange={(checked) => patch({ animations: checked })}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Editor                                                                     */
/* -------------------------------------------------------------------------- */

function EditorSection(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const patch = (value: Partial<AppSettings>): void => void update(value)

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading hint="Applies to every code block, in reading and editing alike.">Code display</SectionHeading>
        <div className="divide-y divide-line">
          <SettingRow label="Font" description="Falls back to the next available monospace font.">
            <Select
              ariaLabel="Code font"
              value={settings.codeFont}
              onValueChange={(value) => patch({ codeFont: value })}
              className="w-44"
              options={EDITOR_FONTS.map((font) => ({ value: font, label: font }))}
            />
          </SettingRow>

          <SettingRow
            label="Code font size"
            description="Expressed at 100% zoom — it scales along with the zoom level set under Appearance."
          >
            <Select
              ariaLabel="Code font size"
              value={String(settings.codeFontSize)}
              onValueChange={(value) => patch({ codeFontSize: Number(value) })}
              className="w-28"
              options={CODE_FONT_SIZES.map((size) => ({ value: String(size), label: `${size}px` }))}
            />
          </SettingRow>

          <SettingRow label="Tab size">
            <Select
              ariaLabel="Tab size"
              value={String(settings.tabSize)}
              onValueChange={(value) => patch({ tabSize: Number(value) })}
              className="w-24"
              options={TAB_SIZES.map((size) => ({ value: String(size), label: `${size} spaces` }))}
            />
          </SettingRow>

          <SettingRow label="Line numbers" description="Shown in the gutter next to the code.">
            <Switch
              aria-label="Show line numbers"
              checked={settings.showLineNumbers}
              onCheckedChange={(checked) => patch({ showLineNumbers: checked })}
            />
          </SettingRow>

          <SettingRow label="Word wrap" description="Wraps long lines instead of scrolling horizontally.">
            <Switch
              aria-label="Word wrap"
              checked={settings.wordWrap}
              onCheckedChange={(checked) => patch({ wordWrap: checked })}
            />
          </SettingRow>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-sunken px-3 py-2.5">
        <p className="flex items-center gap-2 text-2xs text-muted">
          <Cpu className="size-3.5 text-subtle" />
          Bracket matching, auto-indent, code folding, multiple selections and find-in-code are always available.
          SnippetBox is not an IDE — it stores code and lets you tidy it.
        </p>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                    */
/* -------------------------------------------------------------------------- */

function StorageSection(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const patch = (value: Partial<AppSettings>): void => void update(value)
  const refresh = useLibraryStore((state) => state.refresh)

  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [list, usage] = await Promise.all([api.backup.list(), api.settings.stats()])
      setBackups(list)
      setStats(usage)
    } catch (error) {
      toast.error('Storage information could not be loaded', errorHint(error) ?? errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const chooseDataLocation = async (): Promise<void> => {
    const chosen = await api.settings.pickDirectory(settings.dataLocation)
    if (!chosen || chosen === settings.dataLocation) return

    const confirmed = await confirmDialog({
      title: 'Move your data folder?',
      description: `Your database and attachments will be copied to ${chosen}. Nothing is deleted from the current folder, and a safety backup is written first.`,
      confirmLabel: 'Move data'
    })
    if (!confirmed) return

    setBusy('data')
    try {
      await update({ dataLocation: chosen })
      await Promise.all([reload(), refresh({ quiet: true })])
      toast.success('Data folder moved', chosen)
    } catch (error) {
      toast.error('Your data could not be moved', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const chooseBackupLocation = async (): Promise<void> => {
    const chosen = await api.backup.pickLocation()
    if (!chosen) return
    await update({ backupLocation: chosen })
    await reload()
  }

  const createBackup = async (): Promise<void> => {
    setBusy('backup')
    try {
      const backup = await api.backup.create()
      await reload()
      toast.success('Backup created', backup.filename)
    } catch (error) {
      toast.error('Backup failed', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const restoreBackup = async (backup: BackupInfo): Promise<void> => {
    const confirmed = await confirmDialog({
      title: 'Restore this backup?',
      description: `${pluralize(backup.snippetCount, 'snippet')} from ${formatDateTime(backup.createdAt)} will replace your current library. A safety backup of the current state is taken first.`,
      confirmLabel: 'Restore backup',
      destructive: true
    })
    if (!confirmed) return

    setBusy(`restore-${backup.id}`)
    try {
      await api.backup.restore(backup.id)
      await Promise.all([reload(), refresh({ quiet: true })])
      toast.success('Backup restored')
    } catch (error) {
      toast.error('That backup could not be restored', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading hint="Because SnippetBox is local-first, backups matter.">Locations</SectionHeading>
        <div className="space-y-3">
          <div className="rounded-lg border border-line px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
              <HardDrive className="size-3.5 text-subtle" />
              Data folder
            </p>
            <p className="mt-1 break-all font-mono text-2xs text-muted" data-selectable>
              {settings.dataLocation || '—'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="secondary" loading={busy === 'data'} onClick={() => void chooseDataLocation()}>
                Move…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderCog className="size-3.5" />}
                onClick={() => void api.settings.revealDataLocation()}
              >
                Show in file manager
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-line px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
              <Archive className="size-3.5 text-subtle" />
              Backup folder
            </p>
            <p className="mt-1 break-all font-mono text-2xs text-muted" data-selectable>
              {settings.backupLocation || '—'}
            </p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => void chooseBackupLocation()}>
              Change…
            </Button>
          </div>

          <SettingRow
            label="Automatic backups"
            description="A full archive is written on this schedule when SnippetBox starts."
          >
            <Select
              ariaLabel="Automatic backups"
              value={settings.autoBackup}
              onValueChange={(value) => patch({ autoBackup: value as BackupFrequency })}
              className="w-32"
              options={[
                { value: 'off', label: 'Off' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' }
              ]}
            />
          </SettingRow>
        </div>
      </section>

      <Separator />

      <section>
        <div className="flex items-center gap-2">
          <SectionHeading hint="Each backup contains the whole database and every attachment.">
            Backups
          </SectionHeading>
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            loading={busy === 'backup'}
            icon={<Archive className="size-3.5" />}
            onClick={() => void createBackup()}
          >
            Create Backup
          </Button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : backups.length === 0 ? (
          <EmptyState
            compact
            icon={<Archive />}
            title="No backups yet."
            description="Create one now, or turn on automatic backups so this looks after itself."
          />
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {backups.map((backup) => (
              <li key={backup.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs text-fg">{formatDateTime(backup.createdAt)}</span>
                    <Badge tone={backup.reason === 'auto' ? 'neutral' : backup.reason === 'manual' ? 'primary' : 'warning'}>
                      {backup.reason}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block text-2xs text-subtle">
                    {pluralize(backup.snippetCount, 'snippet')} · {formatBytes(backup.size)}
                  </span>
                </span>
                <Tip label="Restore this backup">
                  <IconButton
                    label="Restore backup"
                    size="icon-sm"
                    loading={busy === `restore-${backup.id}`}
                    onClick={() => void restoreBackup(backup)}
                  >
                    <RotateCcw className="size-3.5" />
                  </IconButton>
                </Tip>
                <Tip label="Delete this backup file">
                  <IconButton
                    label="Delete backup"
                    size="icon-sm"
                    onClick={() =>
                      void api.backup
                        .remove(backup.id)
                        .then(reload)
                        .catch((error) => toast.error('Could not delete that backup', errorHint(error) ?? errorMessage(error)))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </Tip>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stats ? (
        <>
          <Separator />
          <section>
            <SectionHeading>Library</SectionHeading>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Snippets" value={String(stats.totalSnippets)} />
              <Stat label="Favorites" value={String(stats.favoriteSnippets)} />
              <Stat label="Tags" value={String(stats.totalTags)} />
              <Stat label="Collections" value={String(stats.totalCollections)} />
              <Stat label="In Trash" value={String(stats.trashedSnippets)} />
              <Stat label="Total copies" value={String(stats.totalCopies)} />
              <Stat label="On disk" value={formatBytes(stats.storageBytes)} />
            </dl>
          </section>
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-sunken/50 px-3 py-2">
      <dt className="text-2xs uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-fg">{value}</dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Privacy                                                                    */
/* -------------------------------------------------------------------------- */

function PrivacySection(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const patch = (value: Partial<AppSettings>): void => void update(value)

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-success/30 bg-success-soft px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-success">
          <Check className="size-3.5" />
          Your snippets are stored locally on this device.
        </p>
        <p className="mt-1 text-2xs text-muted">
          There is no account, no sign-in, no sync and no server. SnippetBox works completely offline.
        </p>
      </section>

      <section>
        <SectionHeading hint="Conservative by default — nothing is collected unless you say so.">
          Data and permissions
        </SectionHeading>
        <div className="divide-y divide-line">
          <SettingRow
            label="Send anonymous usage statistics"
            description="Off by default. SnippetBox contains no analytics code path that runs while this is off."
          >
            <Switch
              aria-label="Telemetry"
              checked={settings.telemetry}
              onCheckedChange={(checked) => patch({ telemetry: checked })}
            />
          </SettingRow>

          <SettingRow
            label="Prefill quick capture from the clipboard"
            description="When you open the quick capture window, read the clipboard once and use it as the code. SnippetBox never watches the clipboard in the background."
          >
            <Switch
              aria-label="Clipboard integration"
              checked={settings.clipboardIntegration}
              onCheckedChange={(checked) => patch({ clipboardIntegration: checked })}
            />
          </SettingRow>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-sunken px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
          <ShieldCheck className="size-3.5 text-subtle" />
          Stored code is never executed
        </p>
        <p className="mt-1 text-2xs leading-relaxed text-muted">
          SnippetBox keeps code as text. There is no “Run” button, no shell execution, and imported files are only ever
          read — never run. A snippet containing <code className="font-mono">rm -rf /</code> is just characters.
        </p>
      </section>

      <section className="rounded-lg border border-line px-3 py-2.5">
        <p className="text-xs font-medium text-fg-secondary">How your data is protected</p>
        <ul className="mt-1.5 space-y-1 text-2xs leading-relaxed text-muted">
          <li>The renderer runs sandboxed with no Node.js access; it can only call the API listed in the preload bridge.</li>
          <li>Every request from the interface is validated against a schema before it reaches the database.</li>
          <li>Markdown notes are sanitised, so a note can never inject script.</li>
          <li>Links open in your default browser — SnippetBox never renders a remote page.</li>
        </ul>
      </section>
    </div>
  )
}

export type { SectionId }
