/**
 * 识图导入命令行工具：
 *   node scripts/import-image.mjs <图片.png> [--name 名称] [--id ID] [--select] [--dry-run] [--force]
 *
 * 流程：PNG 解码 → src/vision.ts 识别区域 → 校验区域/解 → 写入 data/library.json。
 * `--select` 同时把新题设为「上次题目」，下次打开网页直接载入。
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
    '\n用法：node scripts/import-image.mjs <图片.png> [--name 名称] [--id ID] [--select] [--dry-run] [--force]',
  )
  process.exit(1)
}

function parseArgs(argv) {
  const out = { file: null, name: null, id: null, select: false, dryRun: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--name') out.name = argv[++i]
    else if (a === '--id') out.id = argv[++i]
    else if (a === '--select') out.select = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--force') out.force = true
    else if (a.startsWith('--')) usage(`未知参数 ${a}`)
    else if (!out.file) out.file = a
    else usage(`多余参数 ${a}`)
  }
  if (!out.file) usage('请指定图片路径')
  return out
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
console.log('[import] 区域大小：' + d.regionSizes.join(','))
for (const w of result.warnings) console.warn(`[import] 警告：${w}`)

const tooSmall = d.regionSizes.filter((s) => s < 2).length
if (tooSmall && !args.force) {
  console.error(
    `[import] 有 ${tooSmall} 个区域少于 2 格，题目无法成立。确认无误可加 --force 强制导入。`,
  )
  process.exit(1)
}

const puzzle = {
  id: args.id || `import-${Date.now()}`,
  name: args.name || '',
  width: result.width,
  height: result.height,
  difficulty: 'custom',
  regions: result.regions,
}

const area = result.width * result.height
const budget = area > 400 ? 6_000_000 : area > 100 ? 3_000_000 : 1_500_000
const check = countSolutions(puzzle, 2, budget)
if (check.timedOut) {
  console.warn('[import] 警告：解数校验超时，无法确认是否有解。')
} else if (check.count === 0) {
  if (!args.force) {
    console.error('[import] 识别结果无解，已中止。请检查题图或加 --force 强制导入。')
    process.exit(1)
  }
  console.warn('[import] 警告：识别结果无解，仍按 --force 导入。')
} else {
  console.log(
    `[import] 解数校验：${check.count >= 2 ? '多个解' : '唯一解'}（搜索 ${check.nodes} 节点）`,
  )
}

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
if (!puzzle.name) {
  puzzle.name = `识图导入 · ${puzzle.width}×${puzzle.height} · ${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

const entry = {
  id: puzzle.id,
  name: puzzle.name,
  width: puzzle.width,
  height: puzzle.height,
  difficulty: 'custom',
  regions: puzzle.regions.join(','),
  savedAt: Date.now(),
}

let library = []
try {
  const raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'))
  if (Array.isArray(raw)) library = raw
} catch {
  /* 文件不存在或是空 → 从空题库开始 */
}

const dup = library.findIndex((x) => x && x.id === entry.id)
if (dup >= 0) library[dup] = entry
else library.push(entry)

if (args.dryRun) {
  console.log(
    `[import] --dry-run：识别成功，未写入。id=${entry.id} name=${entry.name} regions=${entry.regions.length} 字符`,
  )
  process.exit(0)
}

fs.mkdirSync(DATA_DIR, { recursive: true })
const tmp = LIBRARY_FILE + '.tmp'
fs.writeFileSync(tmp, JSON.stringify(library, null, 2) + '\n', 'utf8')
fs.renameSync(tmp, LIBRARY_FILE)

if (args.select) {
  const lastTmp = LAST_FILE + '.tmp'
  fs.writeFileSync(lastTmp, JSON.stringify(entry.id) + '\n', 'utf8')
  fs.renameSync(lastTmp, LAST_FILE)
}

console.log(`[import] 已写入题库：${entry.name}`)
console.log(`[import] id=${entry.id}  ${entry.width}×${entry.height}  共 ${library.length} 道自定义题`)
if (args.select) console.log('[import] 已设为下次打开时载入的题目')
