import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crc32, listZipEntries, readZip, readZipEntry, writeZip } from '@main/services/zip'
import { commitImport, exportSnippets, previewImport } from '@main/services/transfer'
import { createSnippet, listSnippets } from '@main/db/repositories/snippets'
import { disposeDatabase, freshDatabase } from './helpers'

let workdir = ''

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'snippetbox-test-'))
})

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true })
})

/* -------------------------------------------------------------------------- */
/*  ZIP implementation                                                          */
/* -------------------------------------------------------------------------- */

describe('zip writer and reader', () => {
  it('round-trips stored and deflated entries', () => {
    const archive = join(workdir, 'round-trip.zip')
    const text = 'const answer = 42\n'.repeat(50)
    const binary = Buffer.from([0, 1, 2, 250, 251, 252])

    writeZip(
      [
        { path: 'notes/readme.md', data: Buffer.from(text, 'utf8') },
        { path: 'data/blob.bin', data: binary }
      ],
      archive
    )

    const entries = listZipEntries(archive)
    expect(entries.map((entry) => entry.path).sort()).toEqual(['data/blob.bin', 'notes/readme.md'])

    const contents = readZip(archive)
    expect(contents.get('notes/readme.md')?.toString('utf8')).toBe(text)
    expect(contents.get('data/blob.bin')).toEqual(binary)
  })

  it('compresses repetitive content', () => {
    const archive = join(workdir, 'compressed.zip')
    const payload = Buffer.from('a'.repeat(200_000), 'utf8')
    writeZip([{ path: 'payload.txt', data: payload }], archive)

    const [entry] = listZipEntries(archive)
    expect(entry!.method).toBe(8)
    expect(entry!.compressedSize).toBeLessThan(payload.length / 10)
    expect(readZipEntry(archive, entry!)).toEqual(payload)
  })

  it('streams entries larger than the in-memory threshold', () => {
    const archive = join(workdir, 'large.zip')
    const source = join(workdir, 'large-source.bin')

    // Over 8 MB, so this exercises the streaming path and its header patching.
    const size = 9 * 1024 * 1024
    const chunk = Buffer.alloc(size)
    for (let index = 0; index < size; index++) chunk[index] = index % 251
    writeFileSync(source, chunk)

    writeZip([{ path: 'big.bin', filePath: source, date: new Date() }], archive)

    const [entry] = listZipEntries(archive)
    expect(entry!.uncompressedSize).toBe(size)
    expect(entry!.crc).toBe(crc32(chunk))

    const extracted = readZipEntry(archive, entry!)
    expect(extracted.length).toBe(size)
    expect(extracted.equals(chunk)).toBe(true)
  })

  it('rejects files that are not archives', () => {
    const notZip = join(workdir, 'not-a-zip.txt')
    writeFileSync(notZip, 'hello')
    expect(() => listZipEntries(notZip)).toThrow(/not a ZIP/i)
  })
})

/* -------------------------------------------------------------------------- */
/*  Export                                                                      */
/* -------------------------------------------------------------------------- */

describe('export', () => {
  beforeEach(() => {
    freshDatabase()
    createSnippet({
      title: 'Check if a port is in use',
      description: 'Bash command to check a port.',
      code: '#!/bin/bash\n\nlsof -i :8080',
      language: 'bash',
      notes: '## Why this works\n\nlsof lists open files.',
      tagNames: ['linux', 'bash']
    })
    createSnippet({
      title: 'Read a file line by line',
      description: 'Iterate a text file.',
      code: 'with open("data.txt") as handle:\n    for line in handle:\n        print(line)',
      language: 'python',
      tagNames: ['python']
    })
  })

  afterEach(() => {
    disposeDatabase()
  })

  it('writes a JSON envelope that can be re-imported', () => {
    const destination = join(workdir, 'export.json')
    const result = exportSnippets({ format: 'json', view: 'all', destination })

    expect(result.count).toBe(2)

    const payload = JSON.parse(readFileSync(destination, 'utf8'))
    expect(payload.app).toBe('SnippetBox')
    expect(payload.count).toBe(2)
    expect(payload.snippets).toHaveLength(2)

    const portSnippet = payload.snippets.find((snippet: { title: string }) => snippet.title.includes('port'))
    expect(portSnippet.tags).toEqual(['bash', 'linux'])
    expect(portSnippet.language).toBe('bash')
    expect(portSnippet.notes).toContain('lsof')
  })

  it('writes a ZIP with Markdown files and metadata', () => {
    const destination = join(workdir, 'export.zip')
    exportSnippets({ format: 'zip', view: 'all', destination })

    const paths = listZipEntries(destination).map((entry) => entry.path)
    expect(paths).toContain('metadata.json')
    expect(paths).toContain('index.md')
    expect(paths.filter((path) => path.startsWith('snippets/'))).toHaveLength(2)

    const contents = readZip(destination)
    const markdown = [...contents.entries()].find(([path]) => path.startsWith('snippets/'))?.[1].toString('utf8') ?? ''
    expect(markdown).toContain('# ')
    expect(markdown).toContain('## Code')
  })

  it('writes a folder of Markdown files', () => {
    const destination = join(workdir, 'markdown-export')
    exportSnippets({ format: 'markdown', view: 'all', destination })

    expect(statSync(join(destination, 'metadata.json')).isFile()).toBe(true)
    expect(statSync(join(destination, 'index.md')).isFile()).toBe(true)
    expect(statSync(join(destination, 'check-if-a-port-is-in-use.md')).isFile()).toBe(true)
  })

  it('de-duplicates file names for identical titles', () => {
    freshDatabase()
    createSnippet({ title: 'Same title', code: 'first', language: 'plaintext' })
    createSnippet({ title: 'Same title', code: 'second', language: 'plaintext' })

    const destination = join(workdir, 'dupe-names.zip')
    exportSnippets({ format: 'zip', view: 'all', destination })

    const snippetPaths = listZipEntries(destination)
      .map((entry) => entry.path)
      .filter((path) => path.startsWith('snippets/'))

    expect(new Set(snippetPaths).size).toBe(2)
    expect(snippetPaths).toContain('snippets/same-title.md')
    expect(snippetPaths).toContain('snippets/same-title-2.md')
  })

  it('refuses to export an empty view', () => {
    freshDatabase()
    expect(() => exportSnippets({ format: 'json', view: 'all', destination: join(workdir, 'empty.json') })).toThrow(
      /nothing to export/i
    )
  })
})

/* -------------------------------------------------------------------------- */
/*  Import                                                                      */
/* -------------------------------------------------------------------------- */

describe('import', () => {
  beforeEach(() => {
    freshDatabase()
  })

  afterEach(() => {
    disposeDatabase()
  })

  it('previews and commits a SnippetBox JSON export', () => {
    createSnippet({
      title: 'Original',
      description: 'A snippet.',
      code: 'echo original',
      language: 'bash',
      tagNames: ['linux']
    })

    const source = join(workdir, 'reimport.json')
    exportSnippets({ format: 'json', view: 'all', destination: source })

    const preview = previewImport([source])
    expect(preview.candidates).toHaveLength(1)
    expect(preview.candidates[0]!.title).toBe('Original')

    // Importing a snippet that already exists is flagged, not blocked.
    expect(preview.duplicates).toHaveLength(1)

    const result = commitImport(preview.candidates)
    expect(result.imported).toBe(1)
    expect(listSnippets({ view: 'all' }).total).toBe(2)
  })

  it('reads a folder of Markdown files', () => {
    const folder = join(workdir, 'markdown-source')
    mkdirSync(folder, { recursive: true })

    writeFileSync(
      join(folder, 'docker-ps.md'),
      [
        '# List running containers',
        '',
        'Shows every running container.',
        '',
        '```bash',
        'docker ps',
        '```',
        '',
        '## Tags',
        'docker, devops',
        ''
      ].join('\n')
    )

    const preview = previewImport([folder])
    expect(preview.candidates).toHaveLength(1)

    const candidate = preview.candidates[0]!
    expect(candidate.title).toBe('List running containers')
    expect(candidate.language).toBe('bash')
    expect(candidate.code.trim()).toBe('docker ps')
    expect(candidate.tags).toEqual(['docker', 'devops'])
  })

  it('treats loose code files as snippets', () => {
    const script = join(workdir, 'check-port.sh')
    writeFileSync(script, '#!/bin/bash\nlsof -i :8080\n')

    const preview = previewImport([script])
    expect(preview.candidates).toHaveLength(1)

    const candidate = preview.candidates[0]!
    expect(candidate.title).toBe('check-port')
    expect(candidate.language).toBe('bash')
    expect(candidate.code).toContain('lsof')
  })

  it('reads a SnippetBox ZIP archive', () => {
    createSnippet({ title: 'Zipped snippet', code: 'echo zip', language: 'bash', tagNames: ['archive'] })
    const archive = join(workdir, 'archive.zip')
    exportSnippets({ format: 'zip', view: 'all', destination: archive })

    freshDatabase()

    const preview = previewImport([archive])
    expect(preview.candidates).toHaveLength(1)
    expect(preview.candidates[0]!.title).toBe('Zipped snippet')
    expect(preview.candidates[0]!.tags).toEqual(['archive'])
  })

  it('skips unreadable and unsupported files without failing', () => {
    const unsupported = join(workdir, 'screenshot.png')
    writeFileSync(unsupported, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const preview = previewImport([join(workdir, 'does-not-exist'), unsupported])
    expect(preview.candidates).toHaveLength(0)
    expect(preview.skipped).toBeGreaterThan(0)
  })

  it('reports invalid JSON clearly', () => {
    const broken = join(workdir, 'broken.json')
    writeFileSync(broken, '{ not json')
    expect(() => previewImport([broken])).not.toThrow()
    expect(previewImport([broken]).candidates).toHaveLength(0)
  })
})
