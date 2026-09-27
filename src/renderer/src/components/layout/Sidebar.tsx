import { useMemo } from 'react'
import {
  CalendarPlus,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Flame,
  Folder,
  Hash,
  History,
  Info,
  Keyboard,
  Library,
  Plus,
  Settings,
  Star,
  Trash2
} from 'lucide-react'
import type { Collection, Tag } from '@shared/types'
import { VIEWS } from '@shared/constants'
import { cn } from '../../lib/utils'
import { IconButton } from '../ui/primitives'
import { Tip } from '../ui/overlays'
import { ZoomControl } from '../ZoomControl'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'

const VIEW_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  library: Library,
  star: Star,
  'calendar-plus': CalendarPlus,
  history: History,
  eye: Eye,
  flame: Flame,
  trash: Trash2
}

interface SidebarProps {
  onNewSnippet: () => void
  onFocusSearch: () => void
}

export function Sidebar({ onNewSnippet, onFocusSearch }: SidebarProps): React.JSX.Element {
  const collapsed = useSettingsStore((state) => state.settings.sidebarCollapsed)
  const updateSettings = useSettingsStore((state) => state.update)

  const view = useLibraryStore((state) => state.view)
  const tagId = useLibraryStore((state) => state.tagId)
  const collectionId = useLibraryStore((state) => state.collectionId)
  const total = useLibraryStore((state) => state.total)
  const tags = useLibraryStore((state) => state.tags)
  const collections = useLibraryStore((state) => state.collections)
  const setView = useLibraryStore((state) => state.setView)

  const openTagDialog = useUiStore((state) => state.openTagDialog)
  const openCollectionDialog = useUiStore((state) => state.openCollectionDialog)
  const openSettings = useUiStore((state) => state.openSettings)
  const openShortcuts = useUiStore((state) => state.openShortcuts)
  const openAbout = useUiStore((state) => state.openAbout)

  const primaryViews = useMemo(() => VIEWS.filter((entry) => entry.id !== 'trash'), [])
  const trashView = VIEWS.find((entry) => entry.id === 'trash')

  const collectionTree = useMemo(() => buildTree(collections), [collections])

  return (
    <nav
      aria-label="Library"
      className="flex h-full min-h-0 flex-col border-r border-line bg-sunken"
      data-collapsed={collapsed}
    >
      {/* Brand + capture */}
      <div className={cn('flex shrink-0 items-center gap-2 px-3 pb-2 pt-3', collapsed && 'justify-center px-2')}>
        {collapsed ? (
          <Tip label="New snippet (Ctrl+N)">
            <IconButton label="New snippet" variant="primary" size="icon" onClick={onNewSnippet}>
              <Plus className="size-4" />
            </IconButton>
          </Tip>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-hidden
                className="grid size-6 place-items-center rounded-[7px] bg-primary text-[10px] font-bold text-on-primary"
              >
                SB
              </span>
              <span className="truncate text-sm font-semibold tracking-tight text-fg">SnippetBox</span>
            </span>
            <Tip label="New snippet" shortcut="Ctrl N">
              <IconButton label="New snippet" variant="secondary" size="icon-sm" onClick={onNewSnippet}>
                <Plus className="size-3.5" />
              </IconButton>
            </Tip>
          </>
        )}
      </div>

      {!collapsed ? (
        <button
          type="button"
          onClick={onFocusSearch}
          className={cn(
            'mx-3 mb-2 flex h-7 shrink-0 items-center gap-2 rounded-[7px] border border-line bg-surface px-2',
            'text-xs text-subtle transition-colors hover:border-line-strong hover:text-muted'
          )}
        >
          <span className="flex-1 text-left">Search snippets…</span>
          <span className="text-2xs text-subtle">Ctrl K</span>
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        <ul className="space-y-0.5">
          {primaryViews.map((entry) => {
            const Icon = VIEW_ICONS[entry.icon] ?? Library
            const active = view === entry.id
            return (
              <li key={entry.id}>
                <SidebarItem
                  collapsed={collapsed}
                  active={active}
                  icon={<Icon className="size-4" />}
                  label={entry.label}
                  count={entry.id === 'all' ? total : undefined}
                  onClick={() => setView(entry.id)}
                />
              </li>
            )
          })}
        </ul>

        <SidebarSection
          collapsed={collapsed}
          title="Collections"
          icon={<Folder className="size-3.5" />}
          actionLabel="New collection"
          onAction={() => openCollectionDialog(null)}
        >
          {collectionTree.length === 0 ? (
            <SidebarHint collapsed={collapsed} text="No collections yet" />
          ) : (
            <CollectionTree
              nodes={collectionTree}
              collapsed={collapsed}
              activeId={view === 'collection' ? collectionId : null}
              onSelect={(id) => setView('collection', { collectionId: id })}
              onEdit={(collection) => openCollectionDialog(collection)}
              depth={0}
            />
          )}
        </SidebarSection>

        <SidebarSection
          collapsed={collapsed}
          title="Tags"
          icon={<Hash className="size-3.5" />}
          actionLabel="New tag"
          onAction={() => openTagDialog(null)}
        >
          {tags.length === 0 ? (
            <SidebarHint collapsed={collapsed} text="No tags yet" />
          ) : (
            <ul className="space-y-0.5">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <TagSidebarItem
                    tag={tag}
                    collapsed={collapsed}
                    active={view === 'tag' && tagId === tag.id}
                    onSelect={() => setView('tag', { tagId: tag.id })}
                    onEdit={() => openTagDialog(tag)}
                  />
                </li>
              ))}
            </ul>
          )}
        </SidebarSection>

        {trashView ? (
          <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
            <li>
              <SidebarItem
                collapsed={collapsed}
                active={view === 'trash'}
                icon={<Trash2 className="size-4" />}
                label={trashView.label}
                onClick={() => setView('trash')}
              />
            </li>
          </ul>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-line px-2 py-2">
        <ul className="space-y-0.5">
          <li>
            <SidebarItem
              collapsed={collapsed}
              active={false}
              icon={<Settings className="size-4" />}
              label="Settings"
              onClick={openSettings}
              hint="Ctrl ,"
            />
          </li>
          <li>
            <SidebarItem
              collapsed={collapsed}
              active={false}
              icon={<Keyboard className="size-4" />}
              label="Keyboard Shortcuts"
              onClick={openShortcuts}
              hint="Ctrl /"
            />
          </li>
          <li>
            <SidebarItem
              collapsed={collapsed}
              active={false}
              icon={<Info className="size-4" />}
              label="About"
              onClick={openAbout}
            />
          </li>
        </ul>

        <div
          className={cn(
            'mt-2 flex items-center border-t border-line pt-2',
            collapsed ? 'justify-center' : 'justify-between px-0.5'
          )}
        >
          {collapsed ? null : <span className="text-2xs text-subtle">Zoom</span>}
          <ZoomControl orientation={collapsed ? 'vertical' : 'horizontal'} />
        </div>

        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          onClick={() => void updateSettings({ sidebarCollapsed: !collapsed })}
          className={cn(
            'mt-2 flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-xs text-subtle transition-colors hover:bg-hover hover:text-muted',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </div>
    </nav>
  )
}

/* -------------------------------------------------------------------------- */

function SidebarItem({
  collapsed,
  active,
  icon,
  label,
  count,
  hint,
  onClick
}: {
  collapsed: boolean
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  hint?: string
  onClick: () => void
}): React.JSX.Element {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-sm transition-colors',
        collapsed && 'justify-center px-0',
        active ? 'bg-primary-soft font-medium text-primary' : 'text-fg-secondary hover:bg-hover hover:text-fg'
      )}
    >
      <span className={cn('shrink-0', active ? 'text-primary' : 'text-subtle')}>{icon}</span>
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {count !== undefined && count > 0 ? (
            <span className="shrink-0 tabular-nums text-2xs text-subtle">{count}</span>
          ) : hint ? (
            <span className="shrink-0 text-2xs text-subtle/70">{hint}</span>
          ) : null}
        </>
      )}
    </button>
  )

  return collapsed ? <Tip label={label} side="right">{button}</Tip> : button
}

function SidebarSection({
  collapsed,
  title,
  icon,
  children,
  actionLabel,
  onAction
}: {
  collapsed: boolean
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  actionLabel: string
  onAction: () => void
}): React.JSX.Element {
  return (
    <section className="mt-3">
      <div className={cn('flex items-center gap-1.5 px-2 pb-1', collapsed && 'justify-center px-0')}>
        <span className="text-subtle">{icon}</span>
        {collapsed ? null : (
          <>
            <h2 className="flex-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{title}</h2>
            <Tip label={actionLabel} side="right">
              <button
                type="button"
                aria-label={actionLabel}
                onClick={onAction}
                className="grid size-4 place-items-center rounded-[4px] text-subtle transition-colors hover:bg-hover hover:text-fg"
              >
                <Plus className="size-3" />
              </button>
            </Tip>
          </>
        )}
      </div>
      {children}
    </section>
  )
}

function SidebarHint({ collapsed, text }: { collapsed: boolean; text: string }): React.JSX.Element {
  if (collapsed) return <span className="sr-only">{text}</span>
  return <p className="px-2 py-1 text-2xs text-subtle/80">{text}</p>
}

function TagSidebarItem({
  tag,
  collapsed,
  active,
  onSelect,
  onEdit
}: {
  tag: Tag
  collapsed: boolean
  active: boolean
  onSelect: () => void
  onEdit: () => void
}): React.JSX.Element {
  const button = (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={(event) => {
        event.preventDefault()
        onEdit()
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-sm transition-colors',
        collapsed && 'justify-center px-0',
        active ? 'bg-primary-soft font-medium text-primary' : 'text-fg-secondary hover:bg-hover hover:text-fg'
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{tag.name}</span>
          {tag.snippetCount > 0 ? (
            <span className="shrink-0 tabular-nums text-2xs text-subtle">{tag.snippetCount}</span>
          ) : null}
        </>
      )}
    </button>
  )

  return collapsed ? <Tip label={`${tag.name} (${tag.snippetCount})`} side="right">{button}</Tip> : button
}

interface CollectionNode extends Collection {
  children: CollectionNode[]
}

function buildTree(collections: Collection[]): CollectionNode[] {
  const nodes = new Map<string, CollectionNode>()
  for (const collection of collections) nodes.set(collection.id, { ...collection, children: [] })

  const roots: CollectionNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRecursively = (list: CollectionNode[]): void => {
    list.sort((a, b) => a.name.localeCompare(b.name))
    for (const node of list) sortRecursively(node.children)
  }
  sortRecursively(roots)

  return roots
}

function CollectionTree({
  nodes,
  collapsed,
  activeId,
  onSelect,
  onEdit,
  depth
}: {
  nodes: CollectionNode[]
  collapsed: boolean
  activeId: string | null
  onSelect: (id: string) => void
  onEdit: (collection: Collection) => void
  depth: number
}): React.JSX.Element {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            onContextMenu={(event) => {
              event.preventDefault()
              onEdit(node)
            }}
            aria-current={activeId === node.id ? 'page' : undefined}
            className={cn(
              'flex h-7 w-full items-center gap-2 rounded-[6px] text-sm transition-colors',
              collapsed ? 'justify-center px-0' : 'pr-2',
              activeId === node.id
                ? 'bg-primary-soft font-medium text-primary'
                : 'text-fg-secondary hover:bg-hover hover:text-fg'
            )}
            style={collapsed ? undefined : { paddingLeft: 8 + depth * 12 }}
          >
            <Folder className={cn('size-3.5 shrink-0', activeId === node.id ? 'text-primary' : 'text-subtle')} />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
                {node.snippetCount > 0 ? (
                  <span className="shrink-0 tabular-nums text-2xs text-subtle">{node.snippetCount}</span>
                ) : null}
              </>
            )}
          </button>
          {node.children.length > 0 ? (
            <CollectionTree
              nodes={node.children}
              collapsed={collapsed}
              activeId={activeId}
              onSelect={onSelect}
              onEdit={onEdit}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
