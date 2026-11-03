/** 临时调试：键盘交互 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'

const ctx = await chromium.launchPersistentContext(profileDir('dbg'), {
  headless: false,
  executablePath: edgePath(),
  viewport: { width: 1440, height: 960 },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()))
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-booted') === '1')
await page.locator('.puzzle-item', { hasText: '入门 · 5×5 A' }).click()
await page.waitForTimeout(300)
console.log('editor hidden:', await page.evaluate(() => document.getElementById('custom-editor').hidden))
console.log('activeElement:', await page.evaluate(() => document.activeElement?.tagName + '.' + (document.activeElement?.id || '')))
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(100)
console.log('cursor el count:', await page.locator('.cell-cursor').count())
await page.keyboard.press('Enter')
await page.waitForTimeout(100)
console.log('cells[6]:', await page.evaluate(() => window.__haitai.getSession().state.cells[6]))
console.log('cells:', await page.evaluate(() => window.__haitai.getSession().state.cells.join('')))
await ctx.close()
