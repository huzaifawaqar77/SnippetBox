import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

/**
 * Renders snippet notes.
 *
 * Content is sanitised by `rehype-sanitize`, so raw HTML in a note can never
 * become script. Links are handed to the OS browser instead of navigating the
 * window, which also means the renderer never loads a remote page.
 */
export function MarkdownView({ children, className }: { children: string; className?: string }): React.JSX.Element {
  return (
    <div className={cn('notes-prose', className)} data-selectable>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                if (href && /^https?:\/\//i.test(href)) void api.system.openExternal(href)
              }}
            >
              {linkChildren}
            </a>
          )
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
