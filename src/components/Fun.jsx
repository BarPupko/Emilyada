import { useMemo } from 'react'
import { Shape } from './AnswerTile'

// Shared eye-candy: floating background shapes, confetti, timer bar.

const FLOAT_SHAPES = ['triangle', 'diamond', 'circle', 'square']
const FLOAT_COLORS = ['fill-red-400', 'fill-blue-400', 'fill-amber-300', 'fill-green-400', 'fill-pink-400', 'fill-purple-300']

// Fixed pseudo-random layout so it doesn't jump around on re-render.
const FLOATERS = Array.from({ length: 16 }, (_, i) => ({
  shape: FLOAT_SHAPES[i % 4],
  color: FLOAT_COLORS[(i * 5) % FLOAT_COLORS.length],
  left: (i * 41 + 7) % 100,
  size: 22 + ((i * 17) % 46),
  duration: 13 + ((i * 7) % 15),
  delay: -((i * 3.7) % 26),
}))

const STARS = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 53 + 11) % 100,
  top: (i * 37 + 5) % 100,
  delay: (i * 0.37) % 2.5,
  size: 6 + ((i * 3) % 8),
}))

export function FunBackground({ className = 'fun-bg' }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-0 overflow-hidden ${className}`}>
      {STARS.map((s, i) => (
        <span
          key={`s${i}`}
          className="absolute animate-twinkle rounded-full bg-white"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
      {FLOATERS.map((f, i) => (
        <div
          key={i}
          className="absolute -bottom-24 animate-float-up opacity-30"
          style={{ left: `${f.left}%`, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }}
        >
          <Shape shape={f.shape} fill={f.color} style={{ width: f.size, height: f.size }} />
        </div>
      ))}
    </div>
  )
}

const CONFETTI_COLORS = ['#ef4444', '#3b82f6', '#fbbf24', '#22c55e', '#ec4899', '#a855f7', '#ffffff']

export function Confetti({ count = 90 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.4 + Math.random() * 2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 7 + Math.random() * 9,
        round: Math.random() > 0.65,
        drift: (Math.random() - 0.5) * 240,
      })),
    [count],
  )
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 animate-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.7,
            background: p.color,
            borderRadius: p.round ? 9999 : 3,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}

// Shrinking bar that goes green → yellow → red, with a pulsing number at the end.
export function TimerBar({ remaining, total }) {
  const left = remaining ?? total
  const pct = (left / total) * 100
  const secs = Math.ceil(left / 1000)
  const color = pct > 50 ? 'bg-green-400' : pct > 25 ? 'bg-amber-400' : 'bg-red-500'
  const hurry = secs <= 5

  return (
    <div className="flex items-center gap-3">
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-black/30 ring-2 ring-white/20">
        <div className={`h-full rounded-full ${color} transition-[width] duration-100 ease-linear`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-bold tabular-nums shadow-lg ${
          hurry ? 'animate-heartbeat bg-red-500' : 'bg-purple-600'
        }`}
      >
        {secs}
      </span>
    </div>
  )
}

export function Dots() {
  return (
    <span className="inline-flex gap-1 align-middle">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}
