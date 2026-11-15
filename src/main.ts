import './styles.css'
import type { CellState, GameState, Move, Puzzle } from './types'
import { CellState as CS } from './types'
import {
  applyMove,
  createEmptyState,
  cycleCell,
  deserializeState,
  invertMove,
  serializeState,
  setCell,
} from './state'
import { regionCount } from './state'
import { puzzles as builtinPuzzles, getPuzzle, getReferenceSolution, isLogicSolvable } from './puzzles'
import { loadSavedPuzzles, savePuzzleToLibrary } from './library'
import { randomRegions, mulberry32 } from './regions'
import { recognizePuzzle } from './vision'
import {
  clientToViewBox,
  hitTest,
  metricsFor,
  renderBoard,
  validateNow,
} from './render'
import { validate } from './validate'
import { describe } from './validate'
import { planLogicSolve, type PlaybackFrame } from './logic'
import { countSolutions, solvePuzzle } from './solver'
import { isMuted, playDrop, playPlace, resumeAudio, setMuted } from './audio'
import {
  initStore,
  readLastPuzzle,
  readProgress,
  storeInProject,
  storeLocationLabel,
  writeLastPuzzle,
  writeProgress,
  type ProgressEntry,
} from './store'

interface Session {
  puzzle: Puzzle
  state: GameState
  undo: Move[]
  redo: Move[]
}

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel)
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

function loadSave(puzzleId: string): GameState | null {
  try {
    const data = readProgress(puzzleId) as ProgressEntry | null
    if (!data || data.version !== 1) return null
    if (data.width === undefined || data.height === undefined) return null
    if (!Array.isArray(data.cells) || data.cells.length !== data.width * data.height) return null
    return deserializeState({
      version: data.version,
      puzzleId: data.puzzleId,
      width: data.width,
      height: data.height,
      cells: data.cells,
    })
  } catch {
    return null
  }
}

function saveState(session: Session): void {
  writeProgress(serializeState(session.state))
}

function difficultyLabel(d: Puzzle['difficulty']): string {
  return d === 'easy' ? '入门' : d === 'medium' ? '进阶' : d === 'custom' ? '自定义' : '挑战'
}

const app = document.querySelector('#app')
if (!app) throw new Error('no #app')

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <h1>海苔</h1>
      <p>在分区盘面里贴 1×2 多米诺 · 每区恰 2 个黑格 · 多米诺互不相邻</p>
    </div>
    <div class="brand">
      <p style="margin:0">黑格两两成对即多米诺；任何两个多米诺不得正交相邻</p>
    </div>
  </header>

  <div class="layout">
    <aside class="panel">
      <h2>题面</h2>
      <div class="toolbar" style="margin-top:0">
        <button class="btn" id="btn-random" type="button">随机抽题</button>
        <button class="btn" id="btn-custom" type="button">自定义</button>
        <button class="btn" id="btn-import" type="button">识图导入</button>
        <button class="btn" id="btn-mute" type="button">音效：开</button>
        <input id="import-file" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" hidden />
      </div>
      <div class="puzzle-list" id="puzzle-list"></div>

      <div class="custom-editor" id="custom-editor" hidden>
        <h2>自定义题板</h2>
        <div class="custom-row">
          <label>宽 <input id="custom-w" type="number" min="2" max="60" value="5" /></label>
          <label>高 <input id="custom-h" type="number" min="2" max="60" value="5" /></label>
          <button class="btn" id="custom-regen" type="button">生成网格</button>
          <button class="btn" id="custom-random" type="button">随机分区</button>
        </div>
        <div class="custom-hint">在调色板里选区域号，点击/拖拽涂刷格子；同号格子属于同一区域，每区至少 2 格</div>
        <div class="region-palette" id="region-palette"></div>
        <div class="custom-grid" id="custom-grid"></div>
        <div class="toolbar" style="margin-top:10px">
          <button class="btn primary" id="custom-apply" type="button">载入题板</button>
          <button class="btn" id="custom-save" type="button">保存到题库</button>
          <button class="btn" id="custom-solve" type="button">求解</button>
          <button class="btn" id="custom-logic" type="button">逻辑解题</button>
          <button class="btn danger" id="custom-close" type="button">关闭</button>
        </div>
        <div class="custom-msg" id="custom-msg"></div>
      </div>

      <div class="toolbar">
        <button class="btn primary" id="btn-check" type="button">检查</button>
        <button class="btn" id="btn-undo" type="button">撤销</button>
        <button class="btn" id="btn-redo" type="button">重做</button>
        <button class="btn" id="btn-hint" type="button">提示一格</button>
        <button class="btn" id="btn-logic" type="button">逻辑解题</button>
        <button class="btn" id="btn-solve" type="button">显示解</button>
        <button class="btn danger" id="btn-clear" type="button">清空</button>
      </div>

      <div class="status" id="status">选择左侧题目开始。点击格子：空 → 黑 → 白 → 空。</div>

      <div class="legend">
        <div><kbd>点击</kbd>/<kbd>拖拽</kbd> 涂格（空 → 黑 → 白循环）</div>
        <div><kbd>右键</kbd> 直接涂白 · <kbd>Shift+拖拽</kbd>/<kbd>中键</kbd> 平移画布</div>
        <div><kbd>滚轮</kbd> 缩放 · <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd> 放大/缩小/复位</div>
        <div><kbd>方向键</kbd> 移动光标 · <kbd>Enter</kbd> 涂当前格 · <kbd>X</kbd> 涂白</div>
        <div><kbd>Z</kbd> / <kbd>Shift+Z</kbd> 撤销 / 重做 · <kbd>C</kbd> 检查</div>
        <div><kbd>L</kbd> 逻辑解题/停止回放 · <kbd>P</kbd> 暂停/继续 · <kbd>Esc</kbd> 清空</div>
        <div><kbd>R</kbd> 随机 · <kbd>M</kbd> 音效开关</div>
      </div>
    </aside>

    <main class="panel board-wrap" id="board-wrap">
      <div class="zoom-bar">
        <button class="btn" id="zoom-out" type="button" title="缩小">−</button>
        <span class="zoom-label" id="zoom-label">100%</span>
        <button class="btn" id="zoom-in" type="button" title="放大">+</button>
        <button class="btn" id="zoom-reset" type="button">复位</button>
      </div>
      <div id="board"></div>
    </main>
  </div>

  <p class="footer-note">黑格必须恰好两两相邻成 1×2 · 每区恰 2 黑格 · 多米诺之间留白</p>
`

let session: Session | null = null
/** 键盘光标格 */
let cursorCell: number | null = null

/** 内置 + 本地保存的自定义题库 */
let library: Puzzle[] = [...builtinPuzzles]

function refreshLibrary() {
  const saved = loadSavedPuzzles()
  library = [...saved, ...builtinPuzzles]
}

function findPuzzle(id: string): Puzzle | undefined {
  return library.find((p) => p.id === id) || getPuzzle(id)
}

/** 稳定排序：自定义已存 → 其它内置（保持原顺序） */
function sortedLibrary(): Puzzle[] {
  const rank = (p: Puzzle) => (p.difficulty === 'custom' ? 0 : 1)
  return [...library].sort((a, b) => rank(a) - rank(b))
}

function currentResult() {
  if (!session) return null
  return validate(session.state, session.puzzle)
}

function setStatus(text: string, tone: 'ok' | 'bad' | 'solving' | '' = '') {
  const el = $('#status')
  el.textContent = text
  el.className = 'status' + (tone ? ` ${tone}` : '')
}

function renderPuzzleList() {
  refreshLibrary()
  const list = $('#puzzle-list')
  list.innerHTML = sortedLibrary()
    .map((p) => {
      const active = session?.puzzle.id === p.id ? ' active' : ''
      const logicTag = p.difficulty !== 'custom' && isLogicSolvable(p.id) ? ' · 可纯逻辑' : ''
      return `
        <button class="puzzle-item${active}" data-id="${p.id}" type="button">
          <span class="title">${p.name}</span>
          <span class="meta">${p.width}×${p.height} · ${difficultyLabel(p.difficulty)}${logicTag}</span>
        </button>
      `
    })
    .join('')

  list.querySelectorAll<HTMLButtonElement>('.puzzle-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const p = id ? findPuzzle(id) : undefined
      if (p) selectPuzzle(p)
    })
  })
}

function renderBoardOnly(flash?: { index: number; to: CellState } | null) {
  if (!session) return
  const result = validateNow(session.puzzle, session.state)
  const svg = renderBoard(session.puzzle, session.state, result, {
    cursor: cursorCell,
    flash: flash ?? null,
  })
  const board = $('#board')
  board.innerHTML = svg
  bindBoardEvents()
  applyViewBox()
}

function refresh() {
  renderPuzzleList()
  renderBoardOnly()
  if (!session) return
  const result = currentResult()
  if (!result) return
  if (result.solved) {
    setStatus('完成！每个区域恰好 2 个黑格，多米诺全部合规。', 'ok')
    return
  }
  const total = regionCount(session.puzzle) * 2
  const bits = describe(result, regionCount(session.puzzle))
  bits[0] = `黑格 ${result.shadedCount} / ${total}`
  setStatus(bits.join(' · '))
}

function selectPuzzle(puzzle: Puzzle) {
  stopLogic()
  const saved = loadSave(puzzle.id)
  session = {
    puzzle,
    state: saved ?? createEmptyState(puzzle),
    undo: [],
    redo: [],
  }
  cursorCell = null
  writeLastPuzzle(puzzle.id)
  zoom = 1
  panX = 0
  panY = 0
  refresh()
  setStatus(`已载入「${puzzle.name}」。点击格子：空 → 黑 → 白 → 空。`)
}

function pushMove(move: Move) {
  if (!session) return
  applyMove(session.state, move)
  session.undo.push(move)
  session.redo.length = 0
  saveState(session)
}

/** 循环涂格：空 → 黑 → 白 → 空 */
function toggleCell(index: number, force?: CS) {
  if (!session) return
  const from = session.state.cells[index] ?? CS.Unknown
  const to = force !== undefined ? force : cycleCell(from)
  if (from === to) return
  pushMove({ index, from, to })
  refresh()
}

function undo() {
  if (!session || !session.undo.length) return
  const move = session.undo.pop()!
  const inv = invertMove(move)
  setCell(session.state, inv.index, inv.to)
  session.redo.push(move)
  saveState(session)
  refresh()
}

function redo() {
  if (!session || !session.redo.length) return
  const move = session.redo.pop()!
  applyMove(session.state, move)
  session.undo.push(move)
  saveState(session)
  refresh()
}

function clearBoard() {
  if (!session) return
  stopLogic()
  session.state = createEmptyState(session.puzzle)
  session.undo = []
  session.redo = []
  saveState(session)
  refresh()
  setStatus('已清空当前盘面。')
}

function check() {
  const result = currentResult()
  if (!session || !result) return
  if (result.solved) {
    setStatus('正确！这就是海苔的答案。', 'ok')
    playWin()
  } else {
    const parts: string[] = []
    if (result.badRegions.length) parts.push(`${result.badRegions.length} 个区域黑格数不对`)
    const lonely = result.badDominoes.filter((d) => d.reason === 'lonely').length
    const crowded = result.badDominoes.filter((d) => d.reason === 'crowded').length
    const touch = result.badDominoes.filter((d) => d.reason === 'touch').length
    if (lonely) parts.push(`${lonely} 个黑格配不成多米诺`)
    if (crowded) parts.push(`${crowded} 处连通超过两格`)
    if (touch) parts.push(`${touch} 处多米诺相互相贴`)
    setStatus(parts.join(' · ') || '继续加油', 'bad')
  }
  refresh()
}

function playWin() {
  resumeAudio()
  playPlace(1)
  setTimeout(() => playPlace(4), 110)
  setTimeout(() => playPlace(7), 220)
}

/** 取一个可靠解：内置参考解优先，否则现场求解 */
function reliableSolution(): GameState | null {
  if (!session) return null
  const ref = getReferenceSolution(session.puzzle.id)
  if (ref) return ref
  const area = session.puzzle.width * session.puzzle.height
  const budget = area > 400 ? 6_000_000 : area > 100 ? 3_000_000 : 1_500_000
  const r = solvePuzzle(session.puzzle, budget)
  if (!r.solved || !r.solution) return null
  return r.solution
}

function showSolution() {
  if (!session) return
  const sol = reliableSolution()
  if (!sol) {
    setStatus('无解或盘面矛盾，无法给出答案。', 'bad')
    return
  }
  session.state = { ...sol, cells: sol.cells.slice() }
  session.undo = []
  session.redo = []
  saveState(session)
  refresh()
  setStatus('已填入一组可行解。', 'ok')
}

function hint() {
  if (!session) return
  const sol = reliableSolution()
  if (!sol) {
    setStatus('暂时给不出提示。', 'bad')
    return
  }
  // 优先揭示与当前不一致的黑格，其次白格
  const order: CS[] = [CS.Shaded, CS.Forbidden]
  for (const want of order) {
    for (let i = 0; i < session.state.cells.length; i++) {
      const cur = session.state.cells[i] ?? CS.Unknown
      const target = sol.cells[i] ?? CS.Unknown
      if (cur === CS.Unknown && target === want) {
        pushMove({ index: i, from: cur, to: target })
        refresh()
        setStatus(want === CS.Shaded ? '已揭示一个黑格。' : '已揭示一个白格。', 'ok')
        return
      }
    }
  }
  setStatus('当前已与可行解一致，或无未知格可提示。', 'ok')
}

// —— 画布缩放 / 平移 ——
let zoom = 1
let panX = 0
let panY = 0

function baseVB() {
  if (!session) return { w: 400, h: 400 }
  const m = metricsFor(session.puzzle)
  return { w: m.svgWidth, h: m.svgHeight }
}

function applyViewBox() {
  const svg = document.querySelector('svg.board-svg')
  if (!svg) return
  const { w, h } = baseVB()
  const vw = w / zoom
  const vh = h / zoom
  panX = Math.max(0, Math.min(panX, w - vw))
  panY = Math.max(0, Math.min(panY, h - vh))
  svg.setAttribute('viewBox', `${panX} ${panY} ${vw} ${vh}`)
  const label = document.getElementById('zoom-label')
  if (label) label.textContent = `${Math.round(zoom * 100)}%`
}

function setZoom(next: number, anchor?: { x: number; y: number }) {
  const { w, h } = baseVB()
  const oldZoom = zoom
  const z = Math.max(1, Math.min(5, next))
  if (anchor) {
    const u = (anchor.x - panX) / (w / oldZoom)
    const v = (anchor.y - panY) / (h / oldZoom)
    zoom = z
    panX = anchor.x - u * (w / zoom)
    panY = anchor.y - v * (h / zoom)
  } else {
    zoom = z
    const cx = panX + w / oldZoom / 2
    const cy = panY + h / oldZoom / 2
    panX = cx - w / zoom / 2
    panY = cy - h / zoom / 2
  }
  applyViewBox()
}

// —— 棋盘交互 ——
// 涂刷/平移会话放在模块级：涂格会整体重渲染 SVG（旧元素被 detach），
// 会话状态和 move/up 监听必须活在 window 上，否则拖拽会断在第一格。
let paintSession: { to: CS; last: number } | null = null
let panSession: { x: number; y: number; moved: boolean } | null = null

/** 指针坐标 → 当前盘面的格子索引（每次取最新的 svg） */
function hitAtPointer(e: PointerEvent): number | null {
  if (!session) return null
  const svg = document.querySelector('svg.board-svg') as SVGSVGElement | null
  if (!svg) return null
  const vb = clientToViewBox(svg, e.clientX, e.clientY)
  if (!vb) return null
  const m = metricsFor(session.puzzle)
  return hitTest(m, session.puzzle, vb.x, vb.y)
}

function bindBoardEvents() {
  const board = $('#board')
  const svg = board.querySelector('svg.board-svg') as SVGSVGElement | null
  if (!svg) return

  applyViewBox()
  svg.addEventListener('contextmenu', (e) => e.preventDefault())

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const vb = clientToViewBox(svg, e.clientX, e.clientY)
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setZoom(zoom * factor, vb ?? undefined)
    },
    { passive: false },
  )

  svg.addEventListener('pointerdown', (e) => {
    resumeAudio()
    if (e.button === 2) {
      const hit = hitAtPointer(e)
      if (hit !== null) {
        toggleCell(hit, CS.Forbidden)
        playDrop()
      }
      return
    }
    if (e.button === 1 || e.shiftKey) {
      // 平移画布
      panSession = { x: e.clientX, y: e.clientY, moved: false }
      return
    }
    if (e.button !== 0) return
    const hit = hitAtPointer(e)
    if (hit === null) return
    const cur = session!.state.cells[hit] ?? CS.Unknown
    const to = cycleCell(cur)
    paintSession = { to, last: hit }
    cursorCell = hit
    toggleCell(hit, to)
    if (to === CS.Shaded) playPlace()
    else playDrop()
  })
}

/** move/up 监听只绑一次（window 级），重渲染不影响会话 */
window.addEventListener('pointermove', (e) => {
  if (panSession) {
    const dx = e.clientX - panSession.x
    const dy = e.clientY - panSession.y
    if (!panSession.moved && Math.hypot(dx, dy) < 6) return
    panSession.moved = true
    const svg = document.querySelector('svg.board-svg') as SVGSVGElement | null
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const { w, h } = baseVB()
    const scaleX = w / zoom / rect.width
    const scaleY = h / zoom / rect.height
    panX -= dx * scaleX
    panY -= dy * scaleY
    panSession.x = e.clientX
    panSession.y = e.clientY
    applyViewBox()
    return
  }
  if (!paintSession) return
  const hit = hitAtPointer(e)
  if (hit === null || hit === paintSession.last) return
  paintSession.last = hit
  toggleCell(hit, paintSession.to)
})

function endPointerSessions() {
  paintSession = null
  panSession = null
}
window.addEventListener('pointerup', endPointerSessions)
window.addEventListener('pointercancel', endPointerSessions)

// —— 逻辑解题回放 ——
const LOGIC_ANIM_MS = 600
let logicPlaying = false
let logicPaused = false
let logicToken = 0
let logicFrame = 0
let logicTotal = 0

function sleep(ms: number, token: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(token === logicToken), ms)
  })
}

/** 可暂停的等待：暂停期间不计时，继续后接着等完剩余时间 */
function sleepPausable(ms: number, token: number): Promise<boolean> {
  return new Promise((resolve) => {
    let left = ms
    const step = () => {
      if (token !== logicToken) return resolve(false)
      if (logicPaused) {
        setTimeout(step, 60)
        return
      }
      left -= 60
      if (left <= 0) return resolve(true)
      setTimeout(step, 60)
    }
    setTimeout(step, 60)
  })
}

function updateLogicButton() {
  const btn = document.getElementById('btn-logic') as HTMLButtonElement | null
  if (!btn) return
  if (logicPlaying) {
    btn.textContent = '停止回放'
    btn.classList.remove('primary')
    btn.classList.add('danger')
  } else {
    btn.textContent = '逻辑解题'
    btn.classList.add('primary')
    btn.classList.remove('danger')
  }
}

function setButtonsDisabled(disabled: boolean) {
  for (const id of ['btn-check', 'btn-undo', 'btn-redo', 'btn-hint', 'btn-solve', 'btn-clear'] as const) {
    const el = document.getElementById(id) as HTMLButtonElement | null
    if (el) el.disabled = disabled
  }
  const board = document.getElementById('board')
  if (board) board.style.pointerEvents = disabled ? 'none' : ''
}

function toggleLogicPause() {
  if (!logicPlaying) return
  logicPaused = !logicPaused
  if (logicPaused) {
    setStatus(`回放已暂停 [${logicFrame}/${logicTotal}] · 按 P 继续`, 'solving')
  } else {
    setStatus(`回放继续 [${logicFrame}/${logicTotal}]…`, 'solving')
  }
}

async function playLogicPlan(plan: { puzzleId: string; frames: PlaybackFrame[] }, puzzleId: string, token: number) {
  const frames = plan.frames
  logicTotal = frames.length
  for (let i = 0; i < frames.length; i++) {
    if (token !== logicToken) return
    if (!session || session.puzzle.id !== puzzleId) return
    const frame = frames[i]!
    pushMove({ index: frame.change.index, from: frame.change.from, to: frame.change.to })
    renderBoardOnly({ index: frame.change.index, to: frame.change.to })
    if (frame.change.to === CS.Shaded) playPlace(frame.streak)
    else playDrop(frame.streak)
    logicFrame = i + 1
    setStatus(`回放 [${logicFrame}/${logicTotal}] ${frame.label}`, 'solving')
    if (i < frames.length - 1) {
      const gap = Math.max(60, Math.round(LOGIC_ANIM_MS / Math.sqrt(frame.streak)))
      const more = await sleepPausable(gap, token)
      if (!more) return
    }
  }
  await sleepPausable(LOGIC_ANIM_MS, token)
}

async function runLogicSolver() {
  if (!session || logicPlaying) return
  const puzzle = session.puzzle
  logicPlaying = true
  logicPaused = false
  logicFrame = 0
  logicToken++
  const token = logicToken
  setButtonsDisabled(true)
  updateLogicButton()
  setStatus('逻辑解题：推理中…', 'solving')
  await sleep(16, token)
  if (token !== logicToken) return

  const plan = planLogicSolve(puzzle, session.state.cells)
  if (token !== logicToken) return

  if (!plan.frames.length) {
    logicPlaying = false
    logicPaused = false
    setButtonsDisabled(false)
    updateLogicButton()
    setStatus(
      plan.solved ? '已经解出了，没有可回放的步骤。' : '逻辑规则暂无新推演（可能已卡关或已全部确定）。',
    )
    return
  }

  setStatus(`推理完成：${plan.frames.length} 步，开始回放…`, 'solving')
  await sleep(280, token)
  if (token !== logicToken) return

  try {
    await playLogicPlan(plan, puzzle.id, token)
  } catch {
    /* ignore */
  }

  if (token === logicToken) {
    logicPlaying = false
    logicPaused = false
    setButtonsDisabled(false)
    updateLogicButton()
    if (session && session.puzzle.id === puzzle.id) {
      renderBoardOnly()
      const result = currentResult()
      if (result?.solved) {
        setStatus('逻辑解题完成，盘面已解出。', 'ok')
        playWin()
      } else {
        setStatus(`回放完毕（${plan.frames.length} 步）。剩余部分需要搜索，可用「显示解」。`, 'ok')
      }
    }
  }
}

function stopLogic() {
  logicToken++
  logicPlaying = false
  logicPaused = false
  setButtonsDisabled(false)
  updateLogicButton()
}

function pickRandomPuzzle() {
  refreshLibrary()
  const cur = session?.puzzle.id
  const pool = cur ? library.filter((p) => p.id !== cur) : library
  const list = pool.length ? pool : library
  const p = list[Math.floor(Math.random() * list.length)]!
  selectPuzzle(p)
  setStatus(`随机抽到「${p.name}」。`)
}

function toggleMute() {
  const next = !isMuted()
  setMuted(next)
  const btn = document.getElementById('btn-mute')
  if (btn) btn.textContent = next ? '音效：关' : '音效：开'
  if (!next) resumeAudio()
}

// —— 识图导入 ——
function timestampLabel(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

async function importPuzzleImage(file: File) {
  setStatus(`识图中：${file.name}…`, 'solving')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('浏览器无法创建画布')
    ctx.drawImage(bitmap, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = recognizePuzzle({
      width: pixels.width,
      height: pixels.height,
      data: pixels.data,
    })
    const tooSmall = result.diagnostics.regionSizes.filter((s) => s < 2).length
    if (result.diagnostics.regionCount < 2 || tooSmall) {
      throw new Error(result.warnings.join('；') || '识别出的区域不成立')
    }
    const puzzle: Puzzle = {
      id: `import-${Date.now()}`,
      name: `识图导入 · ${result.width}×${result.height} · ${timestampLabel()}`,
      width: result.width,
      height: result.height,
      regions: result.regions,
      difficulty: 'custom',
    }
    const area = puzzle.width * puzzle.height
    const budget = area > 400 ? 6_000_000 : area > 100 ? 3_000_000 : 1_500_000
    const check = countSolutions(puzzle, 2, budget)
    if (!check.timedOut && check.count === 0) {
      throw new Error('识别结果无解，可能不是海苔题图')
    }
    savePuzzleToLibrary(puzzle)
    refreshLibrary()
    selectPuzzle(puzzle)
    const unique = check.timedOut ? '解数未知' : check.count >= 2 ? '多个解' : '唯一解'
    const warn = result.warnings.length ? `（${result.warnings.join('；')}）` : ''
    setStatus(
      `识图成功：${result.width}×${result.height}，${result.diagnostics.regionCount} 个区域，${unique}。已存入题库。${warn}`,
      'ok',
    )
  } finally {
    bitmap.close()
  }
}

// —— 自定义题板 ——
const REGION_PALETTE = [
  '#dfe9e0',
  '#f1e6d2',
  '#dde6f2',
  '#eedde8',
  '#e3edd6',
  '#ece3d9',
  '#d8ecea',
  '#f0e4c8',
  '#e2dcf0',
  '#f0dcdc',
  '#d9ebe6',
  '#eae7d6',
]

let customW = 5
let customH = 5
/** 每格区域编号 */
let customCells: number[] = []
/** 调色板当前选中的区域号 */
let customSelected = 0
/** 键盘光标格 */
let customCursor = 0

function customMsg(text: string, tone: 'ok' | 'bad' | '' = '') {
  const el = document.getElementById('custom-msg')
  if (!el) return
  el.textContent = text
  el.className = 'custom-msg' + (tone ? ` ${tone}` : '')
}

function regionColor(r: number): string {
  return REGION_PALETTE[r % REGION_PALETTE.length]!
}

function customEditorOpen(): boolean {
  const panel = document.getElementById('custom-editor')
  return !!panel && !panel.hidden
}

function renderPalette() {
  const box = document.getElementById('region-palette')
  if (!box) return
  const ids = [...new Set(customCells.filter((r) => r >= 0))].sort((a, b) => a - b)
  const chips = ids.map(
    (r) => `
      <button type="button" class="region-chip${r === customSelected ? ' active' : ''}" data-region="${r}">
        <span class="swatch" style="background:${regionColor(r)}"></span>${r}
      </button>`,
  )
  chips.push(`<button type="button" class="region-chip" id="chip-new">＋ 新区域</button>`)
  box.innerHTML = chips.join('')
  box.querySelectorAll<HTMLButtonElement>('.region-chip[data-region]').forEach((btn) => {
    btn.addEventListener('click', () => {
      customSelected = Number(btn.dataset.region)
      renderPalette()
    })
  })
  box.querySelector<HTMLButtonElement>('#chip-new')?.addEventListener('click', () => {
    const max = customCells.reduce((m, r) => Math.max(m, r), -1)
    customSelected = max + 1
    renderPalette()
    customMsg(`已选择新区域 ${customSelected}，点击格子涂刷。`)
  })
}

function setCustomCellUI(i: number) {
  const btn = document.querySelector<HTMLButtonElement>(`.custom-cell[data-i="${i}"]`)
  if (!btn) return
  const r = customCells[i] ?? 0
  btn.textContent = String(r)
  btn.style.background = regionColor(r)
  btn.classList.toggle('selected', i === customCursor)
}

function renderCustomGrid() {
  const grid = document.getElementById('custom-grid')
  if (!grid) return
  const w = customW
  const h = customH
  if (customCells.length !== w * h) {
    customCells = new Array<number>(w * h).fill(0)
  }
  if (customCursor >= w * h) customCursor = 0
  grid.style.gridTemplateColumns = `repeat(${w}, 36px)`
  grid.innerHTML = customCells
    .map((r, i) => {
      const sel = i === customCursor ? ' selected' : ''
      return `<button type="button" class="custom-cell${sel}" data-i="${i}" style="background:${regionColor(r)}">${r}</button>`
    })
    .join('')

  let painting = false
  grid.querySelectorAll<HTMLButtonElement>('.custom-cell').forEach((btn) => {
    const i = Number(btn.dataset.i)
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      painting = true
      customCursor = i
      customCells[i] = customSelected
      setCustomCellUI(i)
    })
    btn.addEventListener('pointerenter', () => {
      if (!painting) return
      if (customCells[i] === customSelected) return
      customCells[i] = customSelected
      setCustomCellUI(i)
    })
  })
  const stop = () => {
    painting = false
  }
  grid.addEventListener('pointerup', stop)
  grid.addEventListener('pointerleave', stop)
  grid.addEventListener('pointercancel', stop)
  grid.tabIndex = 0
}

function openCustomEditor() {
  const panel = document.getElementById('custom-editor')
  if (!panel) return
  panel.hidden = false
  const wEl = document.getElementById('custom-w') as HTMLInputElement | null
  const hEl = document.getElementById('custom-h') as HTMLInputElement | null
  if (wEl) wEl.value = String(customW)
  if (hEl) hEl.value = String(customH)
  if (customCells.length !== customW * customH) {
    customCells = new Array<number>(customW * customH).fill(0)
  }
  customSelected = 0
  renderPalette()
  renderCustomGrid()
  customMsg('选区域号 → 点击/拖拽涂刷格子。每区至少 2 格，「载入题板」会自动校验可解性。')
  document.getElementById('custom-grid')?.focus()
}

function closeCustomEditor() {
  const panel = document.getElementById('custom-editor')
  if (panel) panel.hidden = true
}

function readCustomSize() {
  const wEl = document.getElementById('custom-w') as HTMLInputElement | null
  const hEl = document.getElementById('custom-h') as HTMLInputElement | null
  const w = Math.max(2, Math.min(60, Number(wEl?.value) || 5))
  const h = Math.max(2, Math.min(60, Number(hEl?.value) || 5))
  if (wEl) wEl.value = String(w)
  if (hEl) hEl.value = String(h)
  return { w, h }
}

function regenCustomGrid() {
  const { w, h } = readCustomSize()
  customW = w
  customH = h
  customCells = new Array<number>(w * h).fill(0)
  customCursor = 0
  customSelected = 0
  renderPalette()
  renderCustomGrid()
  customMsg(`已生成 ${w}×${h} 网格（默认全部属于区域 0），选区域号后涂刷分出各区。`)
  document.getElementById('custom-grid')?.focus()
}

function randomCustomRegions() {
  const { w, h } = readCustomSize()
  customW = w
  customH = h
  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0)
  const regions = randomRegions(w, h, rng, 2, 5)
  if (!regions) {
    customMsg('随机分区失败，请重试。', 'bad')
    return
  }
  customCells = regions
  customCursor = 0
  customSelected = 0
  renderPalette()
  renderCustomGrid()
  customMsg('已随机分区，可继续涂刷修改，或直接「载入题板」。')
}

function makeCustomPuzzle(): Puzzle {
  return {
    id: `custom-${customW}x${customH}`,
    name: `自定义 · ${customW}×${customH}`,
    width: customW,
    height: customH,
    regions: customCells.slice(),
    difficulty: 'custom' as Puzzle['difficulty'],
  }
}

function loadCustomPuzzle() {
  const { w, h } = readCustomSize()
  customW = w
  customH = h
  if (customCells.length !== w * h) {
    customCells = new Array<number>(w * h).fill(0)
    renderCustomGrid()
    customMsg('网格已重置，请先涂刷分区。', 'bad')
    return
  }
  // 每区至少 2 格（否则该区不可能恰好 2 黑格）
  const counts = new Map<number, number>()
  for (const r of customCells) counts.set(r, (counts.get(r) ?? 0) + 1)
  const tooSmall = [...counts.entries()].filter(([, c]) => c < 2)
  if (tooSmall.length) {
    customMsg(`有 ${tooSmall.length} 个区域不足 2 格（区域 ${tooSmall.map(([r]) => r).join('、')}），请先合并。`, 'bad')
    return
  }
  const puzzle = makeCustomPuzzle()
  const area = w * h
  const budget = area > 400 ? 6_000_000 : area > 100 ? 3_000_000 : 1_500_000
  const r = countSolutions(puzzle, 2, budget)
  if (r.count === 0) {
    customMsg(r.timedOut ? '校验超时：盘面可能过大，仍可载入试玩。' : '这道题板无解，请调整分区。', 'bad')
    if (r.timedOut) {
      // 超时但未必无解：允许载入
    } else {
      return
    }
  } else if (r.count >= 2) {
    customMsg('注意：这道题板存在多个解（不影响试玩，求解会给出其中一个）。')
  } else {
    customMsg('校验通过：唯一解。', 'ok')
  }
  savePuzzleToLibrary(puzzle)
  stopLogic()
  session = {
    puzzle,
    state: createEmptyState(puzzle),
    undo: [],
    redo: [],
  }
  cursorCell = null
  zoom = 1
  panX = 0
  panY = 0
  refresh()
  setStatus(`已载入自定义 ${w}×${h}，并存入题库（刷新后仍在列表里）。`)
}

function saveCustomToLibrary() {
  const { w, h } = readCustomSize()
  if (customCells.length !== w * h) {
    customMsg('请先生成网格并涂好分区。', 'bad')
    return
  }
  const counts = new Map<number, number>()
  for (const r of customCells) counts.set(r, (counts.get(r) ?? 0) + 1)
  if ([...counts.values()].some((c) => c < 2)) {
    customMsg('有区域不足 2 格，请先合并再保存。', 'bad')
    return
  }
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `自定义 · ${w}×${h} · ${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}`
  const puzzle: Puzzle = {
    id: `custom-${w}x${h}-${Date.now()}`,
    name,
    width: w,
    height: h,
    regions: customCells.slice(),
    difficulty: 'custom',
  }
  savePuzzleToLibrary(puzzle)
  refreshLibrary()
  renderPuzzleList()
  customMsg(`已保存到题库：「${name}」，下次启动仍可选用。`, 'ok')
  setStatus(`自定义盘已存入题库「${name}」。`)
}

function solveCustom() {
  if (!session || !session.puzzle.id.startsWith('custom-')) {
    customMsg('请先载入自定义题板。', 'bad')
    return
  }
  const puzzle = session.puzzle
  customMsg('求解中…')
  const area = puzzle.width * puzzle.height
  const budget = area > 400 ? 6_000_000 : area > 100 ? 3_000_000 : 1_500_000
  const r = solvePuzzle(puzzle, budget)
  if (!r.solved || !r.solution) {
    customMsg(
      r.timedOut ? '求解超时：盘面过大或矛盾，可先「逻辑解题」再求解。' : '无解或分区矛盾，无法完成。',
      'bad',
    )
    return
  }
  session.state = { ...r.solution, cells: r.solution.cells.slice() }
  session.undo = []
  session.redo = []
  saveState(session)
  refresh()
  customMsg(`求解成功（搜索 ${r.nodes} 节点）。`, 'ok')
  setStatus('自定义盘已求解。', 'ok')
}

function logicCustom() {
  if (!session) return
  closeCustomEditor()
  void runLogicSolver()
}

// —— 按钮绑定 ——
$('#btn-check').addEventListener('click', check)
$('#btn-undo').addEventListener('click', undo)
$('#btn-redo').addEventListener('click', redo)
$('#btn-clear').addEventListener('click', clearBoard)
$('#btn-solve').addEventListener('click', showSolution)
$('#btn-hint').addEventListener('click', hint)
$('#btn-random').addEventListener('click', pickRandomPuzzle)
$('#btn-mute').addEventListener('click', toggleMute)
$('#btn-custom').addEventListener('click', openCustomEditor)
$('#btn-import').addEventListener('click', () => {
  document.getElementById('import-file')?.click()
})
$('#import-file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void importPuzzleImage(file).catch((err) => {
    setStatus(`识图失败：${err instanceof Error ? err.message : String(err)}`, 'bad')
  })
})
$('#custom-regen').addEventListener('click', regenCustomGrid)
$('#custom-random').addEventListener('click', randomCustomRegions)
$('#custom-apply').addEventListener('click', loadCustomPuzzle)
$('#custom-save').addEventListener('click', saveCustomToLibrary)
$('#custom-solve').addEventListener('click', solveCustom)
$('#custom-logic').addEventListener('click', logicCustom)
$('#custom-close').addEventListener('click', closeCustomEditor)
$('#btn-logic').addEventListener('click', () => {
  resumeAudio()
  if (logicPlaying) stopLogic()
  else void runLogicSolver()
})
$('#zoom-in').addEventListener('click', () => setZoom(zoom * 1.25))
$('#zoom-out').addEventListener('click', () => setZoom(zoom / 1.25))
$('#zoom-reset').addEventListener('click', () => {
  zoom = 1
  panX = 0
  panY = 0
  applyViewBox()
})

// —— 键盘 ——
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return

  // —— 自定义题板键盘录入（编辑器打开时优先）——
  if (customEditorOpen()) {
    const k = e.key
    if (k === 'ArrowLeft') {
      e.preventDefault()
      customCursor = Math.max(0, (customCursor % customW === 0 ? customCursor : customCursor - 1))
      renderCustomGrid()
      return
    }
    if (k === 'ArrowRight') {
      e.preventDefault()
      const max = customW * customH - 1
      customCursor = Math.min(max, customCursor + 1)
      renderCustomGrid()
      return
    }
    if (k === 'ArrowUp') {
      e.preventDefault()
      customCursor = Math.max(0, customCursor - customW)
      renderCustomGrid()
      return
    }
    if (k === 'ArrowDown') {
      e.preventDefault()
      customCursor = Math.min(customW * customH - 1, customCursor + customW)
      renderCustomGrid()
      return
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault()
      customCells[customCursor] = customSelected
      setCustomCellUI(customCursor)
      return
    }
    if (k === 'n' || k === 'N') {
      e.preventDefault()
      const max = customCells.reduce((m, r) => Math.max(m, r), -1)
      customSelected = max + 1
      renderPalette()
      return
    }
    if (k === 'Escape') {
      e.preventDefault()
      closeCustomEditor()
      return
    }
  }

  const k = e.key.toLowerCase()
  if (!session) return
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if ((k === 'z' && e.shiftKey) || k === 'y') {
    e.preventDefault()
    redo()
  } else if (k === 'c') {
    e.preventDefault()
    check()
  } else if (k === 'l') {
    e.preventDefault()
    if (logicPlaying) stopLogic()
    else void runLogicSolver()
  } else if (k === 'p') {
    e.preventDefault()
    toggleLogicPause()
  } else if (k === 'r') {
    e.preventDefault()
    pickRandomPuzzle()
  } else if (k === 'm') {
    e.preventDefault()
    toggleMute()
  } else if (k === 'x') {
    e.preventDefault()
    if (cursorCell !== null) toggleCell(cursorCell, CS.Forbidden)
  } else if (k === 'enter') {
    e.preventDefault()
    if (cursorCell !== null) toggleCell(cursorCell)
  } else if (k === 'escape') {
    e.preventDefault()
    clearBoard()
  } else if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
    e.preventDefault()
    moveCursor(k)
  } else if (k === '+' || k === '=') {
    e.preventDefault()
    setZoom(zoom * 1.25)
  } else if (k === '-' || k === '_') {
    e.preventDefault()
    setZoom(zoom / 1.25)
  } else if (k === '0') {
    e.preventDefault()
    zoom = 1
    panX = 0
    panY = 0
    applyViewBox()
  }
})

function moveCursor(key: string) {
  if (!session) return
  const w = session.puzzle.width
  const h = session.puzzle.height
  if (cursorCell === null) cursorCell = 0
  const cx = cursorCell % w
  const cy = Math.floor(cursorCell / w)
  if (key === 'arrowleft' && cx > 0) cursorCell -= 1
  if (key === 'arrowright' && cx < w - 1) cursorCell += 1
  if (key === 'arrowup' && cy > 0) cursorCell -= w
  if (key === 'arrowdown' && cy < h - 1) cursorCell += w
  renderBoardOnly()
}

// 默认载入：先等存储就绪（项目内 data/ 优先，读不到才降级 localStorage），
// 再恢复上次玩的题；找不到就回退到排序第一题
void (async () => {
  try {
    await initStore()
    refreshLibrary()
    let boot: Puzzle | undefined
    const lastId = readLastPuzzle()
    if (lastId) boot = findPuzzle(lastId)
    if (!boot) boot = sortedLibrary()[0]
    if (boot) selectPuzzle(boot)
    else setStatus('没有可用题面。', 'bad')
    if (storeInProject()) {
      const el = $('#status')
      el.textContent += `（题库/进度：${storeLocationLabel()}）`
    }
  } catch (err) {
    setStatus(`初始化失败：${err instanceof Error ? err.message : String(err)}`, 'bad')
  }
})()

// 告知 index.html 的兜底脚本：应用已就绪；同时清掉自动刷新用的 _r 参数
app.setAttribute('data-booted', '1')
try {
  const url = new URL(location.href)
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
} catch {
  /* URL 不可用时忽略 */
}

// 便于调试
;(window as unknown as { __haitai: unknown }).__haitai = {
  validate,
  getReferenceSolution,
  getSession: () => session,
  puzzles: library,
  planLogicSolve,
  runLogicSolver,
  stopLogic,
  loadSavedPuzzles,
  countSolutions,
  recognizePuzzle,
}
