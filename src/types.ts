/** 格子标记：未定 / 多米诺黑格 / 禁放白格 */
export const enum CellState {
  Unknown = 0,
  Shaded = 1,
  Forbidden = 2,
}

export interface Puzzle {
  id: string
  name: string
  width: number
  height: number
  /** row-major，长度 = width*height，值为区域编号（>=0，同号同区） */
  regions: number[]
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
}

export interface GameState {
  puzzleId: string
  width: number
  height: number
  /** row-major，长度 = width*height */
  cells: CellState[]
}

export interface Move {
  index: number
  from: CellState
  to: CellState
}

/** 一个区域的校验结果 */
export interface RegionCount {
  region: number
  /** 区域内已黑格数 */
  shaded: number
  /** 区域内格子总数 */
  size: number
}

/** 一个多米诺（两格）的校验结果 */
export interface DominoInfo {
  /** 黑格索引对 */
  pair: [number, number]
}

export interface ValidationResult {
  /** 每区黑格数（按区域编号排序，仅含已超过 2 或不足且无未知格的区） */
  badRegions: RegionCount[]
  /** 已成对但还有其它黑格的非法多米诺（>=3 格连通 / 相邻） */
  badDominoes: Array<{ index: number; reason: 'lonely' | 'crowded' | 'touch' }>
  /** 全部正确 */
  solved: boolean
  /** 已黑格总数 */
  shadedCount: number
}
