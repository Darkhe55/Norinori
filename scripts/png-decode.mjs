/**
 * 极简 PNG 解码器（Node 内置 zlib，无第三方依赖）。
 * 支持：8 位深、非隔行、颜色类型 0/2/3/4/6。
 * 输出统一的 RGBA 字节数组，供 src/vision.ts 识别。
 */
import zlib from 'node:zlib'

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodePng(buf) {
  if (buf.length < 8 || !SIGNATURE.every((b, i) => buf[i] === b)) {
    throw new Error('不是 PNG 文件')
  }

  let off = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let palette = null
  const idat = []

  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const start = off + 8
    const end = start + len
    if (end + 4 > buf.length) throw new Error('PNG 数据被截断')
    if (type === 'IHDR') {
      width = buf.readUInt32BE(start)
      height = buf.readUInt32BE(start + 4)
      bitDepth = buf[start + 8]
      colorType = buf[start + 9]
      const compression = buf[start + 10]
      const filter = buf[start + 11]
      interlace = buf[start + 12]
      if (compression !== 0 || filter !== 0) throw new Error('不支持的 PNG 压缩/过滤方式')
      if (interlace !== 0) throw new Error('暂不支持隔行扫描 PNG')
    } else if (type === 'PLTE') {
      palette = buf.subarray(start, end)
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(start, end))
    } else if (type === 'IEND') {
      break
    }
    off = end + 4
  }

  if (!width || !height) throw new Error('PNG 缺少 IHDR')
  if (bitDepth !== 8) throw new Error(`暂不支持 ${bitDepth} 位深的 PNG（请用 8 位）`)
  if (![0, 2, 3, 4, 6].includes(colorType)) throw new Error(`不支持的 PNG 颜色类型 ${colorType}`)
  if (!idat.length) throw new Error('PNG 缺少 IDAT')

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  const bpp = channels
  const stride = width * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  if (raw.length < (stride + 1) * height) throw new Error('PNG 像素数据不完整')

  const px = Buffer.alloc(stride * height)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const rowStart = y * stride
    const prevStart = rowStart - stride
    for (let x = 0; x < stride; x++) {
      const value = raw[pos++]
      const a = x >= bpp ? px[rowStart + x - bpp] : 0
      const b = y > 0 ? px[prevStart + x] : 0
      const c = x >= bpp && y > 0 ? px[prevStart + x - bpp] : 0
      let pred = 0
      if (filter === 1) pred = a
      else if (filter === 2) pred = b
      else if (filter === 3) pred = (a + b) >> 1
      else if (filter === 4) pred = paeth(a, b, c)
      else if (filter !== 0) throw new Error(`不支持的 PNG 行过滤类型 ${filter}`)
      px[rowStart + x] = (value + pred) & 0xff
    }
  }

  if (colorType === 3 && !palette) throw new Error('调色板 PNG 缺少 PLTE')

  const out = new Uint8Array(width * height * 4)
  let o = 0
  for (let i = 0; i < width * height; i++) {
    if (colorType === 0) {
      const g = px[i]
      out[o++] = g
      out[o++] = g
      out[o++] = g
      out[o++] = 255
    } else if (colorType === 4) {
      const g = px[i * 2]
      out[o++] = g
      out[o++] = g
      out[o++] = g
      out[o++] = px[i * 2 + 1]
    } else if (colorType === 2) {
      out[o++] = px[i * 3]
      out[o++] = px[i * 3 + 1]
      out[o++] = px[i * 3 + 2]
      out[o++] = 255
    } else if (colorType === 6) {
      out[o++] = px[i * 4]
      out[o++] = px[i * 4 + 1]
      out[o++] = px[i * 4 + 2]
      out[o++] = px[i * 4 + 3]
    } else {
      const idx = px[i] * 3
      out[o++] = palette[idx]
      out[o++] = palette[idx + 1]
      out[o++] = palette[idx + 2]
      out[o++] = 255
    }
  }

  return { width, height, data: out }
}
