/**
 * 解题器冒烟测试（开发期工具，不影响游戏）：
 *   node scripts/run-solver-test.mjs
 * 用 esbuild 把 TS 源码打包成临时 CJS 后直接跑。
 */
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'temp', 'solver-test.cjs')

await build({
  entryPoints: [path.join(root, 'scripts', 'solver-test.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: out,
  logLevel: 'warning',
})
await import(pathToFileURL(out).href)
