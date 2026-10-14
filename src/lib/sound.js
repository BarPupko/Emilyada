// Tiny synthesized sound effects (Web Audio) — no audio files needed.
const MUTE_KEY = 'bar-trivia-muted'
let ctx = null
let muted = localStorage.getItem(MUTE_KEY) === '1'
const listeners = new Set()

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Browsers only allow sound after a tap; unlock on the first one.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => audio(), { once: true })
}

function tone(freq, start, dur, { type = 'sine', vol = 0.18, slide } = {}) {
  const a = audio()
  if (!a || muted) return
  const t0 = a.currentTime + start
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

export const sounds = {
  tap: () => tone(660, 0, 0.08, { type: 'triangle', vol: 0.15 }),
  tick: () => tone(1000, 0, 0.05, { type: 'square', vol: 0.06 }),
  pop: () => tone(500, 0, 0.12, { type: 'sine', vol: 0.2, slide: 1100 }),
  join: () => {
    tone(523, 0, 0.12, { type: 'triangle' })
    tone(784, 0.1, 0.18, { type: 'triangle' })
  },
  start: () => [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.2, { type: 'triangle' })),
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.25, { type: 'triangle', vol: 0.2 })),
  wrong: () => {
    tone(330, 0, 0.25, { type: 'sawtooth', vol: 0.08, slide: 200 })
    tone(220, 0.22, 0.35, { type: 'sawtooth', vol: 0.08, slide: 140 })
  },
  fanfare: () =>
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) =>
      tone(f, [0, 0.12, 0.24, 0.4, 0.55, 0.75, 0.9, 1.05][i], 0.3, { type: 'triangle', vol: 0.2 }),
    ),
}

let clip = null
/** Plays a recorded/uploaded sound (data URL). Returns false when there's none, so callers can fall back. */
export function playClip(src) {
  if (!src) return false
  if (muted) return true
  clip?.pause()
  clip = new Audio(src)
  clip.play().catch(() => {})
  return true
}

export const isMuted = () => muted
export function setMuted(m) {
  muted = m
  localStorage.setItem(MUTE_KEY, m ? '1' : '0')
  listeners.forEach((fn) => fn(m))
}
export function onMuteChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
