import { closeSync, openSync, readSync, statSync, writeSync } from 'node:fs'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * A minimal, dependency-free ZIP writer/reader.
 *
 * Scope is deliberately narrow: STORE and DEFLATE entries, UTF-8 names, no
 * Zip64, no encryption, no data descriptors. That is exactly what SnippetBox
 * needs for "export everything" archives and database backups, and it avoids
 * pulling a general-purpose archiver into a security-sensitive app.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

export function crc32(buffer: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function crc32Update(seed: number, buffer: Buffer): number {
  let c = (seed ^ 0xffffffff) >>> 0
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50

/** Entries larger than this are stored (not deflated) and streamed in chunks. */
const STREAM_THRESHOLD = 8 * 1024 * 1024
const CHUNK_SIZE = 1024 * 1024

export interface ZipEntryInput {
  path: string
  /** In-memory content. Mutually exclusive with `filePath`. */
  data?: Buffer
  /** Large content kept on disk; streamed without buffering the whole file. */
  filePath?: string
  date?: Date
}

export interface ZipEntryInfo {
  path: string
  compressedSize: number
  uncompressedSize: number
  method: number
  crc: number
  dataOffset: number
}

function toDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function buildLocalHeader(options: {
  method: number
  time: number
  date: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  nameLength: number
}): Buffer {
  const header = Buffer.alloc(30)
  header.writeUInt32LE(LOCAL_SIGNATURE, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x0800, 6)
  header.writeUInt16LE(options.method, 8)
  header.writeUInt16LE(options.time, 10)
  header.writeUInt16LE(options.date, 12)
  header.writeUInt32LE(options.crc, 14)
  header.writeUInt32LE(options.compressedSize, 18)
  header.writeUInt32LE(options.uncompressedSize, 22)
  header.writeUInt16LE(options.nameLength, 26)
  header.writeUInt16LE(0, 28)
  return header
}

function buildCentralHeader(options: {
  method: number
  time: number
  date: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  nameLength: number
  offset: number
}): Buffer {
  const header = Buffer.alloc(46)
  header.writeUInt32LE(CENTRAL_SIGNATURE, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0800, 8)
  header.writeUInt16LE(options.method, 10)
  header.writeUInt16LE(options.time, 12)
  header.writeUInt16LE(options.date, 14)
  header.writeUInt32LE(options.crc, 16)
  header.writeUInt32LE(options.compressedSize, 20)
  header.writeUInt32LE(options.uncompressedSize, 24)
  header.writeUInt16LE(options.nameLength, 28)
  header.writeUInt16LE(0, 30)
  header.writeUInt16LE(0, 32)
  header.writeUInt16LE(0, 34)
  header.writeUInt16LE(0, 36)
  header.writeUInt32LE(0, 38)
  header.writeUInt32LE(options.offset, 42)
  return header
}

/** Streams a file into the archive, then patches the header with the real CRC. */
function writeStreamedEntry(
  fd: number,
  entry: ZipEntryInput,
  nameBuffer: Buffer,
  time: number,
  date: number,
  offset: number
): { compressedSize: number; uncompressedSize: number; crc: number } {
  const filePath = entry.filePath!
  const size = statSync(filePath).size

  const header = buildLocalHeader({
    method: 0,
    time,
    date,
    crc: 0,
    compressedSize: 0,
    uncompressedSize: 0,
    nameLength: nameBuffer.length
  })

  writeSync(fd, header)
  writeSync(fd, nameBuffer)

  const source = openSync(filePath, 'r')
  const chunk = Buffer.alloc(CHUNK_SIZE)
  let written = 0
  let crc = 0

  try {
    while (written < size) {
      const wanted = Math.min(CHUNK_SIZE, size - written)
      const read = readSync(source, chunk, 0, wanted, written)
      if (read <= 0) break
      const slice = read === chunk.length ? chunk : chunk.subarray(0, read)
      crc = crc32Update(crc, slice)
      writeSync(fd, slice)
      written += read
    }
  } finally {
    closeSync(source)
  }

  // Patch the local header now that the checksum and sizes are known.
  const patch = Buffer.alloc(12)
  patch.writeUInt32LE(crc, 0)
  patch.writeUInt32LE(written, 4)
  patch.writeUInt32LE(written, 8)
  writeSync(fd, patch, 0, patch.length, offset + 14)

  return { compressedSize: written, uncompressedSize: written, crc }
}

/** Writes entries to `destination`, streaming large files instead of buffering. */
export function writeZip(entries: ZipEntryInput[], destination: string): void {
  const fd = openSync(destination, 'w')
  const central: Buffer[] = []
  let offset = 0

  try {
    for (const entry of entries) {
      const nameBuffer = Buffer.from(normalizePath(entry.path), 'utf8')
      const { time, date } = toDosDateTime(entry.date ?? new Date())

      // Resolve in-memory content, keeping very large files on disk.
      let data = entry.data
      if (!data && entry.filePath) {
        if (statSync(entry.filePath).size > STREAM_THRESHOLD) {
          const result = writeStreamedEntry(fd, entry, nameBuffer, time, date, offset)
          central.push(
            buildCentralHeader({
              method: 0,
              time,
              date,
              crc: result.crc,
              compressedSize: result.compressedSize,
              uncompressedSize: result.uncompressedSize,
              nameLength: nameBuffer.length,
              offset
            }),
            nameBuffer
          )
          offset += 30 + nameBuffer.length + result.compressedSize
          continue
        }
        const { readFileSync } = require('node:fs') as typeof import('node:fs')
        data = readFileSync(entry.filePath)
      }

      if (!data) continue

      const checksum = crc32(data)
      let payload = data
      let method = 0
      try {
        const deflated = deflateRawSync(data, { level: 6 })
        if (deflated.length < data.length) {
          payload = deflated
          method = 8
        }
      } catch {
        /* fall back to STORE */
      }

      const header = buildLocalHeader({
        method,
        time,
        date,
        crc: checksum,
        compressedSize: payload.length,
        uncompressedSize: data.length,
        nameLength: nameBuffer.length
      })

      writeSync(fd, header)
      writeSync(fd, nameBuffer)
      if (payload.length > 0) writeSync(fd, payload)

      central.push(
        buildCentralHeader({
          method,
          time,
          date,
          crc: checksum,
          compressedSize: payload.length,
          uncompressedSize: data.length,
          nameLength: nameBuffer.length,
          offset
        }),
        nameBuffer
      )

      offset += header.length + nameBuffer.length + payload.length
    }

    const centralBuffer = Buffer.concat(central)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(END_SIGNATURE, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(Math.min(entries.length, 0xffff), 8)
    end.writeUInt16LE(Math.min(entries.length, 0xffff), 10)
    end.writeUInt32LE(centralBuffer.length, 12)
    end.writeUInt32LE(offset, 16)
    end.writeUInt16LE(0, 20)

    writeSync(fd, centralBuffer)
    writeSync(fd, end)
  } finally {
    closeSync(fd)
  }
}

function readExactly(fd: number, buffer: Buffer, position: number): void {
  let read = 0
  while (read < buffer.length) {
    const bytes = readSync(fd, buffer, read, buffer.length - read, position + read)
    if (bytes <= 0) throw new Error('Unexpected end of ZIP archive.')
    read += bytes
  }
}

/** Parses the central directory. Cheap enough to run before extracting. */
export function listZipEntries(file: string): ZipEntryInfo[] {
  const size = statSync(file).size
  if (size < 22) throw new Error('That file is not a ZIP archive.')

  const fd = openSync(file, 'r')
  try {
    const tailLength = Math.min(size, 66_000)
    const tail = Buffer.alloc(tailLength)
    readExactly(fd, tail, size - tailLength)

    let endOffset = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === END_SIGNATURE) {
        endOffset = i
        break
      }
    }
    if (endOffset < 0) throw new Error('That file is not a ZIP archive.')

    const count = tail.readUInt16LE(endOffset + 10)
    const centralOffset = tail.readUInt32LE(endOffset + 16)

    const entries: ZipEntryInfo[] = []
    let cursor = centralOffset

    for (let index = 0; index < count; index++) {
      const header = Buffer.alloc(46)
      readExactly(fd, header, cursor)
      if (header.readUInt32LE(0) !== CENTRAL_SIGNATURE) break

      const method = header.readUInt16LE(10)
      const checksum = header.readUInt32LE(16)
      const compressedSize = header.readUInt32LE(20)
      const uncompressedSize = header.readUInt32LE(24)
      const nameLength = header.readUInt16LE(28)
      const extraLength = header.readUInt16LE(30)
      const commentLength = header.readUInt16LE(32)
      const localOffset = header.readUInt32LE(42)

      const nameBuffer = Buffer.alloc(nameLength)
      readExactly(fd, nameBuffer, cursor + 46)

      const localHeader = Buffer.alloc(30)
      readExactly(fd, localHeader, localOffset)
      const localNameLength = localHeader.readUInt16LE(26)
      const localExtraLength = localHeader.readUInt16LE(28)

      entries.push({
        path: nameBuffer.toString('utf8'),
        compressedSize,
        uncompressedSize,
        method,
        crc: checksum,
        dataOffset: localOffset + 30 + localNameLength + localExtraLength
      })

      cursor += 46 + nameLength + extraLength + commentLength
    }

    return entries
  } finally {
    closeSync(fd)
  }
}

export function readZipEntry(file: string, entry: ZipEntryInfo): Buffer {
  const fd = openSync(file, 'r')
  try {
    const raw = Buffer.alloc(entry.compressedSize)
    if (entry.compressedSize > 0) readExactly(fd, raw, entry.dataOffset)

    if (entry.method === 0) return raw
    if (entry.method === 8) return inflateRawSync(raw)
    throw new Error(`Unsupported ZIP compression method: ${entry.method}`)
  } finally {
    closeSync(fd)
  }
}

/** Reads every entry whose path passes `filter` into memory. */
export function readZip(file: string, filter?: (path: string) => boolean): Map<string, Buffer> {
  const result = new Map<string, Buffer>()
  for (const entry of listZipEntries(file)) {
    if (entry.path.endsWith('/')) continue
    if (filter && !filter(entry.path)) continue
    result.set(entry.path, readZipEntry(file, entry))
  }
  return result
}

export function zipEntryPaths(file: string): string[] {
  return listZipEntries(file).map((entry) => entry.path)
}

export function isZipFile(file: string): boolean {
  try {
    const fd = openSync(file, 'r')
    try {
      const signature = Buffer.alloc(4)
      readExactly(fd, signature, 0)
      return signature.readUInt32LE(0) === LOCAL_SIGNATURE
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}
