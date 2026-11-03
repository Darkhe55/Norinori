import type { CellState, GameState, Move, Puzzle } from './types'
import { CellState as CS } from './types'

export function cellIndex(w: number, cx: number, cy: number): number {
  return cy * w + cx
}

export function inBounds(p: Puzzle, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < p.width && cy < p.height
}

/** 四邻（上下左右）在扁平数组中的索引，越界自动剔除 */
export function neighbors(p: Puzzle, index: number): number[] {
  const w = p.width
  const h = p.height
  const cx = index % w
  const cy = Math.floor(index / w)
  const out: number[] = []
  if (cy > 0) out.push(index - w)
  if (cy < h - 1) out.push(index + w)
  if (cx > 0) out.push(index - 1)
  if (cx < w - 1) out.push(index + 1)
  return out
}

export function regionOf(p: Puzzle, index: number): number {
  return p.regions[index] ?? -1
}

/** 每个区域包含哪些格子（按区域编号分组） */
export function regionCells(p: Puzzle): number[][] {
  const groups: number[][] = []
  for (let i = 0; i < p.regions.length; i++) {
    const r = p.regions[i]!
    while (groups.length <= r) groups.push([])
    groups[r]!.push(i)
  }
  return groups
}

export function regionCount(p: Puzzle): number {
  let max = -1
  for (const r of p.regions) if (r > max) max = r
  return max + 1
}

export function cellValue(state: GameState, index: number): CellState {
  return state.cells[index] ?? CS.Unknown
}

export function setCell(state: GameState, index: number, value: CellState): void {
  state.cells[index] = value
}

export function cycleCell(current: CellState): CellState {
  if (current === CS.Unknown) return CS.Shaded
  if (current === CS.Shaded) return CS.Forbidden
  return CS.Unknown
}

export function createEmptyState(puzzle: Puzzle): GameState {
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    cells: new Array<CellState>(puzzle.width * puzzle.height).fill(CS.Unknown),
  }
}

export function applyMove(state: GameState, move: Move): void {
  setCell(state, move.index, move.to)
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

/** 序列化进度（格子 0/1/2 串） */
export function serializeState(state: GameState) {
  return {
    version: 1 as const,
    puzzleId: state.puzzleId,
    width: state.width,
    height: state.height,
    cells: state.cells.map((s) => s as number),
    updatedAt: Date.now(),
  }
}

export function deserializeState(data: {
  version: number
  puzzleId: string
  width: number
  height: number
  cells: number[]
}): GameState {
  return {
    puzzleId: data.puzzleId,
    width: data.width,
    height: data.height,
    cells: data.cells.map((n) => Math.max(0, Math.min(2, n | 0)) as CellState),
  }
}
