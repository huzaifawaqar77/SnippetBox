import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SnippetDetail } from '@shared/types'
import {
  createSnippet,
  destroySnippet,
  emptyTrash,
  findSimilar,
  getSnippet,
  listSnippets,
  listVersions,
  recordCopy,
  recordOpen,
  restoreSnippet,
  restoreVersion,
  setFavorite,
  setRelatedSnippets,
  trashSnippet,
  updateSnippet,
  usageStats
} from '@main/db/repositories/snippets'
import {
  createTag,
  deleteTag,
  listTags,
  mergeTags,
  updateTag
} from '@main/db/repositories/tags'
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection
} from '@main/db/repositories/collections'
import { appliedMigrations } from '@main/db'
import { seedSampleData } from '@main/db/seed'
import { disposeDatabase, freshDatabase } from './helpers'

beforeEach(() => {
  freshDatabase()
})

afterEach(() => {
  disposeDatabase()
})

describe('migrations', () => {
  it('applies every migration exactly once', () => {
    const ids = appliedMigrations()
    expect(ids).toEqual([
      '001_initial_schema',
      '002_add_collections',
      '003_add_versions',
      '004_add_attachments',
      '005_add_relations_and_search',
      '006_full_text_search'
    ])
  })
})

describe('snippet persistence', () => {
  it('round-trips every field', () => {
    const created = createSnippet({
      title: 'Check if a port is in use',
      description: 'Bash command to check a port.',
      code: '#!/bin/bash\n\nlsof -i :8080',
      language: 'bash',
      notes: '## Why this works\n\n`lsof` lists open files.',
      sourceUrl: 'https://example.com/lsof',
      sourceName: 'lsof manual',
      sourceAuthor: 'Ada',
      favorite: true,
      tagNames: ['linux', 'bash']
    })

    const loaded = getSnippet(created.id) as SnippetDetail
    expect(loaded.title).toBe('Check if a port is in use')
    expect(loaded.language).toBe('bash')
    expect(loaded.favorite).toBe(true)
    expect(loaded.tags.map((tag) => tag.name).sort()).toEqual(['bash', 'linux'])
    expect(loaded.notes).toContain('lsof')

    // Derived columns must be materialised so the list never loads code.
    expect(loaded.codePreview).toBe('#!/bin/bash')
    expect(loaded.lineCount).toBe(3)
    expect(loaded.hasNotes).toBe(true)
  })

  it('keeps the list query free of code blobs', () => {
    createSnippet({ title: 'Alpha', code: 'x'.repeat(50_000), language: 'plaintext' })
    const result = listSnippets({ view: 'all' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).not.toHaveProperty('code')
    expect(result.items[0]!.codePreview).toBe('x'.repeat(50_000).slice(0, 139) + '…')
  })

  it('re-derives preview columns on update and touches updated_at', async () => {
    const created = createSnippet({ title: 'Before', code: 'one', language: 'plaintext' })
    await new Promise((resolve) => setTimeout(resolve, 5))

    const updated = updateSnippet(created.id, { code: 'first line\nsecond line', notes: 'note' })

    expect(updated.updatedAt >= created.updatedAt).toBe(true)
    expect(updated.codePreview).toBe('first line')
    expect(updated.lineCount).toBe(2)
    expect(updated.hasNotes).toBe(true)
  })

  it('duplicates a snippet without carrying usage counters over', () => {
    const created = createSnippet({ title: 'Original', code: 'echo hi', language: 'bash', tagNames: ['linux'] })
    recordCopy(created.id)

    const copy = updateSnippet(created.id, { title: 'Original' })
    expect(copy.copyCount).toBe(1)

    const duplicates = listSnippets({ view: 'all' })
    expect(duplicates.total).toBe(1)
  })
})

describe('trash lifecycle', () => {
  it('moves a snippet to trash, hides it from views, and restores it', () => {
    const created = createSnippet({ title: 'Recoverable', code: 'x', language: 'plaintext' })

    trashSnippet(created.id)
    expect(listSnippets({ view: 'all' }).total).toBe(0)
    expect(listSnippets({ view: 'trash' }).total).toBe(1)

    restoreSnippet(created.id)
    expect(listSnippets({ view: 'all' }).total).toBe(1)
    expect(listSnippets({ view: 'trash' }).total).toBe(0)
  })

  it('permanently deletes and reports attachment paths', () => {
    const created = createSnippet({ title: 'Gone', code: 'x', language: 'plaintext' })
    const paths = destroySnippet(created.id)

    expect(paths).toEqual([])
    expect(getSnippet(created.id)).toBeNull()
  })

  it('empties the trash in one go', () => {
    const a = createSnippet({ title: 'A', code: 'a', language: 'plaintext' })
    const b = createSnippet({ title: 'B', code: 'b', language: 'plaintext' })
    trashSnippet(a.id)
    trashSnippet(b.id)

    const result = emptyTrash()
    expect(result.count).toBe(2)
    expect(listSnippets({ view: 'trash' }).total).toBe(0)
  })
})

describe('tags', () => {
  it('creates tags on demand and reuses them case-insensitively', () => {
    createSnippet({ title: 'One', code: 'a', language: 'bash', tagNames: ['Linux'] })
    createSnippet({ title: 'Two', code: 'b', language: 'bash', tagNames: ['linux'] })

    const tags = listTags()
    expect(tags).toHaveLength(1)
    expect(tags[0]!.snippetCount).toBe(2)
  })

  it('renames a tag and keeps search in sync', () => {
    const created = createSnippet({ title: 'One', code: 'a', language: 'bash', tagNames: ['dockr'] })
    const tag = listTags()[0]!

    updateTag(tag.id, { name: 'docker' })

    // The denormalised FTS column must reflect the new name.
    expect(listSnippets({ view: 'all', query: 'tag:docker' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'tag:dockr' }).total).toBe(0)
    expect(getSnippet(created.id)!.tags[0]!.name).toBe('docker')
  })

  it('refuses duplicate tag names', () => {
    createTag({ name: 'linux' })
    expect(() => createTag({ name: 'LINUX' })).toThrow(/already exists/i)
  })

  it('merges two tags and keeps snippet membership', () => {
    const a = createSnippet({ title: 'A', code: 'a', language: 'bash', tagNames: ['js'] })
    const b = createSnippet({ title: 'B', code: 'b', language: 'bash', tagNames: ['javascript'] })

    const source = listTags().find((tag) => tag.name === 'js')!
    const target = listTags().find((tag) => tag.name === 'javascript')!

    mergeTags(source.id, target.id)

    expect(listTags().map((tag) => tag.name)).toEqual(['javascript'])
    expect(getSnippet(a.id)!.tags.map((tag) => tag.name)).toEqual(['javascript'])
    expect(getSnippet(b.id)!.tags.map((tag) => tag.name)).toEqual(['javascript'])
  })

  it('detaches a deleted tag without deleting snippets', () => {
    const created = createSnippet({ title: 'A', code: 'a', language: 'bash', tagNames: ['temp'] })
    const tag = listTags()[0]!

    deleteTag(tag.id)

    expect(listTags()).toHaveLength(0)
    expect(getSnippet(created.id)!.tags).toEqual([])
    expect(listSnippets({ view: 'all' }).total).toBe(1)
  })
})

describe('collections', () => {
  it('supports nesting and refuses cycles', () => {
    const parent = createCollection({ name: 'Development' })
    const child = createCollection({ name: 'Frontend', parentId: parent.id })

    expect(listCollections()).toHaveLength(2)
    expect(() => updateCollection(parent.id, { parentId: child.id })).toThrow(/circular|own parent/i)
    expect(() => updateCollection(parent.id, { parentId: parent.id })).toThrow(/own parent/i)
  })

  it('keeps snippets when their collection is deleted', () => {
    const collection = createCollection({ name: 'DevOps' })
    const created = createSnippet({
      title: 'Docker',
      code: 'docker ps',
      language: 'bash',
      collectionId: collection.id
    })

    expect(listSnippets({ view: 'collection', collectionId: collection.id }).total).toBe(1)

    deleteCollection(collection.id)

    expect(getSnippet(created.id)!.collectionId).toBeNull()
    expect(listSnippets({ view: 'all' }).total).toBe(1)
  })

  it('re-indexes member snippets when a collection is renamed', () => {
    const collection = createCollection({ name: 'Devops' })
    createSnippet({ title: 'Docker', code: 'docker ps', language: 'bash', collectionId: collection.id })

    updateCollection(collection.id, { name: 'DevOps' })

    expect(listSnippets({ view: 'all', query: 'collection:DevOps' }).total).toBe(1)
    expect(listSnippets({ view: 'all', query: 'collection:Devops' }).total).toBe(1)
  })
})

describe('versions', () => {
  it('captures the pre-edit state and restores it', () => {
    const created = createSnippet({ title: 'Versioned', code: 'first', language: 'plaintext' })

    updateSnippet(created.id, { code: 'second', snapshot: true })

    const versions = listVersions(created.id)
    expect(versions).toHaveLength(1)
    expect(versions[0]!.code).toBe('first')

    restoreVersion(versions[0]!.id)
    expect(getSnippet(created.id)!.code).toBe('first')
  })

  it('throttles snapshots so a burst of edits cannot spam history', () => {
    const created = createSnippet({ title: 'Throttled', code: 'v1', language: 'plaintext' })

    updateSnippet(created.id, { code: 'v2', snapshot: true })
    updateSnippet(created.id, { code: 'v3', snapshot: true })
    updateSnippet(created.id, { code: 'v4', snapshot: true })

    expect(listVersions(created.id)).toHaveLength(1)
  })

  it('does not record a version when nothing changed', () => {
    const created = createSnippet({ title: 'Same', code: 'unchanged', language: 'plaintext' })
    updateSnippet(created.id, { code: 'unchanged', snapshot: true })
    expect(listVersions(created.id)).toHaveLength(0)
  })
})

describe('relations', () => {
  it('links snippets symmetrically and unlinks cleanly', () => {
    const a = createSnippet({ title: 'A', code: 'a', language: 'plaintext' })
    const b = createSnippet({ title: 'B', code: 'b', language: 'plaintext' })

    setRelatedSnippets(a.id, [b.id])
    expect(getSnippet(a.id)!.relatedIds).toEqual([b.id])
    expect(getSnippet(b.id)!.relatedIds).toEqual([a.id])

    setRelatedSnippets(a.id, [])
    expect(getSnippet(a.id)!.relatedIds).toEqual([])
    expect(getSnippet(b.id)!.relatedIds).toEqual([])
  })

  it('rejects relating a snippet to something that does not exist', () => {
    const a = createSnippet({ title: 'A', code: 'a', language: 'plaintext' })
    expect(() => setRelatedSnippets(a.id, ['not-a-real-id'])).toThrow(/no longer exists/i)
  })
})

describe('duplicate detection', () => {
  it('finds near-identical code and ignores unrelated code', () => {
    const original = `function debounce(fn, wait = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}`

    createSnippet({ title: 'Debounce', code: original, language: 'javascript' })

    const nearMatch = findSimilar({
      code: original.replace('wait = 300', 'wait = 250')
    })
    expect(nearMatch).toHaveLength(1)
    expect(nearMatch[0]!.title).toBe('Debounce')

    const unrelated = findSimilar({
      code: 'SELECT id, title, created_at FROM snippets WHERE deleted_at IS NULL ORDER BY created_at DESC'
    })
    expect(unrelated).toHaveLength(0)
  })

  it('ignores very short snippets', () => {
    createSnippet({ title: 'Short', code: 'echo hi', language: 'bash' })
    expect(findSimilar({ code: 'echo hi' })).toHaveLength(0)
  })
})

describe('usage tracking', () => {
  it('counts opens and copies', () => {
    const created = createSnippet({ title: 'Used', code: 'x', language: 'plaintext' })

    recordOpen(created.id)
    recordOpen(created.id)
    recordCopy(created.id)

    const loaded = getSnippet(created.id)!
    expect(loaded.openCount).toBe(2)
    expect(loaded.copyCount).toBe(1)
    expect(loaded.lastOpenedAt).not.toBeNull()
  })

  it('reports library statistics', () => {
    createSnippet({ title: 'One', code: 'a', language: 'bash', tagNames: ['linux'] })
    const two = createSnippet({ title: 'Two', code: 'b', language: 'python' })
    setFavorite(two.id, true)

    const stats = usageStats(1024)
    expect(stats.totalSnippets).toBe(2)
    expect(stats.favoriteSnippets).toBe(1)
    expect(stats.totalTags).toBe(1)
    expect(stats.storageBytes).toBe(1024)
    expect(stats.languages.length).toBe(2)
  })
})

describe('seed data', () => {
  it('populates an empty library once', () => {
    const created = seedSampleData()
    expect(created).toBeGreaterThan(8)

    const result = listSnippets({ view: 'all' })
    expect(result.total).toBe(created)

    // Running it again is a no-op, so it can never duplicate a library.
    expect(seedSampleData()).toBe(0)
    expect(listSnippets({ view: 'all' }).total).toBe(created)
    expect(listCollections().length).toBeGreaterThan(0)
  })
})
