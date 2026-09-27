import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  BookOpen,
  Braces,
  Check,
  Download,
  Eye,
  Flame,
  Hash,
  Info,
  Keyboard,
  Library,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sidebar,
  Star,
  Sun,
  Trash2,
  Upload
} from 'lucide-react'
import { VIEWS } from '@shared/constants'
import type { AppSettings } from '@shared/types'
import { cn } from '../../lib/utils'
import { Kbd, Spinner } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/overlays'
import { useUiStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { toast } from '../../stores/toast'
import { api, errorHint, errorMessage } from '../../lib/api'

interface Command {
  id: string
  label: string
  group: 'Create' | 'Navigate' | 'Appearance' | 'Data' | 'Application'
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  keywords?: string
  run: () => void | Promise<void>
}

function nextTheme(current: AppSettings['theme']): AppSettings['theme'] {
  if (current === 'light') return 'dark'
  if (current === 'dark') return 'system'
  return 'light'
}

/**
 * Command palette (section 19 of the product spec).
 *
 * Filtering is a simple subsequence match over the label and keywords, which is
 * both instant and forgiving — no dependency, no index to keep warm.
 */
export function CommandPalette(): React.JSX.Element {
  const open = useUiStore((state) => state.commandPaletteOpen)
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen)
  const openSettings = useUiStore((state) => state.openSettings)
  const openShortcuts = useUiStore((state) => state.openShortcuts)
  const openAbout = useUiStore((state) => state.openAbout)
  const openImport = useUiStore((state) => state.openImport)
  const openExport = useUiStore((state) => state.openExport)

  const setView = useLibraryStore((state) => state.setView)
  const startCreate = useLibraryStore((state) => state.startCreate)
  const emptyTrash = useLibraryStore((state) => state.emptyTrash)
  const refresh = useLibraryStore((state) => state.refresh)

  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.update)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = useMemo<Command[]>(() => {
    const viewCommands: Command[] = VIEWS.map((view) => ({
      id: `view-${view.id}`,
      label: `Open ${view.label}`,
      group: 'Navigate',
      icon:
        view.id === 'favorites'
          ? Star
          : view.id === 'trash'
            ? Trash2
            : view.id === 'most-used'
              ? Flame
              : view.id === 'recent-opened'
                ? Eye
                : Library,
      keywords: `${view.id} ${view.label}`,
      run: () => setView(view.id)
    }))

    return [
      {
        id: 'new-snippet',
        label: 'Create new snippet',
        group: 'Create',
        icon: Plus,
        hint: 'Ctrl N',
        run: () => startCreate()
      },
      {
        id: 'capture',
        label: 'Open quick capture window',
        group: 'Create',
        icon: Braces,
        hint: 'Ctrl Shift N',
        run: () => api.system.openCaptureWindow()
      },
      {
        id: 'search',
        label: 'Search snippets',
        group: 'Navigate',
        icon: Search,
        hint: 'Ctrl K',
        run: () => {
          document.getElementById('global-search-input')?.focus()
        }
      },
      ...viewCommands,
      {
        id: 'toggle-theme',
        label: `Switch theme (currently ${settings.theme})`,
        group: 'Appearance',
        icon: settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Sidebar,
        hint: 'Ctrl Shift L',
        keywords: 'dark light system mode',
        run: () => updateSettings({ theme: nextTheme(settings.theme) })
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle sidebar',
        group: 'Appearance',
        icon: Sidebar,
        hint: 'Ctrl B',
        run: () => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
      },
      {
        id: 'import',
        label: 'Import snippets',
        group: 'Data',
        icon: Upload,
        hint: 'Ctrl Shift I',
        run: () => openImport(null)
      },
      {
        id: 'export',
        label: 'Export snippets',
        group: 'Data',
        icon: Download,
        hint: 'Ctrl Shift E',
        run: () => openExport(null)
      },
      {
        id: 'backup',
        label: 'Create backup',
        group: 'Data',
        icon: Archive,
        run: async () => {
          setBusy('backup')
          try {
            const backup = await api.backup.create()
            toast.success('Backup created', backup.filename)
          } catch (error) {
            toast.error('Backup failed', errorHint(error) ?? errorMessage(error))
          } finally {
            setBusy(null)
          }
        }
      },
      {
        id: 'empty-trash',
        label: 'Empty Trash',
        group: 'Data',
        icon: Trash2,
        keywords: 'delete permanently',
        run: async () => {
          setView('trash')
          await emptyTrash()
        }
      },
      {
        id: 'seed',
        label: 'Add example snippets',
        group: 'Data',
        icon: BookOpen,
        keywords: 'sample demo starter',
        run: async () => {
          setBusy('seed')
          try {
            const count = await api.system.seedSampleData()
            await refresh({ quiet: true })
            toast.success(count > 0 ? `Added ${count} example snippets` : 'Examples are already installed')
          } catch (error) {
            toast.error('Could not add examples', errorHint(error) ?? errorMessage(error))
          } finally {
            setBusy(null)
          }
        }
      },
      { id: 'settings', label: 'Open settings', group: 'Application', icon: Settings, hint: 'Ctrl ,', run: openSettings },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Application',
        icon: Keyboard,
        hint: 'Ctrl /',
        keywords: 'keys bindings',
        run: openShortcuts
      },
      { id: 'about', label: 'About SnippetBox', group: 'Application', icon: Info, run: openAbout },
      {
        id: 'quit',
        label: 'Quit application',
        group: 'Application',
        icon: LogOut,
        keywords: 'exit close',
        run: () => api.system.closeWindow()
      }
    ]
  }, [
    emptyTrash,
    openAbout,
    openExport,
    openImport,
    openSettings,
    openShortcuts,
    refresh,
    setView,
    settings.sidebarCollapsed,
    settings.theme,
    startCreate,
    updateSettings
  ])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands

    const scored = commands
      .map((command) => ({ command, score: subsequenceScore(needle, `${command.label} ${command.keywords ?? ''}`.toLowerCase()) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map((entry) => entry.command)
  }, [commands, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const runCommand = async (command: Command): Promise<void> => {
    setOpen(false)
    await command.run()
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      size="sm"
      bodyClassName="p-0"
      footer={undefined}
    >
      {/* Fills the padding-free body so the header and footer rules reach the
          modal edges. */}
      <div>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search className="size-3.5 shrink-0 text-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((value) => Math.min(filtered.length - 1, value + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((value) => Math.max(0, value - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const command = filtered[cursor]
                if (command) void runCommand(command)
              }
            }}
            placeholder="Type a command…"
            aria-label="Command"
            className="h-6 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          {busy ? <Spinner className="size-3.5" /> : null}
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">No matching commands.</p>
        ) : (
          <ul ref={listRef} className="max-h-[17.8rem] overflow-y-auto p-1.5">
            {filtered.map((command, index) => {
              const Icon = command.icon
              const showGroup = index === 0 || filtered[index - 1]?.group !== command.group

              return (
                <li key={command.id}>
                  {showGroup ? (
                    <p className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-subtle">
                      {command.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => void runCommand(command)}
                    className={cn(
                      'flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-sm transition-colors',
                      index === cursor ? 'bg-primary-soft text-primary' : 'text-fg-secondary hover:bg-hover'
                    )}
                  >
                    <Icon className={cn('size-3.5 shrink-0', index === cursor ? 'text-primary' : 'text-subtle')} />
                    <span className="min-w-0 flex-1 truncate text-left">{command.label}</span>
                    {command.hint ? <Kbd>{command.hint}</Kbd> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-2xs text-subtle">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> run
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Check className="size-2.5" /> {filtered.length} commands
          </span>
        </div>
      </div>
    </Modal>
  )
}

/** Ranks a label by how compactly the query characters appear inside it. */
function subsequenceScore(needle: string, haystack: string): number {
  if (!needle) return 1
  if (haystack.includes(needle)) return 1000 - haystack.indexOf(needle)

  let score = 0
  let index = 0
  let streak = 0

  for (const character of needle) {
    const found = haystack.indexOf(character, index)
    if (found === -1) return 0
    streak = found === index ? streak + 1 : 1
    score += streak
    index = found + 1
  }

  return score
}

export { Hash }
