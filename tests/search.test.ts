import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildFtsMatch, describeQuery, hasStructuredFilters, parseSearchQuery } from '@shared/search'
import { createSnippet, listSnippets, updateSnippet } from '@main/db/repositories/snippets'
import { createCollection } from '@main/db/repositories/collections'
import { disposeDatabase, freshDatabase } from './helpers'

describe('parseSearchQuery', () => {
  it('separates free text from operators', () => {
    const parsed = parseSearchQuery('docker network tag:linux language:bash is:favorite')
    expect(parsed.terms).toEqual(['docker', 'network'])
    expect(parsed.tags).toEqual(['linux'])
    expect(parsed.languages).toEqual(['bash'])
    expect(parsed.isFavorite).toBe(true)
  })

  it('keeps quoted phrases together', () => {
    const parsed = parseSearchQuery('"port in use" tag:linux')
    expect(parsed.phrases).toEqual(['port in use'])
    expect(parsed.tags).toEqual(['linux'])
    expect(parsed.terms).toEqual([])
  })

  it('parses date ranges', () => {
    const parsed = parseSearchQuery('after:2026-01-01 before:2026-02-01')
    expect(parsed.after).toBe('2026-01-01T00:00:00.000Z')
    expect(parsed.before).toBe('2026-02-01T00:00:00.000Z')
  })

  it('treats unknown operators and urls as plain text', () => {
    const parsed = parseSearchQuery('https://example.com/foo weird:thing')
    expect(parsed.terms).toContain('https://example.com/foo')
    expect(parsed.terms).toContain('weird:thing')
  })

  it('reports whether any structured filter is present', () => {
    expect(hasStructuredFilters(parseSearchQuery('docker'))).toBe(false)
    expect(hasStructuredFilters(parseSearchQuery('tag:docker'))).toBe(true)
  })

  it('builds a quoted, prefix-matched FTS expression', () => {
    expect(buildFtsMatch(parseSearchQuery('dock port'))).toBe('"dock"* AND "port"*')
    expect(buildFtsMatch(parseSearchQuery('dock'))).toBe('"dock"*')
    expect(buildFtsMatch(parseSearchQuery('tag:linux'))).toBeNull()
  })

  it('neutralises FTS operator characters in user input', () => {
    const match = buildFtsMatch(parseSearchQuery('NOT (docker)'))
    expect(match).not.toContain('(')
    expect(match).not.toContain(')')
    // Quoted, so FTS treats it as a literal rather than the NOT operator.
    expect(match).toContain('"not"*')
    expect(match).toContain('"docker"*')
  })

  it('describes filters for the search chips', () => {
    const chips = describeQuery(parseSearchQuery('tag:linux is:favorite after:2026-01-01'))
    expect(chips.map((chip) => chip.kind)).toEqual(['tag', 'flag', 'range'])
  })
})

describe('search behaviour against the database', () => {
  beforeEach(() => {
    freshDatabase()
  })

  afterEach(() => {
    disposeDatabase()
  })

  function seed(): void {
    createSnippet({
      title: 'Docker: find container IP',
      description: 'Inspect a container network.',
      code: 'docker inspect -f "{{.NetworkSettings.IPAddress}}" web',
      language: 'bash',
      tagNames: ['docker', 'network']
    })
    createSnippet({
      title: 'Undo the last Git commit',
      description: 'Move the last commit back into the staging area.',
      code: 'git reset --soft HEAD~1',
      language: 'bash',
      tagNames: ['git']
    })
    createSnippet({
      title: 'Debounce a function',
      description: 'Delay a function call.',
      code: 'const docker = require("docker"); function debounce(fn) {}',
      language: 'javascript',
      tagNames: ['javascript', 'frontend']
    })
  }

  it('matches on the title', () => {
    seed()
    const result = listSnippets({ view: 'all', query: 'undo' })
    expect(result.total).toBe(1)
    expect(result.items[0]!.title).toBe('Undo the last Git commit')
  })

  it('matches inside code', () => {
    seed()
    const result = listSnippets({ view: 'all', query: 'reset' })
    expect(result.total).toBe(1)
    expect(result.items[0]!.title).toBe('Undo the last Git commit')
  })

  it('ranks title matches above code-only matches', () => {
    seed()
    const result = listSnippets({ view: 'all', query: 'docker' })
    // Two snippets mention docker: one in its title, one only in its code.
    expect(result.total).toBe(2)
    expect(result.items[0]!.title).toContain('Docker')
  })

  it('supports prefix matches while typing', () => {
    seed()
    expect(listSnippets({ view: 'all', query: 'dock' }).total).toBe(2)
    expect(listSnippets({ view: 'all', query: 'deboun' }).total).toBe(1)
  })

  it('filters by tag, language and collection', () => {
    seed()
    expect(listSnippets({ view: 'all', query: 'tag:git' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'tag:network' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'language:javascript' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'language:js' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'tag:docker language:bash' }).total).toBe(1)
  })

  it('filters by collection', () => {
    const devops = createCollection({ name: 'DevOps' })
    createSnippet({
      title: 'Docker ps',
      code: 'docker ps',
      language: 'bash',
      collectionId: devops.id
    })
    createSnippet({ title: 'Unfiled', code: 'ls -la', language: 'bash' })

    const result = listSnippets({ view: 'all', query: 'collection:DevOps' })
    expect(result.total).toBe(1)
    expect(result.items[0]!.title).toBe('Docker ps')
  })

  it('combines operators with free text', () => {
    seed()
    expect(listSnippets({ view: 'all', query: 'container tag:docker' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'container tag:git' }).total).toBe(0)
  })

  it('filters favorites and date ranges', () => {
    seed()
    const target = listSnippets({ view: 'all', query: 'git' }).items[0]!
    updateSnippet(target.id, { favorite: true })

    expect(listSnippets({ view: 'all', query: 'is:favorite' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'is:favorite git' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'after:2000-01-01' }).total).toBe(3)
    expect(listSnippets({ view: 'all', query: 'before:2000-01-01' }).total).toBe(0)
  })

  it('sorts by title, copies and creation', () => {
    seed()
    const byTitle = listSnippets({ view: 'all', sort: 'title' })
    expect(byTitle.items.map((item) => item.title)).toEqual([
      'Debounce a function',
      'Docker: find container IP',
      'Undo the last Git commit'
    ])

    const byCreated = listSnippets({ view: 'all', sort: 'created' })
    expect(byCreated.items[0]!.title).toBe('Debounce a function')
  })

  it('returns empty results for nonsense queries instead of throwing', () => {
    seed()
    expect(() => listSnippets({ view: 'all', query: '(((' })).not.toThrow()
    expect(listSnippets({ view: 'all', query: 'zzzzzz-not-present' }).total).toBe(0)
  })

  it('paginates with limit and offset while keeping a stable total', () => {
    seed()
    const first = listSnippets({ view: 'all', limit: 2, offset: 0 })
    const second = listSnippets({ view: 'all', limit: 2, offset: 2 })

    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(1)
    expect(first.total).toBe(3)
    expect(second.total).toBe(3)

    const ids = new Set([...first.items, ...second.items].map((item) => item.id))
    expect(ids.size).toBe(3)
  })
})
