import type { Puzzle } from './types'
import { readLibrary, writeLibrary, type LibraryEntry } from './store'

export type SavedPuzzle = Puzzle & {
  savedAt: number
}

/** "0,0,1,1,2" → [0,0,1,1,2] */
function parseRegions(s: string): number[] {
  return s
    .split(',')
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n))
}

function encodeRegions(regions: number[]): string {
  return regions.join(',')
}

function toEntry(p: SavedPuzzle): LibraryEntry {
  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    difficulty: p.difficulty,
    regions: encodeRegions(p.regions),
    savedAt: p.savedAt,
  }
}

function fromEntry(x: LibraryEntry): SavedPuzzle {
  return {
    id: x.id,
    name: x.name || `自定义 · ${x.width}×${x.height}`,
    width: x.width,
    height: x.height,
    difficulty: (x.difficulty as Puzzle['difficulty']) || 'custom',
    regions: parseRegions(x.regions),
    savedAt: x.savedAt || Date.now(),
  }
}

/** 题库数据来自项目内 data/library.json（降级时才是 localStorage） */
export function loadSavedPuzzles(): SavedPuzzle[] {
  return readLibrary()
    .filter(
      (x) =>
        x &&
        x.id &&
        x.width > 0 &&
        x.height > 0 &&
        typeof x.regions === 'string' &&
        parseRegions(x.regions).length === x.width * x.height,
    )
    .map(fromEntry)
}

export function persistSavedPuzzles(list: SavedPuzzle[]): void {
  writeLibrary(list.map(toEntry))
}

/** 追加或覆盖同 id，返回最新列表 */
export function savePuzzleToLibrary(p: Puzzle): SavedPuzzle[] {
  const list = loadSavedPuzzles()
  const item: SavedPuzzle = { ...p, difficulty: 'custom', savedAt: Date.now() }
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list[i] = item
  else list.push(item)
  persistSavedPuzzles(list)
  return list
}

export function removeSavedPuzzle(id: string): SavedPuzzle[] {
  const list = loadSavedPuzzles().filter((p) => p.id !== id)
  persistSavedPuzzles(list)
  return list
}
