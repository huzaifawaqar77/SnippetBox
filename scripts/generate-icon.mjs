#!/usr/bin/env node
/**
 * Generates the SnippetBox application icon from the project's artwork.
 *
 * `Firefly.png` is a dark-ink technical sketch on white paper. Dropped into an
 * icon as-is it would be a glaring white tile in a dark dock, so the paper is
 * removed and the ink is redrawn as white line art on the app's indigo plate —
 * the sketch becomes a blueprint mark that sits naturally beside other icons.
 *
 * Each size is resampled directly from the source with an area (box) filter, so
 * downscaling to 16px averages real pixels rather than throwing them away. Note
 * that a drawing this detailed inevitably loses definition below ~32px; that is
 * inherent to using the sketch as an icon, not a rendering fault.
 *
 *   build/icons/<size>x<size>.png   for packaging
 *   build/icon.png                  512px, used for the window and tray
 *   build/icon-preview.png          a legibility sheet, for review
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'Firefly.png')

if (!existsSync(SOURCE)) {
  console.error(`[icon] ${SOURCE} is missing — it is the source for the application icon.`)
  process.exit(1)
}

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value)
const mix = (a, b, t) => a + (b - a) * t

const INDIGO_LIGHT = [99, 102, 241]
const INDIGO_DARK = [67, 56, 202]

/** How much of the plate the artwork occupies, leaving a margin at the edges. */
const ART_INSET = 0.1

// --- PNG decode -------------------------------------------------------------
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

function decodePng(file) {
  const buffer = readFileSync(file)
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }

  const channels = CHANNELS[colorType]
  if (bitDepth !== 8 || !channels) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, colour type ${colorType}`)
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const start = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const value = raw[start + x]
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      let restored
      switch (filter) {
        case 0: restored = value; break
        case 1: restored = value + left; break
        case 2: restored = value + up; break
        case 3: restored = value + ((left + up) >> 1); break
        case 4: restored = value + paeth(left, up, upLeft); break
        default: throw new Error(`unknown PNG filter ${filter}`)
      }
      pixels[y * stride + x] = restored & 0xff
    }
  }

  return { width, height, channels, pixels }
}

/** Per-pixel "inkiness": 0 for white paper, 1 for the darkest line work. */
function inkinessMap({ width, height, channels, pixels }) {
  const map = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const base = index * channels
      const r = pixels[base]
      const g = channels >= 3 ? pixels[base + 1] : r
      const b = channels >= 3 ? pixels[base + 2] : r
      // Rec. 709 luma, then invert so ink is high and paper is low.
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      map[index] = clamp01(1 - luma)
    }
  }
  return { map, width, height }
}

// --- Drawing ----------------------------------------------------------------
function roundedRectDistance(x, y, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x) - (halfWidth - radius)
  const dy = Math.abs(y) - (halfHeight - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

function createCanvas(size) {
  const pixels = Buffer.alloc(size * size * 4)

  const blend = (index, r, g, b, alpha) => {
    if (alpha <= 0) return
    const at = index * 4
    const existing = pixels[at + 3] / 255
    const outAlpha = alpha + existing * (1 - alpha)
    if (outAlpha <= 0) return
    pixels[at] = Math.round((r * alpha + pixels[at] * existing * (1 - alpha)) / outAlpha)
    pixels[at + 1] = Math.round((g * alpha + pixels[at + 1] * existing * (1 - alpha)) / outAlpha)
    pixels[at + 2] = Math.round((b * alpha + pixels[at + 2] * existing * (1 - alpha)) / outAlpha)
    pixels[at + 3] = Math.round(outAlpha * 255)
  }

  return { size, pixels, blend }
}

/** Renders one icon: indigo plate plus the sketch as white line art. */
function drawIcon(size, ink) {
  const canvas = createCanvas(size)
  const radius = size * 0.225
  const half = size / 2 - size * 0.01

  // Gradient plate.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = roundedRectDistance(x + 0.5 - size / 2, y + 0.5 - size / 2, half, half, radius)
      const coverage = clamp01(0.5 - distance)
      if (coverage <= 0) continue
      const t = clamp01((x / size) * 0.35 + (y / size) * 0.65)
      canvas.blend(
        y * size + x,
        mix(INDIGO_LIGHT[0], INDIGO_DARK[0], t),
        mix(INDIGO_LIGHT[1], INDIGO_DARK[1], t),
        mix(INDIGO_LIGHT[2], INDIGO_DARK[2], t),
        coverage
      )
    }
  }

  // The artwork, area-averaged from the source into the inset box.
  const box = size * (1 - ART_INSET * 2)
  const origin = size * ART_INSET
  const scaleX = ink.width / box
  const scaleY = ink.height / box

  for (let ty = 0; ty < Math.ceil(box); ty++) {
    for (let tx = 0; tx < Math.ceil(box); tx++) {
      // Source rectangle covered by this output pixel.
      const sx0 = Math.floor(tx * scaleX)
      const sx1 = Math.min(ink.width, Math.max(sx0 + 1, Math.ceil((tx + 1) * scaleX)))
      const sy0 = Math.floor(ty * scaleY)
      const sy1 = Math.min(ink.height, Math.max(sy0 + 1, Math.ceil((ty + 1) * scaleY)))

      let total = 0
      let count = 0
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * ink.width
        for (let sx = sx0; sx < sx1; sx++) {
          total += ink.map[row + sx]
          count++
        }
      }
      if (count === 0) continue

      const inkiness = total / count
      if (inkiness <= 0.02) continue

      const px = Math.floor(origin + tx)
      const py = Math.floor(origin + ty)
      if (px < 0 || py < 0 || px >= size || py >= size) continue

      // Slight boost so the sketch does not turn into grey haze when small.
      const alpha = clamp01(Math.pow(inkiness, 0.8) * 1.05)
      canvas.blend(py * size + px, 255, 255, 255, alpha)
    }
  }

  return canvas.pixels
}

// --- PNG encode -------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([body, data])))
  return Buffer.concat([length, body, data, crc])
}

function encodePng(pixels, width, height) {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function magnify(pixels, size, scale) {
  const out = Buffer.alloc(size * scale * size * scale * 4)
  for (let y = 0; y < size * scale; y++) {
    for (let x = 0; x < size * scale; x++) {
      const source = (Math.floor(y / scale) * size + Math.floor(x / scale)) * 4
      pixels.copy(out, (y * size * scale + x) * 4, source, source + 4)
    }
  }
  return out
}

// --- Output -----------------------------------------------------------------
const source = decodePng(SOURCE)
const ink = inkinessMap(source)
console.log(`[icon] source ${SOURCE.split('/').pop()} ${ink.width}x${ink.height}`)

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const iconsDir = resolve(root, 'build/icons')
mkdirSync(iconsDir, { recursive: true })

const rendered = new Map()
for (const size of SIZES) {
  const pixels = drawIcon(size, ink)
  rendered.set(size, pixels)
  writeFileSync(resolve(iconsDir, `${size}x${size}.png`), encodePng(pixels, size, size))
}
writeFileSync(resolve(root, 'build/icon.png'), encodePng(rendered.get(512), 512, 512))

// Legibility sheet.
const SCALE = 6
const magnified = [16, 32, 64]
const sheetWidth = 16 * 5 + 32 + 64 + 128 + magnified.reduce((sum, size) => sum + size * SCALE + 16, 16)
const sheetHeight = 16 * 2 + 128 * SCALE / 2 + 24
const sheet = createCanvas(sheetWidth, sheetHeight)
for (let y = 0; y < sheetHeight; y++) {
  for (let x = 0; x < sheetWidth; x++) {
    sheet.blend(y * sheetWidth + x, 26, 30, 40, 1)
  }
}

const blit = (pixels, width, height, x, y) => {
  for (let row = 0; row < height; row++) {
    pixels.copy(sheet.pixels, ((y + row) * sheetWidth + x) * 4, row * width * 4, (row + 1) * width * 4)
  }
}

let x = 16
for (const size of [16, 32, 64, 128]) {
  blit(rendered.get(size), size, size, x, 16)
  x += size + 16
}
for (const size of magnified) {
  blit(magnify(rendered.get(size), size, SCALE), size * SCALE, size * SCALE, x, 8)
  x += size * SCALE + 16
}
writeFileSync(resolve(root, 'build/icon-preview.png'), encodePng(sheet.pixels, sheetWidth, sheetHeight))

console.log(`[icon] ${SIZES.length} sizes written to build/icons, plus build/icon.png and build/icon-preview.png`)
