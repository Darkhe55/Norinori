/**
 * 随机连续分区（海苔题板生成 / 自定义编辑器共用）。
 * 保证：
 * - 全部格子有归属；
 * - 每个区域连通；
 * - 每个区域至少 2 格（长不出来的单格并入邻区）。
 * 返回紧凑编号（0..R-1）的区域数组；失败返回 null。
 */

/** 确定性随机数（mulberry32），保证生成可复现 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomRegions(
  w: number,
  h: number,
  rng: () => number,
  minSize: number,
  maxSize: number,
): number[] | null {
  const n = w * h
  const id = new Int32Array(n).fill(-1)
  const seeds = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[seeds[i], seeds[j]] = [seeds[j]!, seeds[i]!]
  }
  let next = 0
  for (const s of seeds) {
    if (id[s] !== -1) continue
    const target = minSize + Math.floor(rng() * (maxSize - minSize + 1))
    id[s] = next
    let size = 1
    const frontier = [s]
    while (size < target) {
      const cands: number[] = []
      for (const c of frontier) {
        const cx = c % w
        const cy = (c / w) | 0
        if (cx > 0 && id[c - 1] === -1) cands.push(c - 1)
        if (cx < w - 1 && id[c + 1] === -1) cands.push(c + 1)
        if (cy > 0 && id[c - w] === -1) cands.push(c - w)
        if (cy < h - 1 && id[c + w] === -1) cands.push(c + w)
      }
      if (!cands.length) break
      const pick = cands[Math.floor(rng() * cands.length)]!
      id[pick] = next
      frontier.push(pick)
      size++
    }
    if (size < 2) {
      // 单格区：并入一个相邻区域（编号作废，稍后压缩）
      const cx = s % w
      const cy = (s / w) | 0
      const nbs: number[] = []
      if (cx > 0 && id[s - 1] !== -1 && id[s - 1] !== next) nbs.push(s - 1)
      if (cx < w - 1 && id[s + 1] !== -1 && id[s + 1] !== next) nbs.push(s + 1)
      if (cy > 0 && id[s - w] !== -1 && id[s - w] !== next) nbs.push(s - w)
      if (cy < h - 1 && id[s + w] !== -1 && id[s + w] !== next) nbs.push(s + w)
      if (!nbs.length) return null
      id[s] = id[nbs[Math.floor(rng() * nbs.length)]!]!
    } else {
      next++
    }
  }
  // 压缩编号
  const map = new Map<number, number>()
  const out: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const r = id[i]!
    if (!map.has(r)) map.set(r, map.size)
    out[i] = map.get(r)!
  }
  return out
}
