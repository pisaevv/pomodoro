// Generates the PWA PNG icons with no external dependencies (Node zlib only).
// Run with: npm run icons
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [10, 10, 11]       // #0A0A0B app background
const ACCENT = [216, 166, 87] // #D8A657 honey accent
const INK = [243, 242, 238]   // #F3F2EE

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const clamp = (x) => Math.max(0, Math.min(1, x))
function blend(dst, color, cov) {
  for (let i = 0; i < 3; i++) dst[i] = Math.round(dst[i] * (1 - cov) + color[i] * cov)
}

// Draw a ring (annulus) + center dot, like the app's progress ring.
function draw(size, ringFrac) {
  const rgba = Buffer.alloc(size * size * 4)
  const cx = (size - 1) / 2, cy = (size - 1) / 2
  const ringR = size * ringFrac
  const ringT = size * 0.07
  const inner = ringR - ringT / 2
  const outer = ringR + ringT / 2
  const dotR = size * 0.052
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy)
      const px = [...BG]
      const ringCov = Math.min(clamp(outer - d + 0.5), clamp(d - inner + 0.5))
      blend(px, ACCENT, ringCov)
      blend(px, INK, clamp(dotR - d + 0.5))
      const o = (y * size + x) * 4
      rgba[o] = px[0]; rgba[o + 1] = px[1]; rgba[o + 2] = px[2]; rgba[o + 3] = 255
    }
  }
  return encodePng(size, size, rgba)
}

const targets = [
  ['icon-192.png', 192, 0.34],
  ['icon-512.png', 512, 0.34],
  ['icon-maskable-512.png', 512, 0.28], // smaller ring -> sits inside the maskable safe zone
  ['apple-touch-icon.png', 180, 0.34],
]

for (const [name, size, frac] of targets) {
  writeFileSync(join(OUT, name), draw(size, frac))
  console.log('wrote', name)
}
