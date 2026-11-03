import type { CellState, GameState, Puzzle } from './types'
import { RAW_PUZZLES, type RawPuzzle } from './puzzles-data'

/** "0,0,1,1,2" → [0,0,1,1,2] */
function parseRegions(s: string): number[] {
  return s
    .split(',')
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n))
}

/** "012120…" → CellState[]（0=未定 1=黑 2=白） */
function parseCells(s: string): CellState[] {
  return [...s].map((ch) => {
    const n = Number(ch)
    return (n >= 0 && n <= 2 ? n : 0) as CellState
  })
}

function toPuzzle(r: RawPuzzle): Puzzle {
  return {
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    difficulty: r.difficulty,
    regions: parseRegions(r.regions),
  }
}

function toSolution(r: RawPuzzle): GameState | null {
  if (!r.sol) return null
  return {
    puzzleId: r.id,
    width: r.width,
    height: r.height,
    cells: parseCells(r.sol),
  }
}

/** 静态题库（import 即用，无运行时生成） */
export const puzzles: Puzzle[] = RAW_PUZZLES.map(toPuzzle)

const solutions = new Map<string, GameState>()
for (const r of RAW_PUZZLES) {
  const sol = toSolution(r)
  if (sol) solutions.set(r.id, sol)
}

export function getPuzzle(id: string): Puzzle | undefined {
  return puzzles.find((p) => p.id === id)
}

export function getReferenceSolution(id: string): GameState | null {
  return solutions.get(id) ?? null
}

export function randomPuzzle(avoidId?: string): Puzzle {
  const pool = avoidId ? puzzles.filter((p) => p.id !== avoidId) : puzzles
  const list = pool.length ? pool : puzzles
  return list[Math.floor(Math.random() * list.length)]!
}

/** 该题参考解是否由纯逻辑规则推得（生成器标注，用于难度展示） */
export function isLogicSolvable(id: string): boolean {
  const r = RAW_PUZZLES.find((p) => p.id === id)
  return r ? r.logic === true : false
}
