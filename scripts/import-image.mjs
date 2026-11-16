/**
 * 海苔（Norinori）识图导入命令行工具。
 *
 * 用法：
 *   node scripts/import-image.mjs <图片.png> [选项]
 *
 * 选项：
 *   --name 名称        题库里的名称（默认「识图导入 · 宽×高 · 日期」
 *   --id ID            指定题目 id（默认 import-时间戳）
 *   --append           真正写入 data/library.json；不加只预览、不写盘
 *   --verify           额外做唯一解校验（默认只识别，不解题，速度快）
 *   --select           写入后设为「下次打开时载入的题目」（隐含 --append）
 *   --map x,y=区域号   人工修正：把格子 (x,y)（0 基）指定到某个区域号。
 *                      多个修正用分号分隔、可重复，如 --map "3,7=2;4,7=2"；
 *                      指定未出现过的新区域号即可把格子从原区域拆出来。
 *   --max-nodes N      解题搜索节点上限（默认按盘面大小 1.5M/6M/12M）
 *   --skip-solve       跳过解题校验（只做区域检查，适合超大/无解题图）
 *   --force            区域过小或无解时仍然导入
 *   --dry-run          兼容旧参数，等同于不加 --append
 *
 * 流程：PNG 解码 → src/vision.ts 识别区域（与网页「识图导入」同一份代码）
 *      → --map 人工修正 → 区域检查 → 预览 → （可选）解题校验 → --append 写题库。
 */

import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { decodePng } from './png-decode.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(root, 'data')
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json')
const LAST_FILE = path.join(DATA_DIR, 'last-puzzle.json')

function usage(msg) {
  if (msg) console.error(`\n[import] ${msg}`)
  console.error(
    `\n用法：node scripts/import-image.mjs <图片.png> [--name 名称] [--id ID] [--append] [--verify]
      [--select] [--json] [--map x,y=区域号] [--max-nodes N] [--skip-solve] [--force]

  不加 --append 只预览识别结果；加 --append 才写入 data/library.json；--json 输出机器可读结果。
  --map 例：--map "3,7=2,4,7=2"（0 基坐标，把格子并到区域 2）。
  --verify 会额外校验唯一解；--select 写入后设为下次载入的题目。`,
  )
  process.exit(1)
}

function parseArgs(argv) {
  const out = {
    file: null,
    name: null,
    id: null,
    append: false,
    verify: false,
    select: false,
    force: false,
    skipSolve: false,
    maxNodes: 0,
    json: false,
    maps: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) usage(`参数 ${a} 缺少值`)
      return v
    }
    if (a === '--name') out.name = next()
    else if (a === '--id') out.id = next()
    else if (a === '--append') out.append = true
    else if (a === '--verify') out.verify = true
    else if (a === '--select') {
      out.select = true
      out.append = true
    } else if (a === '--force') out.force = true
    else if (a === '--skip-solve') out.skipSolve = true
    else if (a === '--json') out.json = true
    else if (a === '--dry-run' || a === '--dry') {
      /* 兼容旧参数：预览本来就是默认行为 */
    } else if (a === '--max-nodes') out.maxNodes = Number(next()) || 0
    else if (a === '--map') {
      for (const token of next().split(/[;；]+/)) if (token.trim()) out.maps.push(token.trim())
    } else if (a.startsWith('--')) usage(`未知参数 ${a}`)
    else if (!out.file) out.file = a
    else usage(`多余参数 ${a}`)
  }
  if (!out.file) usage('请指定图片路径')
  if (out.maxNodes && (!Number.isInteger(out.maxNodes) || out.maxNodes < 1000)) {
    usage('--max-nodes 需要是 ≥ 1000 的整数')
  }
  return out
}

/** 把 "x,y=区域号" 解析成 {index, region}；坐标 0 基 */
function parseMaps(tokens, cols, rows) {
  const overrides = []
  for (const token of tokens) {
    const m = /^(\d+)\s*,\s*(\d+)\s*=\s*(-?\d+)$/.exec(token)
    if (!m) usage(`--map 格式应为 x,y=区域号，收到「${token}」`)
    const x = Number(m[1])
    const y = Number(m[2])
    const region = Number(m[3])
    if (x < 0 || y < 0 || x >= cols || y >= rows) {
      usage(`--map 坐标 (${x},${y}) 超出 ${cols}×${rows} 题板`)
    }
    if (region < 0) usage('--map 的区域号不能为负')
    overrides.push({ index: y * cols + x, region })
  }
  return overrides
}

/** 应用人工修正后按「首次出现顺序」重新编号，保证区域号 0..k-1 连续 */
function renumber(regions) {
  const remap = new Map()
  const out = regions.slice()
  for (let i = 0; i < out.length; i++) {
    const raw = out[i]
    let id = remap.get(raw)
    if (id === undefined) {
      id = remap.size
      remap.set(raw, id)
    }
    out[i] = id
  }
  return { regions: out, regionCount: remap.size }
}

function regionSizesOf(regions, count) {
  const sizes = new Array(count).fill(0)
  for (const r of regions) sizes[r]++
  return sizes
}

const args = parseArgs(process.argv.slice(2))
const imagePath = path.resolve(process.cwd(), args.file)
if (!fs.existsSync(imagePath)) usage(`找不到图片：${imagePath}`)

const bundleFile = path.join(root, 'temp', 'vision-bundle.cjs')
await build({
  entryPoints: [path.join(root, 'scripts', 'vision-entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundleFile,
  logLevel: 'warning',
})
const { recognizePuzzle, countSolutions } = await import(pathToFileURL(bundleFile).href)

const image = decodePng(fs.readFileSync(imagePath))
console.log(`[import] 图片：${path.basename(imagePath)} ${image.width}×${image.height}`)

const result = recognizePuzzle(image)
const d = result.diagnostics
console.log(
  `[import] 识别：${result.width}×${result.height}，${d.regionCount} 个区域，` +
    `细线 ${d.thinWidth}px / 粗线 ${d.thickWidth}px（阈值 ${d.borderThreshold}）`,
)
for (const w of result.warnings) console.warn(`[import] 警告：${w}`)

// —— 人工修正 ——
let regions = result.regions
let regionCount = d.regionCount
if (args.maps.length) {
  for (const { index, region } of parseMaps(args.maps, result.width, result.height)) {
    if (!args.force && regions[index] !== region) {
      console.log(
        `[import] --map：格子 (${index % result.width},${Math.floor(index / result.width)}) ` +
          `区域 ${regions[index]} → ${region}`,
      )
    }
    regions[index] = region
  }
  const normalized = renumber(regions)
  regions = normalized.regions
  regionCount = normalized.regionCount
  console.log(`[import] 人工修正后：${regionCount} 个区域`)
}

const regionSizes = regionSizesOf(regions, regionCount)
const minSize = regionCount ? Math.min(...regionSizes) : 0
const maxSize = regionCount ? Math.max(...regionSizes) : 0
console.log(
  `[import] 区域大小：${minSize}–${maxSize} 格（共 ${regionCount} 个区域，` +
    `${regionSizes.filter((s) => s === 2).length} 个两格区域）`,
)

if (regionCount < 2) {
  const msg = '只识别出 1 个区域，可能是粗区域线没识别出来'
  if (!args.force) {
    console.error(`[import] ${msg}。请检查题图，或用 --map 手动指定区域，或加 --force 强制处理。`)
    process.exit(1)
  }
  console.warn(`[import] 警告：${msg}，按 --force 继续`)
}
const tooSmall = regionSizes.filter((s) => s < 2).length
if (tooSmall && !args.force) {
  console.error(`[import] 有 ${tooSmall} 个区域少于 2 格，题目无法成立。确认无误可加 --force。`)
  process.exit(1)
}

// —— 预览 ——
const cellText = (r) => String(r).padStart(2, '0')
if (!args.json) {
  console.log(`[import] 区域矩阵（${result.width}×${result.height}，行优先）：`)
  for (let y = 0; y < result.height; y++) {
    const row = regions.slice(y * result.width, y * result.width + result.width)
    console.log(row.map(cellText).join(' '))
  }
}

// —— 解题校验 ——
// 海苔搜索器按格搜索，50×50 这类大盘面几分钟都跑不完；默认只在中小盘面校验，
// 需要时可以显式加 --verify（或调 --max-nodes）自己承担耗时。
let check = null
const area = result.width * result.height
const autoSkip = area > 900 && !args.verify
if (args.skipSolve || autoSkip) {
  if (autoSkip) {
    console.log(
      `[import] ${result.width}×${result.height} 盘面较大，默认跳过解题校验（加 --verify 可强制执行）。`,
    )
  }
} else {
  const budget =
    args.maxNodes || (area > 2500 ? 12_000_000 : area > 400 ? 6_000_000 : 1_500_000)
  const limit = args.verify ? 2 : 1
  const puzzleForCheck = {
    id: 'preview',
    name: 'preview',
    width: result.width,
    height: result.height,
    difficulty: 'custom',
    regions,
  }
  console.log(
    `[import] ${args.verify ? '唯一解校验' : '解题校验'}中（上限 ${budget.toLocaleString()} 节点）…`,
  )
  const t0 = Date.now()
  check = countSolutions(puzzleForCheck, limit, budget)
  const use = Date.now() - t0
  if (check.timedOut) {
    console.warn(`[import] 警告：解题搜索超时（${use}ms，${check.nodes} 节点），解数未知`)
  } else if (check.count === 0) {
    console.error(`[import] 识别结果无解（${use}ms，${check.nodes} 节点）。`)
    if (!args.force) process.exit(1)
    console.warn('[import] 警告：按 --force 继续')
  } else if (args.verify && check.count >= 2) {
    console.error(`[import] 解不唯一（至少 ${check.count} 个，${use}ms，${check.nodes} 节点）。`)
    if (!args.force) process.exit(1)
    console.warn('[import] 警告：按 --force 继续')
  } else {
    console.log(
      `[import] ${args.verify ? '唯一解 ✓' : '有解 ✓'}（${use}ms，${check.nodes} 节点）`,
    )
  }
}

if (!args.append) {
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          width: result.width,
          height: result.height,
          regionCount,
          regionSizes,
          regions: regions.join(','),
          warnings: result.warnings,
          solve: check
            ? { count: check.count, timedOut: check.timedOut, nodes: check.nodes }
            : null,
        },
        null,
        2,
      ),
    )
  } else {
    console.log('[import] 预览模式，未写入题库。加 --append 写入 data/library.json。')
  }
  process.exit(0)
}

// —— 写题库 ——
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const name =
  args.name ||
  `识图导入 · ${result.width}×${result.height} · ${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`
const entry = {
  id: args.id || `import-${Date.now()}`,
  name,
  width: result.width,
  height: result.height,
  difficulty: 'custom',
  regions: regions.join(','),
  savedAt: Date.now(),
}

let library = []
try {
  const raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'))
  if (Array.isArray(raw)) library = raw
} catch {
  /* 题库不存在或为空 → 从空题库开始 */
}
const dup = library.findIndex((x) => x && x.id === entry.id)
if (dup >= 0) library[dup] = entry
else library.push(entry)

fs.mkdirSync(DATA_DIR, { recursive: true })
const tmp = LIBRARY_FILE + '.tmp'
fs.writeFileSync(tmp, JSON.stringify(library, null, 2) + '\n', 'utf8')
fs.renameSync(tmp, LIBRARY_FILE)

if (args.json) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        id: entry.id,
        name: entry.name,
        width: entry.width,
        height: entry.height,
        regionCount,
        written: 'data/library.json',
        librarySize: library.length,
        solve: check
          ? { count: check.count, timedOut: check.timedOut, nodes: check.nodes }
          : null,
      },
      null,
      2,
    ),
  )
}
if (!args.json) {
  console.log(`[import] 已写入 data/library.json：${entry.name}`)
  console.log(
    `[import] id=${entry.id}  ${entry.width}×${entry.height}  ${regionCount} 个区域  ` +
      `共 ${library.length} 道自定义题`,
  )
}
if (args.select) {
  const lastTmp = LAST_FILE + '.tmp'
  fs.writeFileSync(lastTmp, JSON.stringify(entry.id) + '\n', 'utf8')
  fs.renameSync(lastTmp, LAST_FILE)
  if (!args.json) console.log('[import] 已设为下次打开时载入的题目')
}




