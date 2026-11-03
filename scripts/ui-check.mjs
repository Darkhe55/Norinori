/**
 * UI 交互验证（端口 5178）：
 * 启动 → 载题 → 涂格 → 右键涂白 → 拖拽涂刷 → 显示解 → 逻辑回放 → 自定义题板 → 键盘 → 缩放
 * 每步截图到 output/playwright/，任何 pageerror/console error 都算失败。
 *   node scripts/ui-check.mjs
 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'
import fs from 'node:fs'

const GAME_URL = 'http://127.0.0.1:5178/'
const ROOT = profileDir('ui-check')
fs.rmSync(ROOT, { recursive: true, force: true })
fs.mkdirSync(ROOT, { recursive: true })
const SHOTS = new URL('../output/playwright/', import.meta.url)
fs.mkdirSync(SHOTS, { recursive: true })

const ctx = await chromium.launchPersistentContext(ROOT, {
  headless: false,
  executablePath: edgePath(),
  viewport: { width: 1440, height: 960 },
})

let failures = 0
const errors = []
const check = (name, cond, extra = '') => {
  const tag = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`[${tag}] ${name}${extra ? ' — ' + extra : ''}`)
}

const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('CONSOLE ' + m.text()))
page.on('requestfailed', (r) => errors.push('REQFAILED ' + r.url()))

async function shot(name) {
  await page.screenshot({ path: new URL(name, SHOTS).pathname.replace(/^\/([a-zA-Z]:)/, '$1') })
}

async function cellCenter(index) {
  return page.evaluate((i) => {
    const el = document.querySelector(`.cell-hit[data-index="${i}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, index)
}

const sessionState = () => page.evaluate(() => window.__haitai.getSession()?.state.cells ?? null)
const sessionPuzzle = () =>
  page.evaluate(() => {
    const s = window.__haitai.getSession()
    return s ? { id: s.puzzle.id, w: s.puzzle.width, h: s.puzzle.height, regions: s.puzzle.regions } : null
  })

// —— 1. 启动 ——
await page.goto(GAME_URL, { waitUntil: 'networkidle' })
const booted = await page
  .waitForFunction(() => document.querySelector('#app')?.getAttribute('data-booted') === '1', {
    timeout: 15000,
  })
  .then(() => true)
  .catch(() => false)
check('启动进入游戏', booted)
const items = await page.locator('.puzzle-item').count()
check('题库列表有题', items >= 15, `${items} 题`)
const svgCount = await page.locator('svg.board-svg').count()
check('棋盘已渲染', svgCount === 1)
const regions = await page.locator('.board-svg .region-border').count()
check('区域边界已绘制', regions > 0, `${regions} 条`)
const badges = await page.locator('.board-svg .region-badge').count()
check('区域徽标已绘制', badges > 0, `${badges} 个`)
await shot('01-initial.png')

// —— 2. 载入一道 5x5 可纯逻辑题 ——
await page.locator('.puzzle-item', { hasText: '入门 · 5×5 A' }).click()
await page.waitForTimeout(200)
const p1 = await sessionPuzzle()
check('载入 5×5 A', p1 && p1.id === 'easy-5x5-A', JSON.stringify(p1?.id))

// —— 3. 左键涂格（循环 空→黑→白→空）——
let c = await cellCenter(0)
await page.mouse.click(c.x, c.y)
let cells = await sessionState()
check('左键一次 → 黑', cells && cells[0] === 1, `cells[0]=${cells?.[0]}`)
await page.mouse.click(c.x, c.y)
cells = await sessionState()
check('左键两次 → 白', cells && cells[0] === 2, `cells[0]=${cells?.[0]}`)
await page.mouse.click(c.x, c.y)
cells = await sessionState()
check('左键三次 → 空', cells && cells[0] === 0, `cells[0]=${cells?.[0]}`)

// —— 4. 右键直接涂白 ——
c = await cellCenter(6)
await page.mouse.click(c.x, c.y, { button: 'right' })
cells = await sessionState()
check('右键 → 白', cells && cells[6] === 2, `cells[6]=${cells?.[6]}`)
await shot('02-paint.png')

// —— 5. 拖拽涂刷 ——
const a = await cellCenter(12)
const b = await cellCenter(13)
await page.mouse.move(a.x, a.y)
await page.mouse.down()
await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 4 })
await page.mouse.move(b.x, b.y, { steps: 4 })
await page.mouse.up()
cells = await sessionState()
check('拖拽涂刷两格', cells && cells[12] === 1 && cells[13] === 1, `${cells?.[12]},${cells?.[13]}`)
await shot('03-drag.png')

// —— 6. 撤销/重做 ——
await page.locator('#btn-undo').click()
cells = await sessionState()
check('撤销恢复', cells && cells[13] === 0, `cells[13]=${cells?.[13]}`)
await page.locator('#btn-redo').click()
cells = await sessionState()
check('重做恢复', cells && cells[13] === 1, `cells[13]=${cells?.[13]}`)

// —— 7. 键盘：方向键 + Enter ——
await page.locator('body').click({ position: { x: 5, y: 5 } })
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
cells = await sessionState()
check('键盘 Enter 涂格', cells && cells[6] === 1, `cells[6]=${cells?.[6]}`)

// —— 8. 缩放 ——
await page.locator('#zoom-in').click()
const zoomLabel = await page.locator('#zoom-label').textContent()
check('zoom-in 生效', zoomLabel === '125%', zoomLabel ?? '')
await page.locator('#zoom-reset').click()
const zoomLabel2 = await page.locator('#zoom-label').textContent()
check('zoom-reset 生效', zoomLabel2 === '100%', zoomLabel2 ?? '')

// —— 9. 显示解 → 校验通过 ——
await page.locator('#btn-solve').click()
await page.waitForTimeout(300)
const solved = await page.evaluate(() => {
  const s = window.__haitai.getSession()
  return window.__haitai.validate(s.state, s.puzzle).solved
})
check('显示解后盘面合法', solved === true)
const statusText = await page.locator('#status').textContent()
check('状态栏提示完成', (statusText ?? '').includes('完成'), statusText ?? '')
await shot('04-solved.png')

// —— 10. 逻辑解题回放（重新清空后回放）——
await page.locator('#btn-clear').click()
await page.waitForTimeout(150)
await page.locator('#btn-logic').click()
await page
  .waitForFunction(() => document.getElementById('btn-logic')?.textContent === '逻辑解题', {
    timeout: 60000,
  })
  .catch(() => {})
const logicSolved = await page.evaluate(() => {
  const s = window.__haitai.getSession()
  return window.__haitai.validate(s.state, s.puzzle).solved
})
check('逻辑回放解出 5×5 A', logicSolved === true)
const logicStatus = await page.locator('#status').textContent()
check('逻辑回放状态提示', (logicStatus ?? '').includes('解出'), logicStatus ?? '')
await shot('05-logic.png')

// —— 11. 自定义题板：随机分区 → 载入 → 求解 ——
await page.locator('#btn-custom').click()
await page.waitForTimeout(150)
await page.locator('#custom-random').click()
await page.waitForTimeout(150)
const customCellsFilled = await page.evaluate(() => document.querySelectorAll('.custom-cell').length)
check('自定义网格已渲染', customCellsFilled > 0, `${customCellsFilled} 格`)
await shot('06-custom-editor.png')
await page.locator('#custom-apply').click()
await page.waitForTimeout(500)
const cp = await sessionPuzzle()
check('载入自定义题板', cp && cp.id.startsWith('custom-'), JSON.stringify(cp?.id))
const customSolved = await page.evaluate(() => {
  const s = window.__haitai.getSession()
  return window.__haitai.validate(s.state, s.puzzle)
})
// 自定义盘刚载入应为空盘
check('自定义盘为空盘开局', customSolved.shadedCount === 0)
await shot('07-custom-board.png')

// 求解自定义盘（若刚载入的这版无解也没关系，只验证按钮链路不炸）
await page.locator('#btn-solve').click()
await page.waitForTimeout(500)
const customAfter = await page.evaluate(() => {
  const s = window.__haitai.getSession()
  return { solved: window.__haitai.validate(s.state, s.puzzle).solved, status: document.getElementById('status')?.textContent }
})
console.log(`  [INFO] 自定义盘求解后：solved=${customAfter.solved} status=${customAfter.status}`)

// —— 12. 切到 10×10 大盘，验证渲染与逻辑（部分推演）——
await page.locator('.puzzle-item', { hasText: '进阶 · 10×10' }).first().click()
await page.waitForTimeout(300)
const p10 = await sessionPuzzle()
check('载入 10×10', p10 && p10.w === 10 && p10.h === 10)
const cells10 = await page.locator('.board-svg .cell-hit').count()
check('10×10 命中层 100 格', cells10 === 100, `${cells10}`)
await shot('08-10x10.png')

// —— 13. 刷新后进度保持（项目内存储）——
await page.locator('.puzzle-item', { hasText: '入门 · 5×5 A' }).click()
await page.waitForTimeout(200)
await page.locator('#btn-clear').click()
c = await cellCenter(0)
await page.mouse.click(c.x, c.y)
await page.waitForTimeout(400) // 等防抖落盘
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-booted') === '1', {
  timeout: 15000,
})
const restored = await sessionState()
check('刷新后进度恢复', restored && restored[0] === 1, `cells[0]=${restored?.[0]}`)
await shot('09-restore.png')

check('无页面错误', errors.length === 0, errors.slice(0, 3).join(' ;; '))

console.log(failures === 0 ? 'UI-CHECK ALL PASS' : `UI-CHECK ${failures} FAILURES`)
await ctx.close()
process.exit(failures === 0 ? 0 : 1)
