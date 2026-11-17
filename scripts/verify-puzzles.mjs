/**
 * 内置题库复核（开发期工具）：
 *   从 src/puzzles.ts 读取出厂数据，逐题验证：
 *   - 区域编号合法、每区 ≥2 格、每区连通；
 *   - 解唯一（countSolutions === 1）；
 *   - 出厂参考解通过 validate，且与求解器首个解一致；
 *   - logic 标注与 planLogicSolve 实情一致。
 *   node scripts/verify-puzzles.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundleFile = path.join(root, 'temp', 'verify-bundle.cjs')

await build({
  entryPoints: [path.join(root, 'scripts', 'diag-entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundleFile,
  logLevel: 'warning',
})
const { puzzles, getReferenceSolution, RAW_PUZZLES, countSolutions, planLogicSolve, validate } =
  await import(pathToFileURL(bundleFile).href)
const rawList = RAW_PUZZLES
const validateRef = validate

let failures = 0
let logicFrames = 0
let logicHypo = 0
let logicSolved = 0
let searchNodes = 0
const fail = (msg) => {
  failures++
  console.error(`  [FAIL] ${msg}`)
}

console.log(`[verify] 共 ${puzzles.length} 道内置题`)

for (const p of puzzles) {
  const n = p.width * p.height
  const problems = []

  // 区域编号合法
  if (p.regions.length !== n) problems.push(`regions 长度 ${p.regions.length} != ${n}`)
  const maxId = Math.max(...p.regions)
  const minId = Math.min(...p.regions)
  if (minId !== 0) problems.push(`区域编号未从 0 开始（min=${minId}）`)
  const counts = new Array(maxId + 1).fill(0)
  for (const r of p.regions) counts[r]++
  for (let r = 0; r <= maxId; r++) {
    if (counts[r] < 2) problems.push(`区域 ${r} 只有 ${counts[r]} 格`)
  }
  // 连通性
  for (let r = 0; r <= maxId; r++) {
    const cells = []
    for (let i = 0; i < n; i++) if (p.regions[i] === r) cells.push(i)
    const seen = new Set([cells[0]])
    const stack = [cells[0]]
    while (stack.length) {
      const cur = stack.pop()
      const cx = cur % p.width
      const cy = (cur / p.width) | 0
      for (const k of [
        cx > 0 ? cur - 1 : -1,
        cx < p.width - 1 ? cur + 1 : -1,
        cy > 0 ? cur - p.width : -1,
        cy < p.height - 1 ? cur + p.width : -1,
      ]) {
        if (k >= 0 && p.regions[k] === r && !seen.has(k)) {
          seen.add(k)
          stack.push(k)
        }
      }
    }
    if (seen.size !== cells.length) problems.push(`区域 ${r} 不连通`)
  }

  // 唯一解
  const r = countSolutions(p, 2, 4_000_000)
  if (r.timedOut) problems.push('唯一性校验超时')
  if (r.count !== 1) problems.push(`解不唯一（count=${r.count}）`)

  // 出厂参考解
  const sol = getReferenceSolution(p.id)
  if (!sol) {
    problems.push('缺少出厂参考解')
  } else {
    if (sol.cells.length !== n) problems.push('参考解长度不对')
    const v = validateRef(sol, p)
    if (!v.solved) problems.push(`参考解不合法：${JSON.stringify(v.badRegions)}${JSON.stringify(v.badDominoes)}`)
    if (r.first) {
      for (let i = 0; i < n; i++) {
        if (r.first.cells[i] !== sol.cells[i]) {
          problems.push('参考解与求解器首个解不一致')
          break
        }
      }
    }
  }

  // logic 标注
  const plan = planLogicSolve(p, new Array(n).fill(0), Infinity)
  const raw = rawList.find((x) => x.id === p.id)
  if (raw && raw.logic !== plan.solved) {
    problems.push(`logic 标注 ${raw.logic} 与实情 ${plan.solved} 不符`)
  }
  const hypo = plan.frames.filter((f) => f.rule === 'hypo-shade' || f.rule === 'hypo-forbid').length
  logicFrames += plan.frames.length
  logicHypo += hypo
  if (plan.solved) logicSolved++
  searchNodes += r.nodes

  if (problems.length) {
    fail(`${p.id}: ${problems.join('；')}`)
  } else {
    console.log(
      `  [OK] ${p.id} ${p.width}x${p.height} ${p.difficulty} logic=${plan.solved}` +
        ` · 逻辑 ${plan.frames.length} 帧（反证 ${hypo}）· 搜索 ${r.nodes} 节点`,
    )
  }
}
console.log(
  `[verify] 汇总：纯逻辑解出 ${logicSolved}/${puzzles.length} · 逻辑 ${logicFrames} 帧（反证 ${logicHypo}）` +
    ` · 唯一解搜索合计 ${searchNodes} 节点`,
)

if (failures) {
  console.error(`[verify] ${failures} 道题有问题`)
  process.exit(1)
}
console.log('[verify] 全部通过')
