import { useState } from 'react'
import { ArrowRight, Check, FolderOpen, HardDrive, ShieldCheck, Sparkles } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '@shared/constants'
import { Button, Switch } from '@/components/ui/primitives'
import { useSettingsStore } from '../../stores/settings'
import { useLibraryStore } from '../../stores/library'
import { useUiStore } from '../../stores/ui'
import { api, errorHint, errorMessage } from '../../lib/api'
import { toast } from '../../stores/toast'

/**
 * First launch (section 45 of the product spec).
 *
 * No account, no sign-in — just where your data lives, and whether you want a
 * few examples to start from.
 */
export function Onboarding(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const refresh = useLibraryStore((state) => state.refresh)
  const bootstrap = useLibraryStore((state) => state.bootstrap)
  const setOnboardingOpen = useUiStore((state) => state.setOnboardingOpen)

  const [step, setStep] = useState<'welcome' | 'location'>('welcome')
  const [seed, setSeed] = useState(true)
  const [busy, setBusy] = useState(false)

  const chooseLocation = async (): Promise<void> => {
    const chosen = await api.settings.pickDirectory(settings.dataLocation)
    if (!chosen) return

    setBusy(true)
    try {
      await update({ dataLocation: chosen })
      toast.success('Data folder set', chosen)
    } catch (error) {
      toast.error('That folder could not be used', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const finish = async (): Promise<void> => {
    setBusy(true)
    try {
      if (seed) {
        const count = await api.system.seedSampleData()
        if (count > 0) toast.success(`Added ${count} example snippets`)
      }
      await update({ onboardingComplete: true })
      await bootstrap()
      await refresh({ quiet: true })
      setOnboardingOpen(false)
    } catch (error) {
      toast.error('Setup could not be completed', errorHint(error) ?? errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface px-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-on-primary"
          >
            SB
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Welcome to {APP_NAME}</h1>
            <p className="text-sm text-muted">{APP_TAGLINE}</p>
          </div>
        </div>

        {step === 'welcome' ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-fg-secondary">
              SnippetBox keeps the solutions you find — code, commands, configurations and the notes that explain why
              they work — so you never have to solve the same problem twice.
            </p>

            <ul className="space-y-2">
              {[
                'Everything stays on your machine. No account, no sync, no server.',
                'Search across titles, code, tags and notes instantly.',
                'Copy code in one keystroke, straight back into your editor.'
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-fg-secondary">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-sunken px-3 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                  <Sparkles className="size-3.5 text-primary" />
                  Start with a few examples
                </p>
                <p className="mt-0.5 text-2xs text-muted">
                  Twelve genuinely useful snippets so the app is not an empty box. You can delete them any time.
                </p>
              </div>
              <Switch aria-label="Add example snippets" checked={seed} onCheckedChange={setSeed} />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button variant="primary" onClick={() => setStep('location')} icon={<ArrowRight className="size-3.5" />}>
                Get Started
              </Button>
              <p className="text-2xs text-subtle">Private by default — no telemetry, ever, unless you turn it on.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <HardDrive className="size-3.5 text-subtle" />
                Choose where {APP_NAME} stores your data
              </h2>
              <p className="mt-1 text-xs text-muted">
                The database and any attachments live in this folder. You can move it later from Settings.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-subtle">Default location</p>
              <p className="mt-0.5 break-all font-mono text-2xs text-fg-secondary" data-selectable>
                {settings.dataLocation || '~/.local/share/snippetbox'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" loading={busy} onClick={() => void finish()}>
                Use this location
              </Button>
              <Button
                variant="secondary"
                icon={<FolderOpen className="size-3.5" />}
                onClick={() => void chooseLocation()}
              >
                Choose Location…
              </Button>
              <Button variant="ghost" onClick={() => setStep('welcome')}>
                Back
              </Button>
            </div>

            <p className="flex items-center gap-1.5 text-2xs text-subtle">
              <ShieldCheck className="size-3" />
              Nothing is uploaded. Cloud synchronization is not part of SnippetBox.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
