import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { REACTIONS } from '../lib/game'
import { isMuted, onMuteChange, setMuted, sounds } from '../lib/sound'

export function MuteButton({ className = '' }) {
  const [muted, setM] = useState(isMuted)
  useEffect(() => onMuteChange(setM), [])
  return (
    <button
      onClick={() => setMuted(!muted)}
      title={muted ? 'Turn sound on' : 'Turn sound off'}
      className={`rounded-full bg-white/15 px-3 py-1 text-xl hover:bg-white/25 ${className}`}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

/** Row of emoji buttons on the phone. Limits to one reaction per 700ms. */
export function ReactionBar({ onReact, compact = false }) {
  const last = useRef(0)
  const [burst, setBurst] = useState(null)

  const tap = (emoji) => {
    const now = Date.now()
    if (now - last.current < 700) return
    last.current = now
    sounds.pop()
    navigator.vibrate?.(15)
    setBurst({ emoji, key: now })
    onReact(emoji)
  }

  return (
    <div className="relative w-full">
      {!compact && <p className="mb-1 text-center text-sm text-white/70">Send a reaction to the big screen:</p>}
      <div className="flex justify-center gap-1.5">
        {REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => tap(e)}
            className={`rounded-full bg-white/15 shadow transition active:scale-75 ${compact ? 'h-10 w-10 text-2xl' : 'h-12 w-12 text-3xl'}`}
          >
            {e}
          </button>
        ))}
      </div>
      {burst && (
        <span key={burst.key} className="pointer-events-none absolute -top-6 left-1/2 animate-rise-small text-4xl">
          {burst.emoji}
        </span>
      )}
    </div>
  )
}

/**
 * Watches players' `reaction` fields and floats new ones up the big screen with the
 * player's name. Ignores reactions that existed before the screen loaded.
 */
export function FloatingReactions({ players }) {
  const seen = useRef(null)
  const [items, setItems] = useState([])

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Map(players.map((p) => [p.id, p.reaction?.at ?? 0]))
      return
    }
    const fresh = []
    for (const p of players) {
      const at = p.reaction?.at ?? 0
      if (at > (seen.current.get(p.id) ?? 0)) {
        seen.current.set(p.id, at)
        fresh.push({ id: `${p.id}-${at}`, emoji: p.reaction.emoji, name: p.name, left: 4 + Math.random() * 84 })
      }
    }
    if (!fresh.length) return
    sounds.pop()
    setItems((cur) => [...cur.slice(-30), ...fresh])
    const ids = new Set(fresh.map((f) => f.id))
    setTimeout(() => setItems((cur) => cur.filter((x) => !ids.has(x.id))), 4200)
  }, [players])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {items.map((it) => (
        <div key={it.id} className="absolute bottom-0 flex animate-rise flex-col items-center" style={{ left: `${it.left}%` }}>
          <span className="text-7xl drop-shadow-lg">{it.emoji}</span>
          <span className="mt-1 rounded-full bg-white px-3 py-0.5 text-lg font-bold text-indigo-950 shadow-lg">{it.name}</span>
        </div>
      ))}
    </div>
  )
}

export function QrCode({ url, size = 220 }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    QRCode.toDataURL(url, { width: size * 2, margin: 1, color: { dark: '#1e1b4b', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(null))
  }, [url, size])
  if (!src) return null
  return <img src={src} alt={`QR code for ${url}`} width={size} height={size} className="rounded-2xl bg-white p-2 shadow-2xl" />
}
