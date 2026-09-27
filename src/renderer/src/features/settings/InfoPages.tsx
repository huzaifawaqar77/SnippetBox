import { useMemo } from 'react'
import { Puzzle, HardDrive, Keyboard, ShieldCheck } from 'lucide-react'
import { APP_NAME, APP_TAGLINE, SHORTCUTS } from '@shared/constants'
import { prettifyAccelerator } from '@shared/utils'
import { Badge, Kbd, Separator } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/overlays'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'

/* -------------------------------------------------------------------------- */
/*  Keyboard shortcuts                                                         */
/* -------------------------------------------------------------------------- */

export function ShortcutsDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.shortcutsOpen)
  const close = useUiStore((state) => state.closeShortcuts)
  const platform = useSettingsStore((state) => state.platform)

  const grouped = useMemo(() => {
    const map = new Map<string, typeof SHORTCUTS>()
    for (const shortcut of SHORTCUTS) {
      const bucket = map.get(shortcut.category)
      if (bucket) bucket.push(shortcut)
      else map.set(shortcut.category, [shortcut])
    }
    return [...map.entries()]
  }, [])

  const isMac = platform?.platform === 'darwin'

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && close()}
      title="Keyboard shortcuts"
      description="Every important action is reachable without a mouse."
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 rounded-md border border-line bg-sunken px-3 py-2">
          <Keyboard className="size-3.5 text-subtle" />
          <p className="text-2xs text-muted">
            {isMac ? 'On macOS, CommandOrControl maps to ⌘.' : 'Ctrl is used throughout.'} Shortcuts are fixed in this
            release.
          </p>
        </div>

        {grouped.map(([category, shortcuts]) => (
          <section key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{category}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {shortcuts.map((shortcut) => (
                <li key={shortcut.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-fg-secondary">{shortcut.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {prettifyAccelerator(shortcut.accelerator, platform?.platform ?? 'linux')
                      .split(isMac ? '' : '+')
                      .filter(Boolean)
                      .map((part, index) => (
                        <Kbd key={`${shortcut.id}-${index}`}>{part}</Kbd>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Global (when enabled)</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            <li className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-sm text-fg-secondary">Quick capture from anywhere</span>
              <Kbd>{prettifyAccelerator('Control+Alt+S', platform?.platform ?? 'linux')}</Kbd>
            </li>
            <li className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-sm text-fg-secondary">Global search launcher</span>
              <Kbd>{prettifyAccelerator('Control+Alt+Space', platform?.platform ?? 'linux')}</Kbd>
            </li>
          </ul>
          <p className="mt-2 text-2xs text-subtle">
            Enable these under Settings → General. They are off by default so SnippetBox never takes a shortcut away
            from another application.
          </p>
        </section>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/*  About                                                                      */
/* -------------------------------------------------------------------------- */

export function AboutDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.aboutOpen)
  const close = useUiStore((state) => state.closeAbout)
  const platform = useSettingsStore((state) => state.platform)
  const settings = useSettingsStore((state) => state.settings)

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && close()}
      title={`About ${APP_NAME}`}
      size="sm"
      footer={
        <p className="mr-auto text-2xs text-subtle">
          Built for developers who don't want to solve the same problem twice.
        </p>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-on-primary"
          >
            SB
          </span>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-fg">{APP_NAME}</h3>
            <p className="text-xs text-muted">{APP_TAGLINE}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-subtle">Version</dt>
            <dd className="text-fg-secondary">{platform?.appVersion ?? '1.0.0'}</dd>
          </div>
          <div>
            <dt className="text-subtle">Electron</dt>
            <dd className="text-fg-secondary">{platform?.electronVersion ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-subtle">Platform</dt>
            <dd className="text-fg-secondary">
              {platform ? `${platform.platform} · ${platform.arch}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Build</dt>
            <dd className="text-fg-secondary">{platform?.isPackaged ? 'Packaged' : 'Development'}</dd>
          </div>
        </dl>

        <Separator />

        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <ShieldCheck className="size-3.5 text-success" />
            Privacy
          </h4>
          <p className="text-xs leading-relaxed text-muted">
            Your snippets are stored locally on this device. Cloud synchronization is not enabled, there is no account,
            and nothing is sent anywhere.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={settings.telemetry ? 'warning' : 'success'}>
              Telemetry {settings.telemetry ? 'on (opt-in)' : 'off'}
            </Badge>
            <Badge tone="neutral">No account</Badge>
            <Badge tone="neutral">Fully offline</Badge>
            {settings.clipboardIntegration ? <Badge tone="warning">Clipboard reading enabled</Badge> : null}
          </div>
        </section>

        <Separator />

        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <HardDrive className="size-3.5 text-subtle" />
            Where your data lives
          </h4>
          <p className="font-mono text-2xs break-all text-muted" data-selectable>
            {settings.dataLocation || '—'}
          </p>
          <p className="font-mono text-2xs break-all text-subtle" data-selectable>
            backups: {settings.backupLocation || '—'}
          </p>
        </section>

        <Separator />

        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Puzzle className="size-3.5 text-subtle" />
            Built with
          </h4>
          <p className="text-xs text-muted">
            Electron, React, TypeScript, Vite, Tailwind CSS, Radix UI, CodeMirror 6 and SQLite with FTS5 full-text
            search.
          </p>
          <p className="text-2xs text-subtle">
            SnippetBox stores code. It never executes stored code and never runs shell commands from your snippets.
          </p>
        </section>
      </div>
    </Modal>
  )
}
