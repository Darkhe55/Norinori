/**
 * 音效（Web Audio 合成，无外部资源）：
 * - 落黑（贴上海苔）：低频拨弦 + 一点木质敲击感
 * - 涂白：水滴涟漪（音高下落 + 噪声水花）
 * pitchStep：连拍数 n 对应的音高抬升（半音）
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.28
    master.connect(ctx.destination)
  }
  return ctx
}

export function setMuted(m: boolean): void {
  muted = m
  if (master) master.gain.value = m ? 0 : 0.28
}

export function isMuted(): boolean {
  return muted
}

export function resumeAudio(): void {
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
}

/** 连拍数 n → 半音偏移（1=0, 2=+2, 3=+4 …） */
function semitoneForStreak(n: number): number {
  const k = Math.max(1, Math.min(n, 12)) - 1
  return k * 2
}

function mul(semi: number): number {
  return Math.pow(2, semi / 12)
}

/** 贴上海苔：低频拨弦（衰减正弦 + 三角波轻微失谐） */
export function playPlace(streak = 1): void {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  const k = mul(semitoneForStreak(streak))

  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(210 * k, t)
  osc.frequency.exponentialRampToValueAtTime(96 * k, t + 0.16)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + 0.3)

  // 敲击感：短噪声一瞬
  const noise = c.createBufferSource()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  noise.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1400 * k
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.22, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  noise.connect(bp)
  bp.connect(ng)
  ng.connect(master)
  noise.start(t)
  noise.stop(t + 0.06)
}

/** 水滴：音高快速下落 + 轻微噪声水花 */
export function playDrop(streak = 1): void {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  const k = mul(semitoneForStreak(streak))

  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(920 * k, t)
  osc.frequency.exponentialRampToValueAtTime(280 * k, t + 0.14)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + 0.28)

  const noise = c.createBufferSource()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.18), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  noise.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'bandpass'
  hp.frequency.value = 1800 * k
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.18, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  noise.connect(hp)
  hp.connect(ng)
  ng.connect(master)
  noise.start(t)
  noise.stop(t + 0.2)
}
