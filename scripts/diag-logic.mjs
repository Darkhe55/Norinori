/**
 * 逻辑解题诊断（开发期工具）：
 *   对 src/puzzles-data.ts 里的每道内置题跑纯逻辑推理，
 *   报告推出多少格、卡在什么地方、命中哪些规则。
 *   node scripts/diag-logic.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundleFile = path.join(root, 'temp', 'diag-bundle.cjs')

await build({
  entryPoints: [path.join(root, 'scripts', 'diag-entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundleFile,
  logLevel: 'warning',
})
const { puzzles, planLogicSolve, countSolutions } = await import(pathToFileURL(bundleFile).href)

for (const p of puzzles) {
  const n = p.width * p.height
  const plan = planLogicSolve(p, new Array(n).fill(0))
  const rules = {}
  for (const f of plan.frames) rules[f.rule] = (rules[f.rule] ?? 0) + 1
  // 还差多少格没定
  const decided = plan.frames.length
  const r = countSolutions(p, 2, 2_000_000)
  console.log(
    `${p.id} (${p.width}x${p.height}): 逻辑推出 ${decided}/${n} 格，solved=${plan.solved}，唯一解=${r.count === 1}，规则=${JSON.stringify(rules)}`,
  )
  if (!plan.solved && p.width === 5) {
    // 打印盘面：区域编号 + 逻辑推不出剩下的格
    const st = plan.finalState
    if (st) {
      for (let cy = 0; cy < p.height; cy++) {
        let row = ''
        for (let cx = 0; cx < p.width; cx++) {
          const i = cy * p.width + cx
          const v = st.cells[i]
          row += v === 1 ? '█' : v === 2 ? '·' : '?'
          row += ' '
        }
        console.log('    ' + row)
      }
    }
  }
}
