import type { SnippetBoxApi } from '@shared/ipc'

declare global {
  interface Window {
    snippetbox: SnippetBoxApi
  }
}

export {}
