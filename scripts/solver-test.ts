import { solvePuzzle, countSolutions, NorinoriEngine } from '../src/solver'
import { validate } from '../src/validate'
import { planLogicSolve } from '../src/logic'
import type { CellState, GameState, Puzzle } from '../src/types'
import { CellState as CS } from '../src/types'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  const tag = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`[${tag}] ${name}${extra ? ' — ' + extra : ''}`)
}

function mk(id: string, w: number, h: number, regions: number[]): Puzzle {
  return { id, name: id, width: w, height: h, regions, difficulty: 'easy' }
}

/** 确定性随机数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 暴力枚举：每格 黑/白 两种，叶子处整盘校验 → 精确解数 */
function bruteCount(p: Puzzle): number {
  const n = p.width * p.height
  const cells: CellState[] = new Array(n).fill(CS.Forbidden)
  let count = 0
  const rec = (i: number): void => {
    if (i === n) {
      const st: GameState = { puzzleId: p.id, width: p.width, height: p.height, cells: cells.slice() }
      if (validate(st, p).solved) count++
      return
    }
    cells[i] = CS.Shaded
    rec(i + 1)
    cells[i] = CS.Forbidden
    rec(i + 1)
  }
  rec(0)
  return count
}

// —— 用例 1：2×2 单区域 → 恰有 4 个解 ——
{
  const p = mk('t1', 2, 2, [0, 0, 0, 0])
  const r = countSolutions(p, 10, 100_000)
  check('2×2 单区解数=4', r.count === 4, `count=${r.count}`)
}

// —— 用例 2：2×2 按行分两区 → 无解（全黑导致粘连）——
{
  const p = mk('t2', 2, 2, [0, 0, 1, 1])
  check('2×2 行分区无解', countSolutions(p, 5, 100_000).count === 0)
}

// —— 用例 3：2×2 含 1 格小区 → 无解 ——
{
  const p = mk('t3', 2, 2, [0, 1, 1, 1])
  check('含单格区域无解', countSolutions(p, 5, 100_000).count === 0)
}

// —— 用例 4：暴力交叉验证（随机区域布局 × 多种尺寸）——
{
  const rand = rng(20261020)
  const sizes: Array<[number, number]> = [
    [2, 2],
    [3, 2],
    [2, 3],
    [3, 3],
    [4, 2],
    [2, 4],
    [4, 3],
    [3, 4],
    [4, 4],
  ]
  let mismatches = 0
  let total = 0
  let uniqueFound = 0
  for (const [w, h] of sizes) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const n = w * h
      // 随机区域编号（允许不相邻也无所谓，只测求解器正确性）
      const maxR = Math.max(1, Math.floor(n / 2))
      const regions: number[] = []
      for (let i = 0; i < n; i++) regions.push(Math.floor(rand() * maxR))
      const p = mk(`x-${w}x${h}-${attempt}`, w, h, regions)
      const brute = bruteCount(p)
      const eng = countSolutions(p, 60, 2_000_000)
      total++
      if (brute === 1) uniqueFound++
      if (eng.count !== brute || eng.timedOut) {
        mismatches++
        console.log(
          `  MISMATCH ${w}x${h} regions=[${regions}] engine=${eng.count} brute=${brute} timedOut=${eng.timedOut}`,
        )
      }
      const solved = solvePuzzle(p, 2_000_000).solved
      if (solved !== (brute > 0)) {
        mismatches++
        console.log(`  SOLVE-FLAG MISMATCH ${w}x${h} regions=[${regions}] solved=${solved} brute=${brute}`)
      }
      if (brute > 0 && solved) {
        const sol = solvePuzzle(p, 2_000_000).solution!
        if (!validate(sol, p).solved) {
          mismatches++
          console.log(`  INVALID SOLUTION ${w}x${h} regions=[${regions}]`)
        }
      }
    }
  }
  check(`暴力交叉验证 ${total} 题全部一致`, mismatches === 0, `mismatches=${mismatches} 唯一解题数=${uniqueFound}`)
}

// —— 用例 5：找到一道真正唯一的 5×5，并验证 ——
{
  const rand = rng(777)
  let found: Puzzle | null = null
  let solCount = 0
  for (let attempt = 0; attempt < 4000 && !found; attempt++) {
    const w = 5
    const h = 5
    const regions: number[] = []
    // 连续区域（随机游走生长），保证每区 size>=2
    const id = new Int32Array(25).fill(-1)
    let next = 0
    for (let i = 0; i < 25; i++) {
      if (id[i] !== -1) continue
      const target = 2 + Math.floor(rand() * 3)
      const stack = [i]
      id[i] = next
      let size = 1
      while (size < target) {
        const cands: number[] = []
        for (let c = 0; c < 25; c++) {
          if (id[c] !== -1) continue
          const cx = c % w
          const cy = (c / w) | 0
          const touch =
            (cx > 0 && id[c - 1] === next) ||
            (cx < w - 1 && id[c + 1] === next) ||
            (cy > 0 && id[c - w] === next) ||
            (cy < h - 1 && id[c + w] === next)
          if (touch) cands.push(c)
        }
        if (!cands.length) break
        const pick = cands[Math.floor(rand() * cands.length)]!
        id[pick] = next
        size++
      }
      if (size < 2) {
        // 单格区回退成邻区
        const cx = i % w
        const cy = (i / w) | 0
        const nb = [
          cx > 0 ? i - 1 : -1,
          cx < w - 1 ? i + 1 : -1,
          cy > 0 ? i - w : -1,
          cy < h - 1 ? i + w : -1,
        ].filter((k) => k >= 0 && id[k] !== -1 && id[k] !== next)
        if (nb.length) id[i] = id[nb[0]!]
        else id[i] = next
      }
      next++
    }
    regions.length = 0
    for (let i = 0; i < 25; i++) regions.push(id[i]!)
    // 压缩编号
    const map = new Map<number, number>()
    const compact = regions.map((r) => {
      if (!map.has(r)) map.set(r, map.size)
      return map.get(r)!
    })
    const p = mk('u5', w, h, compact)
    const r = countSolutions(p, 3, 3_000_000)
    if (r.count === 1 && !r.timedOut) {
      found = p
      solCount = 1
    }
  }
  check('找到唯一解 5×5 题', !!found, solCount ? '' : '4000 次尝试内未找到')
  if (found) {
    const v = validate(countSolutions(found, 2, 3_000_000).first!, found)
    check('唯一解合法', v.solved)
  }
}

// —— 用例 6：从部分进度继续求解 ——
{
  const p = mk('t6', 3, 3, [0, 0, 0, 0, 0, 1, 1, 1, 1])
  const r = solvePuzzle(p, 200_000)
  check('进度续解有解', r.solved)
  if (r.solution) {
    check('进度续解合法', validate(r.solution, p).solved)
  }
}

// —— 用例 7：空盘传播不炸 ——
{
  const p = mk('t7', 5, 5, [0, 0, 1, 1, 2, 0, 0, 1, 2, 2, 3, 3, 4, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5])
  const eng = new NorinoriEngine(p)
  check('空盘传播不矛盾', eng.propagate())
}

// —— 用例 8：逻辑回放计划自洽（帧逐步应用 = 终态；解出则终态合法）——
{
  const rand2 = rng(4242)
  let checked = 0
  let solvedCount = 0
  let bad = 0
  for (let attempt = 0; attempt < 300; attempt++) {
    const w = 5
    const h = 5
    const id = new Int32Array(25).fill(-1)
    let next = 0
    for (let i = 0; i < 25; i++) {
      if (id[i] !== -1) continue
      const target = 2 + Math.floor(rand2() * 3)
      id[i] = next
      let size = 1
      while (size < target) {
        const cands: number[] = []
        for (let c = 0; c < 25; c++) {
          if (id[c] !== -1) continue
          const cx = c % w
          const cy = (c / w) | 0
          const touch =
            (cx > 0 && id[c - 1] === next) ||
            (cx < w - 1 && id[c + 1] === next) ||
            (cy > 0 && id[c - w] === next) ||
            (cy < h - 1 && id[c + w] === next)
          if (touch) cands.push(c)
        }
        if (!cands.length) break
        id[cands[Math.floor(rand2() * cands.length)]!] = next
        size++
      }
      if (size < 2) {
        const cx = i % w
        const cy = (i / w) | 0
        const nb = [
          cx > 0 ? i - 1 : -1,
          cx < w - 1 ? i + 1 : -1,
          cy > 0 ? i - w : -1,
          cy < h - 1 ? i + w : -1,
        ].filter((k) => k >= 0 && id[k] !== -1 && id[k] !== next)
        id[i] = nb.length ? id[nb[0]!] : next
      }
      next++
    }
    const map = new Map<number, number>()
    const regions: number[] = []
    for (let i = 0; i < 25; i++) {
      const r = id[i]!
      if (!map.has(r)) map.set(r, map.size)
      regions.push(map.get(r)!)
    }
    const p = mk(`lg-${attempt}`, w, h, regions)
    const r = countSolutions(p, 2, 3_000_000)
    if (r.count !== 1 || r.timedOut) continue
    checked++
    const start: CellState[] = new Array(25).fill(CS.Unknown)
    const plan = planLogicSolve(p, start)
    // 逐步应用帧
    const work = start.slice()
    for (const f of plan.frames) work[f.change.index] = f.change.to
    if (plan.finalState) {
      for (let i = 0; i < 25; i++) if (work[i] !== plan.finalState.cells[i]) bad++
    }
    if (plan.solved) {
      solvedCount++
      const st: GameState = { puzzleId: p.id, width: w, height: h, cells: work }
      if (!validate(st, p).solved) bad++
    }
  }
  check(`逻辑回放自洽 ${checked} 道唯一题`, bad === 0, `bad=${bad} 纯逻辑解出=${solvedCount}/${checked}`)
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
