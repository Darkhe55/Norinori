import type { CellState, GameState, Puzzle } from './types'
import { CellState as CS } from './types'
import { neighbors, regionCells } from './state'

export interface SolveResult {
  solved: boolean
  solution: GameState | null
  nodes: number
  timedOut: boolean
}

export interface CountResult {
  count: number
  capped: boolean
  nodes: number
  timedOut: boolean
  first: GameState | null
  second: GameState | null
}

/** 逻辑规则编号（logic.ts 回放时展示用） */
export type RuleId =
  | 'region-full'
  | 'region-last'
  | 'pair-clean'
  | 'lone-partner'
  | 'no-room'
  | 'touch-clean'
  | 'block-2x2'
  | 'hypo-shade'
  | 'hypo-forbid'

export interface Decision {
  index: number
  /** 推理前的值（当前盘面值）：回放帧的 from 必须用它，不能凭空当空盘 */
  from: CellState
  to: CellState
  rule: RuleId
}

const UNK = CS.Unknown
const ON = CS.Shaded
const OFF = CS.Forbidden

/**
 * Norinori 约束引擎。本作 validate() 的实际判定是：
 * - 黑格必须恰好有一个正交相邻黑格（两两配对成多米诺）；
 * - 每区恰好 2 个黑格；
 * - 多米诺之间不得相贴（由「每个黑格恰好一个黑邻」涵盖）。
 * 注意：判定并不要求「同一区的两黑格必须相邻」，参考解里存在跨区配对的多米诺，
 * 所以引擎里不能使用「区内成对」类规则（那会对现有题库误判）。
 *
 * propagate() 做可证明的局部规则推理到饱和；search() 在推理之上按 MRV 回溯。
 */
export class NorinoriEngine {
  readonly w: number
  readonly h: number
  readonly n: number
  readonly puzzle: Puzzle
  private readonly nbrs: number[][]
  private readonly byRegion: number[][]
  private readonly regionId: number[]
  readonly regionTotal: number

  marks: Int8Array
  private regionShaded: Int32Array
  private regionUnknown: Int32Array

  constructor(puzzle: Puzzle, marks?: Int8Array) {
    this.puzzle = puzzle
    this.w = puzzle.width
    this.h = puzzle.height
    this.n = this.w * this.h
    this.nbrs = new Array(this.n)
    for (let i = 0; i < this.n; i++) this.nbrs[i] = neighbors(puzzle, i)
    this.byRegion = regionCells(puzzle)
    this.regionTotal = this.byRegion.length
    this.regionId = puzzle.regions
    this.regionShaded = new Int32Array(this.regionTotal)
    this.regionUnknown = new Int32Array(this.regionTotal)
    this.marks = marks ? marks.slice() : new Int8Array(this.n).fill(UNK)
    this.recount()
  }

  private recount(): void {
    this.regionShaded.fill(0)
    this.regionUnknown.fill(0)
    for (let i = 0; i < this.n; i++) {
      const r = this.regionId[i]!
      const v = this.marks[i]!
      if (v === ON) this.regionShaded[r]++
      else if (v === UNK) this.regionUnknown[r]++
    }
  }

  /** 快照/回滚（回溯用） */
  snapshot(): Int8Array {
    return this.marks.slice()
  }

  restore(marks: Int8Array): void {
    this.marks = marks.slice()
    this.recount()
  }

  private markCell(i: number, val: CellState, out: Decision[] | null, rule: RuleId): void {
    const from = this.marks[i]!
    if (from === val) return
    this.marks[i] = val
    const r = this.regionId[i]!
    if (from === ON) this.regionShaded[r]--
    else if (from === UNK) this.regionUnknown[r]--
    if (val === ON) this.regionShaded[r]++
    else if (val === UNK) this.regionUnknown[r]++
    if (out) out.push({ index: i, from, to: val, rule })
  }

  /**
   * 规则推理到饱和。返回 false 表示已矛盾。
   * out 非空时逐条记录推理过程（供逻辑回放）。
   *
   * 规则（都是对当前判定模型可证明的局部结论）：
   *  - region-full  区域已满 2 黑 → 其余涂白；
   *  - region-last  区域还需要 need 个黑格、可能变黑的格子恰为 need 个 → 全部涂黑；
   *  - pair-clean   黑格已配上对（有黑邻）→ 其余邻格涂白；
   *  - lone-partner 孤黑格只剩一个候选搭档 → 该格涂黑；
   *  - no-room      放黑也成不了多米诺 → 涂白（含「没有可搭档的未知邻格」）；
   *  - touch-clean  孤黑格的两个候选搭档的公共邻格必白；
   *  - block-2x2    1×3/1×4/2×2/2×3/3×2/2×4/4×2/3×3 内黑格数达到上限
   *                 → 其余涂白；超过上限 → 矛盾。
   * 外加 Hall 必要性检查（未配对黑格的候选搭档数量不足 → 矛盾）。
   */
  propagate(out: Decision[] | null = null): boolean {
    const inQueue = new Uint8Array(this.n)
    const regionQueued = new Uint8Array(this.regionTotal)
    const queue: number[] = []
    const regionQueue: number[] = []
    // 初始：所有格子都待查；所有区域都待扫描
    for (let i = 0; i < this.n; i++) {
      queue.push(i)
      inQueue[i] = 1
    }
    for (let r = 0; r < this.regionTotal; r++) {
      regionQueue.push(r)
      regionQueued[r] = 1
    }

    const scheduleRegion = (r: number) => {
      if (regionQueued[r]) return
      regionQueued[r] = 1
      regionQueue.push(r)
    }

    const push = (i: number) => {
      if (!inQueue[i]) {
        inQueue[i] = 1
        queue.push(i)
      }
    }

    /** 落子并唤醒相关格（自身 + 邻格 + 邻格所在区域） */
    const mark = (i: number, val: CellState, rule: RuleId) => {
      if (this.marks[i] === val) return
      this.markCell(i, val, out, rule)
      push(i)
      for (const nb of this.nbrs[i]!) {
        push(nb)
        scheduleRegion(this.regionId[nb]!)
      }
      scheduleRegion(this.regionId[i]!)
    }

    /**
     * 局部判定：UNK 格 i 是否可能涂黑。
     * 这是"任何解中 i 为黑"的必要条件，取反即可推白：
     * - 所在区域已满 2 格；
     * - 有 ≥2 个黑邻格（会挤成 >2 格连通）；
     * - 唯一黑邻格已成双（会贴到别的多米诺）；
     * - 没有黑邻格也没有未知邻格（无处配成 1×2）。
     */
    const canShade = (i: number): boolean => {
      const r = this.regionId[i]!
      if (this.regionShaded[r]! >= 2) return false
      let shadedCnt = 0
      let lonely = false
      const unkNbrs: number[] = []
      for (const k of this.nbrs[i]!) {
        const v = this.marks[k]!
        if (v === ON) {
          shadedCnt++
          let p = 0
          for (const kk of this.nbrs[k]!) if (this.marks[kk] === ON) p++
          if (p === 0) lonely = true
        } else if (v === UNK) {
          unkNbrs.push(k)
        }
      }
      if (shadedCnt >= 2) return false
      if (shadedCnt === 1) return lonely
      // 没有黑邻：必须存在一个「可能成为搭档」的未知邻格
      //（该格所在区域没满，且它自己还没有黑邻）
      for (const u of unkNbrs) {
        if (this.regionShaded[this.regionId[u]!]! >= 2) continue
        let hasOn = false
        for (const kk of this.nbrs[u]!) {
          if (this.marks[kk] === ON) {
            hasOn = true
            break
          }
        }
        if (!hasOn) return true
      }
      return false
    }

    /** 孤黑格 s 的候选配对格判定：u 可涂黑，且 u 的黑邻格只有 s */
    const partnerCandidate = (u: number, s: number): boolean => {
      if (this.regionShaded[this.regionId[u]!]! >= 2) return false
      for (const k of this.nbrs[u]!) {
        if (this.marks[k]! === ON && k !== s) return false
      }
      return true
    }

    /**
     * 小矩形超限规则：在任意 1×3、1×4、2×2、2×3、3×2、2×4、4×2、3×3 里，
     * 黑格数不会超过 max（枚举验证：每个黑格在矩形内的黑邻格都不超过 1 个时的最大值）。
     * 达到 max → 矩形其余格再加黑必超限，全部涂白；超过 max → 矛盾。
     * 这条规则会顺带覆盖「2×2 黑格超限」。
     */
    const RECTS: Array<[number, number, number]> = [
      [1, 3, 2],
      [1, 4, 3],
      [2, 2, 2],
      [2, 3, 4],
      [3, 2, 4],
      [2, 4, 4],
      [4, 2, 4],
      [3, 3, 5],
    ]
    const checkRect = (x0: number, y0: number, ww: number, hh: number, max: number): boolean => {
      let on = 0
      const unk: number[] = []
      for (let dy = 0; dy < hh; dy++) {
        const rowBase = (y0 + dy) * this.w
        for (let dx = 0; dx < ww; dx++) {
          const q = rowBase + x0 + dx
          if (this.marks[q] === ON) on++
          else if (this.marks[q] === UNK) unk.push(q)
        }
      }
      if (on > max) return false
      if (on === max) for (const q of unk) mark(q, OFF, 'block-2x2')
      return true
    }

    /** 检查包含格子 i 的所有小矩形（i 作为矩形内任意位置） */
    const checkBlocksAt = (i: number): boolean => {
      const cx = i % this.w
      const cy = (i / this.w) | 0
      for (const [ww, hh, max] of RECTS) {
        for (let ox = ww - 1; ox >= 0; ox--) {
          const x0 = cx - ox
          if (x0 < 0 || x0 + ww > this.w) continue
          for (let oy = hh - 1; oy >= 0; oy--) {
            const y0 = cy - oy
            if (y0 < 0 || y0 + hh > this.h) continue
            if (!checkRect(x0, y0, ww, hh, max)) return false
          }
        }
      }
      return true
    }

    /**
     * 区域规则扫描（只加可证明的局部定式）：
     * - 区域已满 2 黑 → 其余必白；
     * - 区域还需要 need 个黑格，而「可能变黑」的格子恰好 need 个 → 全部涂黑；
     * - 可能变黑的格子少于 need → 矛盾。
     * 注意本作的实际判定是「每区恰好 2 黑 + 黑格两两配成互不相贴的多米诺」，
     * 一个多米诺可以跨区，所以不能假设「同区两黑必须相邻」。
     */
    const scanRegion = (r: number): boolean => {
      const members = this.byRegion[r]!
      const shaded = this.regionShaded[r]!
      if (shaded > 2) return false
      const need = 2 - shaded
      if (need === 0) {
        for (const c of members) if (this.marks[c] === UNK) mark(c, OFF, 'region-full')
        return true
      }
      const unknowns: number[] = []
      const cands: number[] = []
      for (const c of members) {
        if (this.marks[c] !== UNK) continue
        unknowns.push(c)
        if (canShade(c)) cands.push(c)
      }
      if (cands.length < need) return false
      if (cands.length === need) {
        const candSet = new Set(cands)
        for (const c of unknowns) {
          if (candSet.has(c)) mark(c, ON, 'region-last')
          else mark(c, OFF, 'region-full')
        }
      }
      return true
    }

    while (queue.length || regionQueue.length) {
      if (regionQueue.length) {
        const r = regionQueue.pop()!
        regionQueued[r] = 0
        if (!scanRegion(r)) return false
        continue
      }
      const i = queue.pop()!
      inQueue[i] = 0
      const v = this.marks[i]!
      const r = this.regionId[i]!

      if (v === UNK) {
        // 区域已满 2 格 → 其余必白
        if (this.regionShaded[r] === 2) {
          mark(i, OFF, 'region-full')
          continue
        }
        // 放黑也成不了多米诺 → 必白
        if (!canShade(i)) {
          mark(i, OFF, 'no-room')
          continue
        }
        continue
      }

      if (v === ON) {
        // 2×2 超限检查
        if (!checkBlocksAt(i)) return false
        const nb = this.nbrs[i]!
        let shaded = 0
        const unknownNbrs: number[] = []
        for (const k of nb) {
          const mv = this.marks[k]!
          if (mv === ON) shaded++
          else if (mv === UNK) unknownNbrs.push(k)
        }
        if (shaded > 1) return false
        if (shaded === 1) {
          // 已成双 → 其余未知邻格必白
          for (const k of unknownNbrs) mark(k, OFF, 'pair-clean')
          continue
        }
        // 孤黑格：配对格可以是任意相邻未知格（多米诺允许跨区）
        const cands = unknownNbrs.filter((u) => partnerCandidate(u, i))
        if (!cands.length) return false
        if (cands.length === 1) {
          mark(cands[0]!, ON, 'lone-partner')
        } else if (cands.length === 2) {
          // 孤黑格只有两个候选邻格：与两者都相邻的格子必白
          //（无论谁最终成双，它都会贴到多米诺上）
          const a = cands[0]!
          const b = cands[1]!
          const bn = this.nbrs[b]!
          for (const c of this.nbrs[a]!) {
            if (c === i || c === a || c === b) continue
            if (this.marks[c] !== UNK) continue
            if (!bn.includes(c)) continue
            mark(c, OFF, 'touch-clean')
          }
        }
        continue
      }

      // OFF：只可能影响区域计数（已在 markCell 时处理），无需再查
    }

    /**
     * 配对可行性（Hall 必要性）：还没配上对的黑格需要互不相同的搭档，
     * 若少数几个黑格的候选搭档总数不够，则当前盘面必矛盾。
     * 这是纯必要条件检查，用来更快发现假设检验里的死路。
     */
    const hallCheck = (): boolean => {
      const cand: number[][] = []
      for (let i = 0; i < this.n; i++) {
        if (this.marks[i] !== ON) continue
        let paired = false
        for (const k of this.nbrs[i]!) {
          if (this.marks[k] === ON) {
            paired = true
            break
          }
        }
        if (paired) continue
        const list: number[] = []
        for (const u of this.nbrs[i]!) {
          if (this.marks[u] !== UNK) continue
          if (!partnerCandidate(u, i)) continue
          list.push(u)
        }
        if (!list.length) return false
        cand.push(list)
      }
      const m = cand.length
      if (m < 2) return true
      const unionSize = (idxs: number[]): number => {
        const set = new Set<number>()
        for (const idx of idxs) for (const u of cand[idx]!) set.add(u)
        return set.size
      }
      for (let a = 0; a < m; a++) {
        for (let b = a + 1; b < m; b++) {
          if (unionSize([a, b]) < 2) return false
        }
      }
      if (m <= 8) {
        for (let a = 0; a < m; a++) {
          for (let b = a + 1; b < m; b++) {
            for (let c = b + 1; c < m; c++) {
              if (unionSize([a, b, c]) < 3) return false
            }
          }
        }
      }
      return true
    }

    if (!hallCheck()) return false

    // 收尾：区域计数矛盾兜底（候选/填满规则已在队列中处理）
    for (let r = 0; r < this.regionTotal; r++) {
      const s = this.regionShaded[r]!
      if (s > 2) return false
      if (s + this.regionUnknown[r]! < 2) return false
    }
    return true
  }

  /**
   * 纯逻辑求解（不搜索）：
   * 1. 前向规则推到饱和；
   * 2. 单格假设检验：对每个未定格分别试"涂黑/涂白"，
   *    哪种假设经前向规则推出矛盾，就取反定掉该格（反证法，仍然 sound）；
   * 3. 有新决定就回到 1，否则饱和。
   * 返回 false 表示当前盘面已矛盾。
   * maxTests 限制假设检验总次数（浏览器里防止长时间卡住）。
   */
  logicSolve(out: Decision[] | null = null, maxTests = Infinity): boolean {
    let tests = 0
    for (;;) {
      if (!this.propagate(out)) return false
      if (this.solvedNow()) return true
      let decided = false
      for (let i = 0; i < this.n; i++) {
        if (this.marks[i] !== UNK) continue
        if (tests >= maxTests) return true // 预算用完：停在这里（调用方按未解处理）
        tests += 2
        const r = this.regionId[i]!
        // 试涂黑
        const snapBlack = this.snapshot()
        this.marks[i] = ON
        this.regionShaded[r]++
        this.regionUnknown[r]--
        const blackOk = this.propagate()
        this.restore(snapBlack)
        if (!blackOk) {
          this.markCell(i, OFF, out, 'hypo-shade')
          decided = true
          continue
        }
        // 试涂白
        const snapWhite = this.snapshot()
        this.marks[i] = OFF
        this.regionUnknown[r]--
        const whiteOk = this.propagate()
        this.restore(snapWhite)
        if (!whiteOk) {
          this.markCell(i, ON, out, 'hypo-forbid')
          decided = true
        }
      }
      if (!decided) return true
    }
  }

  /** 完整解校验（保险） */
  isCompleteSolution(): boolean {
    for (let r = 0; r < this.regionTotal; r++) if (this.regionShaded[r] !== 2) return false
    for (let i = 0; i < this.n; i++) {
      if (this.marks[i] !== ON) continue
      let s = 0
      for (const k of this.nbrs[i]!) if (this.marks[k] === ON) s++
      if (s !== 1) return false
    }
    return true
  }

  /** 当前是否已是完整解（推理饱和 + 全部定格） */
  solvedNow(): boolean {
    return this.allDecided() && this.isCompleteSolution()
  }

  /** 当前 marks 转 GameState（供 UI/校验使用） */
  toGameState(): GameState {
    return {
      puzzleId: this.puzzle.id,
      width: this.w,
      height: this.h,
      cells: Array.from(this.marks, (m) => m as CellState),
    }
  }

  private allDecided(): boolean {
    for (let i = 0; i < this.n; i++) if (this.marks[i] === UNK) return false
    return true
  }

  /**
   * MRV 选格：返回可选值最少的未定格。
   * canShade 需要：区域未满、没有已配对的相邻黑格、且（有未知邻格或已有相邻黑格）。
   * canForbid 需要：区域不是"剩几格就必须全黑"，且不会掐灭某个孤黑格的唯一出路。
   */
  private pickBranchCell(): { index: number; canShade: boolean; canForbid: boolean } | null {
    let best: { index: number; canShade: boolean; canForbid: boolean; score: number } | null = null
    for (let i = 0; i < this.n; i++) {
      if (this.marks[i] !== UNK) continue
      const r = this.regionId[i]!
      const nb = this.nbrs[i]!
      let shadedNbrs = 0
      let lonelyShadedNbrs = 0
      let unknownNbrs = 0
      let onlyPartner = false
      for (const k of nb) {
        const v = this.marks[k]!
        if (v === ON) {
          shadedNbrs++
          let s2 = 0
          for (const kk of this.nbrs[k]!) if (this.marks[kk] === ON) s2++
          if (s2 === 0) lonelyShadedNbrs++
        } else if (v === UNK) {
          unknownNbrs++
        }
      }
      // 是否某条孤黑格的唯一未知邻格
      for (const k of nb) {
        if (this.marks[k] !== ON) continue
        let s2 = 0
        let u2 = 0
        for (const kk of this.nbrs[k]!) {
          const v = this.marks[kk]!
          if (v === ON) s2++
          else if (v === UNK) u2++
        }
        if (s2 === 0 && u2 === 1) {
          onlyPartner = true
          break
        }
      }
      const canShade =
        this.regionShaded[r]! < 2 &&
        shadedNbrs <= 1 &&
        shadedNbrs === lonelyShadedNbrs &&
        (unknownNbrs > 0 || shadedNbrs === 1)
      const canForbid = !(this.regionShaded[r]! + this.regionUnknown[r]! === 2) && !onlyPartner
      const score = (canShade ? 1 : 0) + (canForbid ? 1 : 0)
      if (!best || score < best.score) {
        best = { index: i, canShade, canForbid, score }
        if (score <= 1) break
      }
    }
    if (!best) return null
    return { index: best.index, canShade: best.canShade, canForbid: best.canForbid }
  }

  /** 回溯搜索；limit=1 找到一个即停，limit>=2 统计到 limit 为止 */
  search(limit: number, maxNodes: number): CountResult {
    let nodes = 0
    let timedOut = false
    let count = 0
    let first: GameState | null = null
    let second: GameState | null = null

    const capture = (): GameState => ({
      puzzleId: this.puzzle.id,
      width: this.w,
      height: this.h,
      cells: Array.from(this.marks, (m) => m as CellState),
    })

    const dfs = (): boolean => {
      if (nodes++ > maxNodes) {
        timedOut = true
        return true
      }
      if (count >= limit) return true
      if (!this.propagate()) return false
      if (this.allDecided()) {
        if (this.isCompleteSolution()) {
          count++
          const snap = capture()
          if (!first) first = snap
          else if (!second) second = snap
        }
        return count >= limit
      }
      const pick = this.pickBranchCell()
      if (!pick) return false
      if (!pick.canShade && !pick.canForbid) return false // 两种取值都不可能 → 死路
      const order: CellState[] = []
      if (pick.canShade) order.push(ON)
      if (pick.canForbid) order.push(OFF)
      for (const val of order) {
        const snap = this.snapshot()
        this.marks[pick.index] = val
        const r = this.regionId[pick.index]!
        if (val === ON) this.regionShaded[r]++
        else this.regionUnknown[r]--
        const stop = dfs()
        this.restore(snap)
        if (stop) return true
      }
      return false
    }

    dfs()
    return { count, capped: count >= limit, nodes, timedOut, first, second }
  }
}

/** 求解一道题（找任意一个解） */
export function solvePuzzle(puzzle: Puzzle, maxNodes = 2_000_000): SolveResult {
  const engine = new NorinoriEngine(puzzle)
  const r = engine.search(1, maxNodes)
  return {
    solved: r.count >= 1 && !!r.first,
    solution: r.first,
    nodes: r.nodes,
    timedOut: r.timedOut,
  }
}

/** 统计解的个数（上限 limit，用于唯一性校验） */
export function countSolutions(puzzle: Puzzle, limit = 2, maxNodes = 4_000_000): CountResult {
  const engine = new NorinoriEngine(puzzle)
  return engine.search(limit, maxNodes)
}

/** 从已有进度继续求解（把已定格子作为起点） */
export function solveFromState(
  puzzle: Puzzle,
  cells: CellState[],
  maxNodes = 2_000_000,
): SolveResult {
  const engine = new NorinoriEngine(puzzle, Int8Array.from(cells))
  const r = engine.search(1, maxNodes)
  return {
    solved: r.count >= 1 && !!r.first,
    solution: r.first,
    nodes: r.nodes,
    timedOut: r.timedOut,
  }
}
