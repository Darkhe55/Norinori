import type { CellState, GameState, Puzzle, ValidationResult } from './types'
import { CellState as CS } from './types'
import { validate } from './validate'

export interface BoardMetrics {
  cell: number
  pad: number
  width: number
  height: number
  svgWidth: number
  svgHeight: number
  /** 相对基准格（48）的缩放，描边/字号都乘它 */
  k: number
}

/** 基准格距；所有描边/圆角/字号按此比例缩放 */
export const BASE_CELL = 48

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  const cell = BASE_CELL
  const pad = cell * 0.35
  return {
    cell,
    pad,
    width: puzzle.width,
    height: puzzle.height,
    svgWidth: pad * 2 + puzzle.width * cell,
    svgHeight: pad * 2 + puzzle.height * cell,
    k: cell / BASE_CELL,
  }
}

/** 格子左上角像素坐标 */
export function cellXY(m: BoardMetrics, cx: number, cy: number) {
  return { x: m.pad + cx * m.cell, y: m.pad + cy * m.cell }
}

export function clientToViewBox(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

/** viewBox 坐标 → 格子索引（越界返回 null） */
export function hitTest(m: BoardMetrics, puzzle: Puzzle, x: number, y: number): number | null {
  const cx = Math.floor((x - m.pad) / m.cell)
  const cy = Math.floor((y - m.pad) / m.cell)
  if (cx < 0 || cy < 0 || cx >= puzzle.width || cy >= puzzle.height) return null
  return cy * puzzle.width + cx
}

/** 区域浅色底（按区域编号取色，帮助辨认区域） */
const REGION_TINTS = [
  '#eaf1ec',
  '#f4ecdf',
  '#e9eef6',
  '#f3e9f0',
  '#eef3e2',
  '#f0e9e4',
  '#e7f1f0',
  '#f5f0e6',
]

/** 多米诺（海苔）主色 */
const NORI_FILL = '#2c3e33'
const NORI_EDGE = '#1d2b23'

export interface RenderOptions {
  /** 键盘光标格 */
  cursor?: number | null
  /** 逻辑回放刚落的格（动画类） */
  flash?: { index: number; to: CellState } | null
}

interface DominoGroup {
  cells: number[]
  /** 完整 1×2 */
  valid: boolean
  horizontal: boolean
}

/** 黑格连通分组（4-邻接）→ 多米诺 */
export function dominoGroups(puzzle: Puzzle, state: GameState): DominoGroup[] {
  const w = puzzle.width
  const h = puzzle.height
  const cells = state.cells
  const seen = new Uint8Array(w * h)
  const groups: DominoGroup[] = []
  const idx = (cx: number, cy: number) => cy * w + cx
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = idx(cx, cy)
      if (seen[i] || cells[i] !== CS.Shaded) continue
      const stack = [i]
      seen[i] = 1
      const list: number[] = []
      while (stack.length) {
        const cur = stack.pop()!
        list.push(cur)
        const ccx = cur % w
        const ccy = Math.floor(cur / w)
        const nbrs = [
          ccx > 0 ? cur - 1 : -1,
          ccx < w - 1 ? cur + 1 : -1,
          ccy > 0 ? cur - w : -1,
          ccy < h - 1 ? cur + w : -1,
        ]
        for (const k of nbrs) {
          if (k < 0 || seen[k] || cells[k] !== CS.Shaded) continue
          seen[k] = 1
          stack.push(k)
        }
      }
      list.sort((a, b) => a - b)
      const horizontal = list.length === 2 && list[1] - list[0] === 1
      groups.push({ cells: list, valid: list.length === 2 && (horizontal || list[1] - list[0] === w), horizontal })
    }
  }
  return groups
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
  opts: RenderOptions = {},
): string {
  const m = metricsFor(puzzle)
  const w = puzzle.width
  const h = puzzle.height
  const cells = state.cells

  const swBorder = Math.max(2, 2.6 * m.k)
  const swGrid = Math.max(1, 1.1 * m.k)
  const swNori = Math.max(1.5, 2 * m.k)
  const rCell = 7 * m.k
  const swX = Math.max(1.4, 2.2 * m.k)
  const xArm = m.cell / 5
  const numSize = Math.max(10, 13 * m.k)

  // 每区黑格数 / 格子数
  const shadedOf = new Map<number, number>()
  const sizeOf = new Map<number, number>()
  const topLeftOf = new Map<number, number>()
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx
      const r = puzzle.regions[i]!
      sizeOf.set(r, (sizeOf.get(r) ?? 0) + 1)
      if (cells[i] === CS.Shaded) shadedOf.set(r, (shadedOf.get(r) ?? 0) + 1)
      if (!topLeftOf.has(r)) topLeftOf.set(r, i)
    }
  }
  const badRegionSet = new Set(result.badRegions.map((b) => b.region))
  const badCellSet = new Set(result.badDominoes.map((d) => d.index))

  const parts: string[] = []
  parts.push(
    `<svg class="board-svg" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">`,
  )

  // 区域浅色底
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx
      const r = puzzle.regions[i]!
      const { x, y } = cellXY(m, cx, cy)
      const tint = REGION_TINTS[r % REGION_TINTS.length]!
      const bad = badRegionSet.has(r)
      parts.push(
        `<rect class="cell-bg${bad ? ' cell-bg-bad' : ''}" data-region="${r}" x="${x}" y="${y}" width="${m.cell}" height="${m.cell}" fill="${tint}" />`,
      )
    }
  }

  // 细格线（区域内也可见，便于数格子）
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const { x, y } = cellXY(m, cx, cy)
      parts.push(
        `<line class="cell-grid" x1="${x}" y1="${y}" x2="${x + m.cell}" y2="${y}" stroke-width="${swGrid}" />`,
      )
      parts.push(
        `<line class="cell-grid" x1="${x}" y1="${y}" x2="${x}" y2="${y + m.cell}" stroke-width="${swGrid}" />`,
      )
    }
  }

  // 区域边界（粗线）
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx
      const r = puzzle.regions[i]!
      const { x, y } = cellXY(m, cx, cy)
      const above = cy > 0 ? puzzle.regions[i - w]! : -1
      const left = cx > 0 ? puzzle.regions[i - 1]! : -1
      if (r !== above) {
        parts.push(
          `<line class="region-border" x1="${x}" y1="${y}" x2="${x + m.cell}" y2="${y}" stroke-width="${swBorder}" />`,
        )
      }
      if (r !== left) {
        parts.push(
          `<line class="region-border" x1="${x}" y1="${y}" x2="${x}" y2="${y + m.cell}" stroke-width="${swBorder}" />`,
        )
      }
      // 右/下边界仅在盘沿
      if (cx === w - 1) {
        parts.push(
          `<line class="region-border" x1="${x + m.cell}" y1="${y}" x2="${x + m.cell}" y2="${y + m.cell}" stroke-width="${swBorder}" />`,
        )
      }
      if (cy === h - 1) {
        parts.push(
          `<line class="region-border" x1="${x}" y1="${y + m.cell}" x2="${x + m.cell}" y2="${y + m.cell}" stroke-width="${swBorder}" />`,
        )
      }
    }
  }

  // 黑格：按连通组画成一个圆角多米诺（非法组逐格画）
  const inset = 3 * m.k
  for (const g of dominoGroups(puzzle, state)) {
    if (g.valid) {
      const [a, b] = g.cells as [number, number]
      const ax = a % w
      const ay = Math.floor(a / w)
      const bx = b % w
      const by = Math.floor(b / w)
      const x0 = m.pad + Math.min(ax, bx) * m.cell + inset
      const y0 = m.pad + Math.min(ay, by) * m.cell + inset
      const x1 = m.pad + (Math.max(ax, bx) + 1) * m.cell - inset
      const y1 = m.pad + (Math.max(ay, by) + 1) * m.cell - inset
      const flashCls =
        opts.flash && (opts.flash.index === a || opts.flash.index === b)
          ? opts.flash.to === CS.Shaded
            ? ' fx-nori'
            : ''
          : ''
      parts.push(
        `<g class="domino${flashCls}" data-cells="${a},${b}">` +
          `<rect class="domino-rect" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="${rCell}" fill="${NORI_FILL}" stroke="${NORI_EDGE}" stroke-width="${swNori}" />` +
          // 中缝：两块海苔的接痕
          `<line class="domino-seam" x1="${(x0 + x1) / 2}" y1="${y0}" x2="${(x0 + x1) / 2}" y2="${y1}" stroke-width="${swNori}" />` +
          `</g>`,
      )
    } else {
      for (const i of g.cells) {
        const cx = i % w
        const cy = Math.floor(i / w)
        const { x, y } = cellXY(m, cx, cy)
        parts.push(
          `<rect class="domino-rect domino-bad" data-cell="${i}" x="${x + inset}" y="${y + inset}" width="${m.cell - inset * 2}" height="${m.cell - inset * 2}" rx="${rCell}" fill="${NORI_FILL}" stroke="${NORI_EDGE}" stroke-width="${swNori}" />`,
        )
      }
    }
  }

  // 禁放白格：小叉
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx
      if (cells[i] !== CS.Forbidden) continue
      const { x, y } = cellXY(m, cx, cy)
      const mx = x + m.cell / 2
      const my = y + m.cell / 2
      const flashCls = opts.flash && opts.flash.index === i && opts.flash.to === CS.Forbidden ? ' fx-x' : ''
      parts.push(
        `<g class="cell-x${flashCls}" data-index="${i}">` +
          `<line class="x-mark" x1="${mx - xArm}" y1="${my - xArm}" x2="${mx + xArm}" y2="${my + xArm}" stroke-width="${swX}" />` +
          `<line class="x-mark" x1="${mx - xArm}" y1="${my + xArm}" x2="${mx + xArm}" y2="${my - xArm}" stroke-width="${swX}" />` +
          `</g>`,
      )
    }
  }

  // 非法黑格红圈
  for (const i of badCellSet) {
    const cx = i % w
    const cy = Math.floor(i / w)
    const { x, y } = cellXY(m, cx, cy)
    parts.push(
      `<rect class="cell-error" x="${x + inset}" y="${y + inset}" width="${m.cell - inset * 2}" height="${m.cell - inset * 2}" rx="${rCell}" />`,
    )
  }

  // 区域计数徽标（黑格数 / 2）
  for (const [r, i] of topLeftOf) {
    const cx = i % w
    const cy = Math.floor(i / w)
    const { x, y } = cellXY(m, cx, cy)
    const shaded = shadedOf.get(r) ?? 0
    const cls = shaded === 2 ? 'region-badge ok' : shaded > 2 ? 'region-badge bad' : 'region-badge'
    parts.push(
      `<g class="${cls}" data-region="${r}"><circle cx="${x + 9 * m.k}" cy="${y + 9 * m.k}" r="${8.5 * m.k}" /><text x="${x + 9 * m.k}" y="${y + 9 * m.k}" style="font-size:${numSize}px">${shaded}</text></g>`,
    )
  }

  // 键盘光标
  if (opts.cursor !== null && opts.cursor !== undefined) {
    const cx = opts.cursor % w
    const cy = Math.floor(opts.cursor / w)
    const { x, y } = cellXY(m, cx, cy)
    parts.push(
      `<rect class="cell-cursor" x="${x + inset}" y="${y + inset}" width="${m.cell - inset * 2}" height="${m.cell - inset * 2}" rx="${rCell}" />`,
    )
  }

  // 命中层（透明大格，接收指针）
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx
      const { x, y } = cellXY(m, cx, cy)
      parts.push(
        `<rect class="cell-hit" data-index="${i}" x="${x}" y="${y}" width="${m.cell}" height="${m.cell}" />`,
      )
    }
  }

  parts.push('</svg>')
  return parts.join('\n')
}

export function validateNow(puzzle: Puzzle, state: GameState): ValidationResult {
  return validate(state, puzzle)
}
