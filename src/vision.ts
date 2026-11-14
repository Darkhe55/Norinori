/**
 * 题图识别：把「细格线 + 粗区域线」的 Norinori 题图转成区域数组。
 * 纯函数、不依赖 DOM：浏览器用 canvas ImageData 调用，Node 用 PNG 解码后调用。
 *
 * 识别流程：
 * 1. 灰度化 → 暗像素掩码；
 * 2. 找盘面外框（暗像素包围盒）；
 * 3. 按整行/整列的暗像素覆盖率找出所有贯通格线 → 得到行列数；
 * 4. 在每行/列的格心处量格线粗细：细线 = 同区，粗线 = 区域边界；
 * 5. 并查集合并同区格子，紧凑重编号。
 */

export interface RgbaImage {
  width: number
  height: number
  /** RGBA 字节，长度 = width*height*4 */
  data: Uint8ClampedArray | Uint8Array
}

export interface VisionOptions {
  /** 灰度低于此值视为墨线（默认 128） */
  darkThreshold?: number
  /** 贯通格线判定：暗像素占盘面边长的比例（默认 0.55） */
  lineCoverage?: number
}

export interface BoardBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface VisionDiagnostics {
  board: BoardBounds
  /** 竖格线中心 x（从左到右） */
  gridLinesX: number[]
  /** 横格线中心 y（从上到下） */
  gridLinesY: number[]
  /** 细格线宽度中位数（像素） */
  thinWidth: number
  /** 粗区域线宽度中位数（像素；0 = 未检出） */
  thickWidth: number
  /** ≥ 该宽度视为区域边界 */
  borderThreshold: number
  regionCount: number
  regionSizes: number[]
}

export interface VisionResult {
  width: number
  height: number
  /** row-major 区域编号，0..regionCount-1 */
  regions: number[]
  diagnostics: VisionDiagnostics
  warnings: string[]
}

export class VisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisionError'
  }
}

function buildDarkMask(image: RgbaImage, threshold: number): Uint8Array {
  const { width, height, data } = image
  const n = width * height
  const dark = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // 近似亮度（0.30R + 0.59G + 0.11B）
    const lum = (data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8
    dark[i] = lum < threshold ? 1 : 0
  }
  return dark
}

function findDarkBounds(dark: Uint8Array, w: number, h: number): BoardBounds {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (!dark[row + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0 || y1 < y0) throw new VisionError('图中没有找到深色线条')
  return { x0, y0, x1, y1 }
}

/** 把连续超过阈值的列/行合并成一条格线，中心按墨量加权 */
function detectLineCenters(counts: number[], minCount: number): number[] {
  const out: number[] = []
  let i = 0
  while (i < counts.length) {
    if (counts[i]! < minCount) {
      i++
      continue
    }
    let j = i
    let weight = 0
    let sum = 0
    while (j < counts.length && counts[j]! >= minCount) {
      const c = counts[j]!
      sum += c * j
      weight += c
      j++
    }
    out.push(weight > 0 ? sum / weight : (i + j - 1) / 2)
    i = j
  }
  return out
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** 格线间距是否基本均匀（最大偏差 ≤ 25%） */
function isRegular(lines: number[]): boolean {
  if (lines.length < 3) return false
  const gaps: number[] = []
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i]! - lines[i - 1]!)
  const med = median(gaps)
  if (med <= 0) return false
  return gaps.every((g) => Math.abs(g - med) / med <= 0.25)
}

function detectGrid(counts: number[], span: number, coverage: number): number[] {
  let best: number[] | null = null
  for (const cov of [coverage, Math.min(coverage, 0.42), 0.3, 0.2]) {
    const lines = detectLineCenters(counts, Math.max(3, Math.round(span * cov)))
    if (lines.length < 3) continue
    if (isRegular(lines)) return lines
    if (!best || lines.length > best.length) best = lines
  }
  if (best) return best
  throw new VisionError('未识别到规则格线，请使用带完整细格线的题图')
}

/**
 * 在指定位置量格线粗细：沿 axis 方向测量连续暗像素的长度。
 * 'x' = 量竖线（水平方向），'y' = 量横线（垂直方向）。
 */
function runWidth(
  dark: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  axis: 'x' | 'y',
): number {
  let cx = x
  let cy = y
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return 0
  if (!dark[cy * w + cx]) {
    let found = false
    for (let d = 1; d <= 2 && !found; d++) {
      const cands: Array<[number, number]> =
        axis === 'x'
          ? [
              [cx - d, cy],
              [cx + d, cy],
            ]
          : [
              [cx, cy - d],
              [cx, cy + d],
            ]
      for (const [nx, ny] of cands) {
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && dark[ny * w + nx]) {
          cx = nx
          cy = ny
          found = true
          break
        }
      }
    }
    if (!found) return 0
  }
  let count = 1
  if (axis === 'x') {
    for (let nx = cx - 1; nx >= 0 && dark[cy * w + nx]; nx--) count++
    for (let nx = cx + 1; nx < w && dark[cy * w + nx]; nx++) count++
  } else {
    for (let ny = cy - 1; ny >= 0 && dark[ny * w + cx]; ny--) count++
    for (let ny = cy + 1; ny < h && dark[ny * w + cx]; ny++) count++
  }
  return count
}

/**
 * 一维两簇划分：把线宽分成「细」「粗」两组。
 * 用最大间距找分界；分不开时视为只有细线（thickWidth = 0）。
 */
function classifyWidths(widths: number[]): { threshold: number; thin: number; thick: number } {
  const pos = widths.filter((v) => v > 0)
  if (!pos.length) return { threshold: 1, thin: 0, thick: 0 }
  const uniq = [...new Set(pos)].sort((a, b) => a - b)
  if (uniq.length === 1) {
    return { threshold: uniq[0]! + 1, thin: uniq[0]!, thick: 0 }
  }
  let bestGap = -1
  let at = 0
  for (let i = 1; i < uniq.length; i++) {
    const gap = uniq[i]! - uniq[i - 1]!
    if (gap > bestGap) {
      bestGap = gap
      at = i
    }
  }
  if (bestGap < 2) {
    return { threshold: uniq[uniq.length - 1]! + 1, thin: median(pos), thick: 0 }
  }
  const threshold = (uniq[at - 1]! + uniq[at]!) / 2
  return {
    threshold,
    thin: median(pos.filter((v) => v < threshold)),
    thick: median(pos.filter((v) => v >= threshold)),
  }
}

export function recognizePuzzle(image: RgbaImage, opts: VisionOptions = {}): VisionResult {
  const { width: W, height: H } = image
  if (!W || !H) throw new VisionError('图像尺寸为 0')
  if (image.data.length < W * H * 4) throw new VisionError('图像数据不完整（需要 RGBA）')

  const dark = buildDarkMask(image, opts.darkThreshold ?? 128)
  const board = findDarkBounds(dark, W, H)
  const spanX = board.x1 - board.x0 + 1
  const spanY = board.y1 - board.y0 + 1

  const colCounts = new Array<number>(W).fill(0)
  const rowCounts = new Array<number>(H).fill(0)
  for (let y = board.y0; y <= board.y1; y++) {
    const row = y * W
    for (let x = board.x0; x <= board.x1; x++) {
      if (!dark[row + x]) continue
      colCounts[x]!++
      rowCounts[y]!++
    }
  }

  const coverage = opts.lineCoverage ?? 0.55
  const xs = detectGrid(colCounts, spanY, coverage)
  const ys = detectGrid(rowCounts, spanX, coverage)
  const cols = xs.length - 1
  const rows = ys.length - 1
  if (cols < 2 || rows < 2) throw new VisionError('格线太少，无法识别题板')

  // 竖线粗细：每行格心处测量（行 × 内部竖线）
  const vertical: number[][] = []
  for (let r = 0; r < rows; r++) {
    const y = Math.round((ys[r]! + ys[r + 1]!) / 2)
    const arr: number[] = []
    for (let k = 1; k < xs.length - 1; k++) {
      arr.push(runWidth(dark, W, H, Math.round(xs[k]!), y, 'x'))
    }
    vertical.push(arr)
  }

  // 横线粗细：每列格心处测量（列 × 内部横线）
  const horizontal: number[][] = []
  for (let c = 0; c < cols; c++) {
    const x = Math.round((xs[c]! + xs[c + 1]!) / 2)
    const arr: number[] = []
    for (let k = 1; k < ys.length - 1; k++) {
      arr.push(runWidth(dark, W, H, x, Math.round(ys[k]!), 'y'))
    }
    horizontal.push(arr)
  }

  const allWidths = [...vertical.flat(), ...horizontal.flat()]
  const cls = classifyWidths(allWidths)
  const threshold = cls.threshold

  const n = cols * rows
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (a: number): number => {
    let x = a
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (vertical[r]![c]! < threshold) union(r * cols + c, r * cols + c + 1)
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      if (horizontal[c]![r]! < threshold) union(r * cols + c, (r + 1) * cols + c)
    }
  }

  const idMap = new Map<number, number>()
  const regions = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const root = find(i)
    let id = idMap.get(root)
    if (id === undefined) {
      id = idMap.size
      idMap.set(root, id)
    }
    regions[i] = id
  }

  const regionSizes = new Array<number>(idMap.size).fill(0)
  for (const r of regions) regionSizes[r]!++

  const warnings: string[] = []
  if (!isRegular(xs)) warnings.push('竖格线间距不均匀，识别可能有误')
  if (!isRegular(ys)) warnings.push('横格线间距不均匀，识别可能有误')
  if (cls.thick === 0) warnings.push('未区分出粗区域线，可能把整块盘面识别成了一个区域')
  const tooSmall = regionSizes.filter((s) => s < 2).length
  if (tooSmall) warnings.push(`${tooSmall} 个区域少于 2 格，题目无法成立`)

  return {
    width: cols,
    height: rows,
    regions,
    diagnostics: {
      board,
      gridLinesX: xs,
      gridLinesY: ys,
      thinWidth: cls.thin,
      thickWidth: cls.thick,
      borderThreshold: threshold,
      regionCount: idMap.size,
      regionSizes,
    },
    warnings,
  }
}
