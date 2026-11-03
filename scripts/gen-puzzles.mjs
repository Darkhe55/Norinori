/**
 * 内置题库生成器：
 *   随机连续分区 → 求解 → 唯一性校验 → 纯逻辑可解性标注 → 产出 src/puzzles-data.ts
 *
 * 与游戏共用同一份引擎代码（scripts/gen-entry.ts 打包 src/solver|validate|logic）。
 * 运行：node scripts/gen-puzzles.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundleFile = path.join(root, 'temp', 'gen-bundle.cjs')

await build({
  entryPoints: [path.join(root, 'scripts', 'gen-entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundleFile,
  logLevel: 'warning',
})
const { countSolutions, validate, planLogicSolve, randomRegions, mulberry32 } = await import(
  pathToFileURL(bundleFile).href,
)

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const CONFIGS = [
  {
    w: 5,
    h: 5,
    count: 8,
    series: 'easy',
    label: '入门',
    sizes: [
      [2, 3],
      [2, 4],
      [2, 5],
    ],
    maxNodes: 2_000_000,
    attempts: 60_000,
    budgetMs: 120_000,
  },
  {
    w: 6,
    h: 6,
    count: 5,
    series: 'small',
    label: '轻松',
    sizes: [
      [2, 3],
      [2, 4],
      [2, 5],
    ],
    maxNodes: 3_000_000,
    attempts: 60_000,
    budgetMs: 150_000,
  },
  {
    w: 7,
    h: 7,
    count: 5,
    series: 'relax',
    label: '休闲',
    sizes: [
      [2, 4],
      [2, 5],
      [2, 6],
    ],
    maxNodes: 4_000_000,
    attempts: 60_000,
    budgetMs: 180_000,
  },
  {
    w: 10,
    h: 10,
    count: 2,
    series: 'medium',
    label: '进阶',
    sizes: [
      [2, 3],
      [2, 4],
      [2, 5],
      [3, 6],
    ],
    maxNodes: 3_000_000,
    attempts: 60_000,
    budgetMs: 300_000,
  },
]

const all = []
const report = []

for (const cfg of CONFIGS) {
  const rng = mulberry32(0x48415449 + cfg.w * 131 + cfg.h) // "HAITI" 固定种子 → 可复现
  const seen = new Set()
  const found = []
  const started = Date.now()
  let attempts = 0
  let uniqueHits = 0
  let logicHits = 0
  while (found.length < cfg.count && attempts < cfg.attempts && Date.now() - started < cfg.budgetMs) {
    attempts++
    const sizeRange = cfg.sizes[Math.floor(rng() * cfg.sizes.length)]
    const regions = randomRegions(cfg.w, cfg.h, rng, sizeRange[0], sizeRange[1])
    if (!regions) continue
    const key = Array.from(regions).join(',')
    if (seen.has(key)) continue
    seen.add(key)
    const puzzle = {
      id: 'tmp',
      name: 'tmp',
      width: cfg.w,
      height: cfg.h,
      difficulty: 'easy',
      regions: Array.from(regions),
    }
    const r = countSolutions(puzzle, 2, cfg.maxNodes)
    if (r.timedOut) continue
    if (r.count !== 1 || !r.first) continue
    uniqueHits++
    const v = validate(r.first, puzzle)
    if (!v.solved) {
      console.error(`[gen] 求解器自校验失败：${key}`)
      continue
    }
    const plan = planLogicSolve(puzzle, new Array(cfg.w * cfg.h).fill(0), Infinity)
    const logic = plan.solved === true
    if (logic) logicHits++
    const area = cfg.w * cfg.h
    const difficulty = logic ? (area <= 49 ? 'easy' : 'medium') : r.nodes < 50_000 ? 'medium' : 'hard'
    const letter = LETTERS[found.length] ?? String(found.length)
    found.push({
      id: `${cfg.series}-${cfg.w}x${cfg.h}-${letter}`,
      name: `${cfg.label} · ${cfg.w}×${cfg.h} ${letter}`,
      width: cfg.w,
      height: cfg.h,
      difficulty,
      series: cfg.series,
      regions: key,
      sol: Array.from(r.first.cells, (c) => String(c)).join(''),
      logic,
    })
    if (found.length % 2 === 0 || found.length === cfg.count) {
      console.log(
        `[gen] ${cfg.w}x${cfg.h}: ${found.length}/${cfg.count}（尝试 ${attempts} 次，唯一 ${uniqueHits}，纯逻辑 ${logicHits}，${Date.now() - started}ms）`,
      )
    }
  }
  report.push({ size: `${cfg.w}x${cfg.h}`, found: found.length, target: cfg.count, attempts, uniqueHits, logicHits })
  all.push(...found)
}

// —— 输出 src/puzzles-data.ts ——
const lines = []
lines.push('/* 自动生成，勿手改。scripts/gen-puzzles.mjs（node scripts/gen-puzzles.mjs 重新生成） */')
lines.push('export type RawPuzzle = {')
lines.push('  id: string')
lines.push('  name: string')
lines.push('  width: number')
lines.push('  height: number')
lines.push("  difficulty: 'easy' | 'medium' | 'hard' | 'custom'")
lines.push('  series: string')
lines.push('  /** 逗号分隔的区域编号，长度 = width*height */')
lines.push('  regions: string')
lines.push('  /** 参考解：每格 0=未定 1=黑 2=白，长度 = width*height */')
lines.push('  sol: string')
lines.push('  /** 纯逻辑规则（不搜索）可解 */')
lines.push('  logic: boolean')
lines.push('}')
lines.push('')
lines.push('export const RAW_PUZZLES: RawPuzzle[] = [')
for (const p of all) {
  lines.push(
    `  { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, width: ${p.width}, height: ${p.height}, difficulty: ${JSON.stringify(p.difficulty)}, series: ${JSON.stringify(p.series)}, regions: ${JSON.stringify(p.regions)}, sol: ${JSON.stringify(p.sol)}, logic: ${p.logic} },`,
  )
}
lines.push(']')
lines.push('')

const outFile = path.join(root, 'src', 'puzzles-data.ts')
fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

console.log('\n[gen] 汇总：')
for (const r of report) {
  console.log(
    `  ${r.size}: ${r.found}/${r.target} 题（尝试 ${r.attempts}，唯一解命中 ${r.uniqueHits}，纯逻辑 ${r.logicHits}）`,
  )
}
console.log(`[gen] 共 ${all.length} 题 → ${outFile}`)
if (all.length === 0) {
  console.error('[gen] 一道题都没生成出来，请检查参数')
  process.exit(1)
}
