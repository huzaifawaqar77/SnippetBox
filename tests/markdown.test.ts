import { describe, expect, it } from 'vitest'
import { parseMarkdownSnippet, renderIndex } from '@shared/markdown'
import { snippetToMarkdown } from '@shared/utils'
import { detectLanguage, languageFromFilename, resolveLanguageId } from '@shared/languages'
import { codeSimilarity, formatBytes, formatRelativeTime, normalizeCode, slugify } from '@shared/utils'

describe('snippetToMarkdown', () => {
  it('produces a document that parses back into the same snippet', () => {
    const original = {
      title: 'Check if a port is in use',
      description: 'Bash command to check whether a port is already in use.',
      code: '#!/bin/bash\n\nPORT=8080\nlsof -i :"$PORT"',
      language: 'bash',
      notes: '## Why this works\n\n`lsof` lists open files.',
      tags: [{ name: 'linux' }, { name: 'bash' }],
      sourceUrl: 'https://example.com/lsof',
      sourceName: 'lsof manual'
    }

    const markdown = snippetToMarkdown(original)
    const parsed = parseMarkdownSnippet(markdown)

    expect(parsed).not.toBeNull()
    expect(parsed!.title).toBe(original.title)
    expect(parsed!.description).toBe(original.description)
    expect(parsed!.code).toBe(original.code)
    expect(parsed!.language).toBe('bash')
    expect(parsed!.notes).toContain('lists open files')
    expect(parsed!.tags).toEqual(['linux', 'bash'])
    expect(parsed!.sourceUrl).toBe('https://example.com/lsof')
  })

  it('widens the fence when the code already contains backticks', () => {
    const markdown = snippetToMarkdown({
      title: 'Fences',
      description: '',
      code: '```\ninner fence\n```',
      language: 'markdown',
      notes: '',
      tags: [],
      sourceUrl: '',
      sourceName: ''
    })

    expect(markdown).toContain('````markdown')
    const parsed = parseMarkdownSnippet(markdown)
    expect(parsed!.code).toBe('```\ninner fence\n```')
  })
})

describe('parseMarkdownSnippet', () => {
  it('handles a minimal document with only a title and code', () => {
    const parsed = parseMarkdownSnippet('# Just a command\n\n```sh\nls -la\n```\n')
    expect(parsed!.title).toBe('Just a command')
    expect(parsed!.language).toBe('bash')
    expect(parsed!.code).toBe('ls -la')
  })

  it('falls back to the file name when there is no heading', () => {
    const parsed = parseMarkdownSnippet('```python\nprint("hi")\n```', '/tmp/hello.py')
    expect(parsed!.title).toBe('hello')
    expect(parsed!.language).toBe('python')
  })

  it('detects the language when the fence has none', () => {
    const parsed = parseMarkdownSnippet('# Detect me\n\n```\ndef greet(name):\n    return f"hi {name}"\n```\n')
    expect(parsed!.language).toBe('python')
  })

  it('returns null for empty input', () => {
    expect(parseMarkdownSnippet('')).toBeNull()
  })
})

describe('renderIndex', () => {
  it('lists snippets as Markdown links', () => {
    const index = renderIndex([
      { title: 'One', file: 'one.md', tags: ['a'], language: 'bash' },
      { title: 'Two', file: 'two.md', tags: [], language: 'python' }
    ])
    expect(index).toContain('[One](one.md)')
    expect(index).toContain('[Two](two.md)')
  })
})

describe('language helpers', () => {
  it('resolves ids, labels, aliases and extensions', () => {
    expect(resolveLanguageId('javascript')).toBe('javascript')
    expect(resolveLanguageId('JavaScript')).toBe('javascript')
    expect(resolveLanguageId('js')).toBe('javascript')
    expect(resolveLanguageId('sh')).toBe('bash')
    expect(resolveLanguageId('yml')).toBe('yaml')
    expect(resolveLanguageId('nonsense')).toBeNull()
  })

  it('maps file names to languages', () => {
    expect(languageFromFilename('docker-compose.yml')).toBe('yaml')
    expect(languageFromFilename('Dockerfile')).toBe('dockerfile')
    expect(languageFromFilename('component.tsx')).toBe('tsx')
    expect(languageFromFilename('nginx.conf')).toBe('nginx')
    expect(languageFromFilename('.env')).toBe('ini')
    expect(languageFromFilename('README')).toBeNull()
  })

  it('detects languages from a shebang', () => {
    expect(detectLanguage('#!/usr/bin/env python3\nprint("x")')).toBe('python')
    expect(detectLanguage('#!/bin/bash\necho hi')).toBe('bash')
    expect(detectLanguage('#!/usr/bin/env node\nconsole.log(1)')).toBe('javascript')
  })

  it('detects languages from syntax', () => {
    expect(detectLanguage('package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("hi") }')).toBe('go')
    expect(detectLanguage('use std::collections::HashMap;\n\nfn main() {\n    let mut x = 1;\n}')).toBe('rust')
    expect(detectLanguage('public static void main(String[] args) { System.out.println("hi"); }')).toBe('java')
    expect(detectLanguage('FROM node:20-alpine\nRUN npm ci\nCMD ["node", "server.js"]')).toBe('dockerfile')
    expect(detectLanguage('SELECT id, title FROM snippets WHERE deleted_at IS NULL')).toBe('sql')
    expect(detectLanguage('server {\n  listen 80;\n  location / { proxy_pass http://app; }\n}')).toBe('nginx')
  })

  it('prefers the file name over syntax when both are available', () => {
    expect(detectLanguage('print("hello")', 'script.rb')).toBe('ruby')
  })

  it('returns null when nothing is recognisable', () => {
    expect(detectLanguage('blah')).toBeNull()
  })
})

describe('formatting helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB')
  })

  it('formats relative times', () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    expect(formatRelativeTime('2026-09-26T11:59:50.000Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-09-26T11:30:00.000Z', now)).toBe('30 minutes ago')
    expect(formatRelativeTime('2026-09-26T09:00:00.000Z', now)).toBe('3 hours ago')
    expect(formatRelativeTime('2026-09-25T09:00:00.000Z', now)).toBe('yesterday')
    expect(formatRelativeTime('2026-09-20T12:00:00.000Z', now)).toBe('6 days ago')
    expect(formatRelativeTime(null, now)).toBe('never')
  })

  it('slugifies titles safely', () => {
    expect(slugify('Check if a port is in use')).toBe('check-if-a-port-is-in-use')
    expect(slugify('C++ / C# notes')).toBe('c-c-notes')
    expect(slugify('!!!')).toBe('snippet')
  })
})

describe('duplicate detection helpers', () => {
  it('normalises code before comparing', () => {
    expect(normalizeCode('const x = 1; // comment')).toBe(normalizeCode('const   x\t=\t1;  // other comment'))
  })

  it('scores near-identical code highly and unrelated code lowly', () => {
    const a = 'function debounce(fn, wait) { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, wait) } }'
    const b = 'function debounce(fn, wait) { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, wait + 10) } }'
    const c = 'SELECT * FROM users WHERE active = true'

    expect(codeSimilarity(a, b)).toBeGreaterThan(0.9)
    expect(codeSimilarity(a, c)).toBeLessThan(0.2)
    expect(codeSimilarity(a, a)).toBe(1)
  })
})
