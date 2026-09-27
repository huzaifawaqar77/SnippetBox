import type { ReactNode } from 'react'
import { Star, X } from 'lucide-react'
import type { LanguageOption, SnippetSummary, Tag } from '@shared/types'
import { cn, getLanguage, readableOn, softColor } from '../../lib/utils'
import { IconButton } from './primitives'

/* --------------------------------------------------------------------------
   Language icon
-------------------------------------------------------------------------- */

/** Distinctive two-character glyphs where the obvious abbreviation is unhelpful. */
const LANGUAGE_GLYPHS: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  rust: 'RS',
  go: 'GO',
  c: 'C',
  cpp: 'C+',
  csharp: 'C#',
  java: 'JV',
  kotlin: 'KT',
  swift: 'SW',
  php: 'PHP',
  ruby: 'RB',
  dart: 'DA',
  objectivec: 'OC',
  r: 'R',
  lua: 'LUA',
  bash: 'SH',
  zsh: 'ZSH',
  fish: 'FSH',
  powershell: 'PS',
  sql: 'SQL',
  html: '<>',
  css: '{}',
  scss: 'SC',
  json: '{}',
  yaml: 'YML',
  toml: 'TML',
  ini: 'INI',
  xml: '</>',
  markdown: 'MD',
  dockerfile: 'DKR',
  graphql: 'GQL',
  nginx: 'NGX',
  diff: '+/-',
  plaintext: 'TXT',
  other: '···'
}

export function languageGlyph(languageId: string | null | undefined): string {
  const language = getLanguage(languageId)
  if (!language) return 'TXT'
  return LANGUAGE_GLYPHS[language.id] ?? language.label.slice(0, 2).toUpperCase()
}

export function LanguageIcon({
  language,
  size = 'md',
  className
}: {
  language: LanguageOption | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}): React.JSX.Element {
  const color = language?.color ?? '#94A3B8'
  const glyph = languageGlyph(language?.id)

  return (
    <span
      aria-hidden
      title={language?.label ?? 'Plain Text'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[6px] font-mono font-semibold leading-none',
        size === 'sm' && 'size-5 text-[0.5rem]',
        size === 'md' && 'size-6 text-[0.56rem]',
        size === 'lg' && 'size-9 text-[0.68rem]',
        className
      )}
      style={{
        backgroundColor: softColor(color, 0.18),
        color: color,
        boxShadow: `inset 0 0 0 1px ${softColor(color, 0.35)}`
      }}
    >
      {glyph}
    </span>
  )
}

/* --------------------------------------------------------------------------
   Tags
-------------------------------------------------------------------------- */

export function TagChip({
  tag,
  active = false,
  onClick,
  onRemove,
  className,
  count
}: {
  tag: Pick<Tag, 'name' | 'color'>
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
  className?: string
  count?: number
}): React.JSX.Element {
  const background = active ? tag.color : softColor(tag.color, 0.16)
  const color = active ? readableOn(tag.color) : tag.color

  const content = (
    <>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: active ? color : tag.color, opacity: active ? 0.85 : 1 }}
      />
      <span className="truncate">{tag.name}</span>
      {count !== undefined ? <span className="tabular-nums opacity-65">{count}</span> : null}
    </>
  )

  if (onRemove) {
    return (
      <span
        className={cn(
          'inline-flex h-[1.35rem] max-w-[10.5rem] items-center gap-1.5 rounded-[6px] border border-transparent pl-2 pr-1 text-xs font-medium',
          className
        )}
        style={{ backgroundColor: background, color }}
      >
        {content}
        <button
          type="button"
          aria-label={`Remove ${tag.name}`}
          className="grid size-4 place-items-center rounded-[4px] opacity-60 transition hover:bg-black/10 hover:opacity-100"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      </span>
    )
  }

  const Element = onClick ? 'button' : 'span'

  return (
    <Element
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'inline-flex h-[1.35rem] max-w-[10.5rem] items-center gap-1.5 rounded-[6px] border border-transparent px-2 text-xs font-medium',
        onClick && 'transition-colors hover:brightness-[0.97]',
        className
      )}
      style={{ backgroundColor: background, color }}
    >
      {content}
    </Element>
  )
}

/* --------------------------------------------------------------------------
   Empty states (section 44 of the product spec)
-------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  artwork,
  className,
  compact = false
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Optional illustration shown above the copy, for first-run screens. */
  artwork?: ReactNode
  className?: string
  compact?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-10' : 'gap-3 px-8 py-10',
        className
      )}
    >
      {artwork ? <div className="mb-1 flex w-full justify-center">{artwork}</div> : null}
      <div className="grid size-10 place-items-center rounded-xl border border-line bg-sunken text-subtle [&_svg]:size-5">
        {icon}
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-fg-secondary">{title}</p>
        {description ? <p className="text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Small display helpers
-------------------------------------------------------------------------- */

export function FavoriteStar({
  favorite,
  onToggle,
  size = 'md'
}: {
  favorite: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
}): React.JSX.Element {
  return (
    <IconButton
      label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      size={size === 'sm' ? 'icon-sm' : 'icon'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(favorite ? 'text-star hover:text-star' : 'text-subtle hover:text-fg')}
    >
      <Star className={cn('size-4', favorite && 'fill-current')} />
    </IconButton>
  )
}

export function MetaText({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <span className={cn('text-2xs text-subtle', className)}>{children}</span>
}

export function MetaDot(): React.JSX.Element {
  return (
    <span aria-hidden className="text-subtle/60">
      ·
    </span>
  )
}

/** One-line usage summary: "Used 27 times · Last used today". */
export function usageSummary(snippet: Pick<SnippetSummary, 'copyCount' | 'openCount' | 'lastOpenedAt'>): string | null {
  if (snippet.copyCount === 0 && snippet.openCount === 0) return null

  const parts: string[] = []
  if (snippet.copyCount > 0) parts.push(`Copied ${snippet.copyCount} time${snippet.copyCount === 1 ? '' : 's'}`)
  if (snippet.openCount > 0 && snippet.copyCount === 0) {
    parts.push(`Opened ${snippet.openCount} time${snippet.openCount === 1 ? '' : 's'}`)
  }
  if (snippet.lastOpenedAt) {
    const then = new Date(snippet.lastOpenedAt).getTime()
    const days = Math.floor((Date.now() - then) / 86_400_000)
    parts.push(days <= 0 ? 'last used today' : days === 1 ? 'last used yesterday' : `last used ${days} days ago`)
  }

  return parts.join(' · ')
}
