/** 临时调试：进度保存链路 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'
import fs from 'node:fs'

const ctx = await chromium.launchPersistentContext(profileDir('dbg-save'), {
  headless: false,
  executablePath: edgePath(),
  viewport: { width: 1440, height: 960 },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

const posts = []
page.on('request', (r) => {
  if (r.url().includes('/__store') && r.method() === 'POST') {
    posts.push(r.postData()?.slice(0, 120) ?? '')
  }
})

const readFile = () => {
  try {
    const d = JSON.parse(fs.readFileSync('data/progress.json', 'utf8'))
    return d['easy-5x5-A'] ? `cells[0]=${d['easy-5x5-A'].cells[0]} sum=${d['easy-5x5-A'].cells.reduce((a, b) => a + b, 0)}` : 'no-entry'
  } catch (e) {
    return 'read-error ' + e.message
  }
}

await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-booted') === '1')
await page.locator('.puzzle-item', { hasText: '入门 · 5×5 A' }).click()
await page.waitForTimeout(300)
console.log('1 载入后 file:', readFile(), 'state:', await page.evaluate(() => window.__haitai.getSession().state.cells.join('')))

await page.locator('#btn-clear').click()
await page.waitForTimeout(500)
console.log('2 清空后 file:', readFile(), 'state:', await page.evaluate(() => window.__haitai.getSession().state.cells.join('')))

const c = await page.evaluate(() => {
  const el = document.querySelector('.cell-hit[data-index="0"]')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(c.x, c.y)
console.log('3 涂格后 state:', await page.evaluate(() => window.__haitai.getSession().state.cells.join('')))
console.log('3 涂格后 file(立即):', readFile())
await page.waitForTimeout(800)
console.log('4 等800ms file:', readFile())
console.log('POSTs so far:', posts.length, posts.slice(-2))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-booted') === '1')
await page.waitForTimeout(300)
const after = await page.evaluate(() => {
  const s = window.__haitai.getSession()
  return { id: s.puzzle.id, cells: s.state.cells.join('') }
})
console.log('5 刷新后 session:', JSON.stringify(after))
console.log('5 刷新后 file:', readFile())
await ctx.close()
