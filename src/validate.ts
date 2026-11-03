import type { GameState, Puzzle, ValidationResult } from './types'
import { CellState as CS } from './types'
import { neighbors, regionCells } from './state'

/**
 * 校验规则（海苔 / Norinori）：
 * 1. 黑格必须两两组成 1×2 多米诺：每个黑格恰好有一个正交相邻黑格；
 * 2. 每个区域恰好有 2 个黑格；
 * 3. 任意两个多米诺不得正交相邻（由规则 1 自动涵盖）。
 */
export function validate(state: GameState, puzzle: Puzzle): ValidationResult {
  const { width: w, height: h } = puzzle
  const cells = state.cells
  const groups = regionCells(puzzle)
  const badRegions: ValidationResult['badRegions'] = []
  const badDominoes: ValidationResult['badDominoes'] = []

  for (let r = 0; r < groups.length; r++) {
    const list = groups[r]!
    let shaded = 0
    let unknown = 0
    for (const i of list) {
      const v = cells[i]!
      if (v === CS.Shaded) shaded++
      else if (v === CS.Unknown) unknown++
    }
    if (shaded > 2 || (unknown === 0 && shaded !== 2)) {
      badRegions.push({ region: r, shaded, size: list.length })
    }
  }

  // 孤格/粘连/相贴检测
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx
      if (cells[i] !== CS.Shaded) continue
      const nbrs = neighbors(puzzle, i)
      const shadedNbrs = nbrs.filter((n) => cells[n] === CS.Shaded)
      if (shadedNbrs.length === 0) {
        // 周围还有未知格 → 只是暂时没配上，不算错
        if (!nbrs.some((n) => cells[n] === CS.Unknown)) {
          badDominoes.push({ index: i, reason: 'lonely' })
        }
      } else if (shadedNbrs.length > 1) {
        badDominoes.push({ index: i, reason: shadedNbrs.length === 2 ? 'crowded' : 'touch' })
      }
    }
  }

  const solved = badRegions.length === 0 && badDominoes.length === 0
  let shadedCount = 0
  for (const v of cells) if (v === CS.Shaded) shadedCount++
  return { badRegions, badDominoes, solved, shadedCount }
}

/** 供状态栏的人话描述 */
export function describe(result: ValidationResult, totalRegions: number): string[] {
  const bits: string[] = []
  bits.push(`黑格 ${result.shadedCount} / ${totalRegions * 2}`)
  if (result.badRegions.length) bits.push(`${result.badRegions.length} 个区域黑格数不对`)
  const lonely = result.badDominoes.filter((d) => d.reason === 'lonely').length
  const crowded = result.badDominoes.filter((d) => d.reason === 'crowded').length
  const touch = result.badDominoes.filter((d) => d.reason === 'touch').length
  if (lonely) bits.push(`${lonely} 个黑格配不成多米诺`)
  if (crowded) bits.push(`${crowded} 处多米诺超过两格`)
  if (touch) bits.push(`${touch} 处多米诺相互相贴`)
  return bits
}
