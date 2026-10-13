import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DEFAULT_CODE, ensureDefaultGame, normalizeCode } from '../lib/game'
import useGame from '../lib/useGame'
import { Dots, FunBackground } from './Fun'

const sessionKey = (code) => `bar-trivia-host-${code}`
export const rememberHost = (code, key) => sessionStorage.setItem(sessionKey(code), key)

// Key screen in front of /host/:code. Each game has its own host key.
// (Client-side only — it keeps players out of the controls; it is not real security.)
export default function HostGate({ children }) {
  const code = normalizeCode(useParams().code)
  const { game } = useGame(code)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [ok, setOk] = useState(false)
  const [otherCode, setOtherCode] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (code === DEFAULT_CODE) ensureDefaultGame().catch(() => {})
  }, [code])

  useEffect(() => {
    if (game?.hostKey) setOk(sessionStorage.getItem(sessionKey(code)) === game.hostKey)
  }, [game?.hostKey, code])

  if (ok) return children

  const submit = (e) => {
    e.preventDefault()
    if (pin.trim() === game?.hostKey) {
      rememberHost(code, game.hostKey)
      setOk(true)
    } else {
      setWrong(true)
      setPin('')
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white">
      <FunBackground />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <p className="animate-bounce text-6xl">👑</p>
        <h1 className="text-outline animate-pop-in text-5xl font-bold tracking-wider">EMILYADA</h1>
        <p className="mt-2 text-xl font-semibold text-amber-300">Host login</p>

        {game === undefined && (
          <p className="mt-8 text-xl">
            Loading <Dots />
          </p>
        )}

        {game === null && (
          <div className="mt-8 rounded-2xl bg-white/10 p-5 text-xl">
            There is no game with code <b>{code}</b>.
            <Link to="/" className="mt-4 block rounded-xl bg-amber-400 py-3 font-bold text-indigo-950">
              ← Home
            </Link>
          </div>
        )}

        {game && (
          <>
            <p className="mb-6 mt-4 rounded-2xl bg-white/10 px-4 py-2 text-lg">
              Game <b className="font-mono text-2xl">{code}</b> · {game.title}
            </p>
            <form onSubmit={submit} className={`flex w-full flex-col gap-3 ${wrong ? 'animate-shake' : ''}`}>
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value)
                  setWrong(false)
                }}
                placeholder="Host key"
                autoFocus
                className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-bold text-indigo-950 outline-none ring-amber-400 focus:ring-4"
              />
              <button
                type="submit"
                disabled={!pin}
                className="rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 py-4 text-2xl font-bold text-indigo-950 shadow-[0_5px_0_rgba(0,0,0,0.3)] active:translate-y-1 disabled:opacity-40"
              >
                Enter
              </button>
              {wrong && <p className="rounded-lg bg-red-600/80 px-3 py-2">Wrong key, try again.</p>}
            </form>
          </>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const c = normalizeCode(otherCode)
            if (c) navigate(`/host/${c}`)
          }}
          className="mt-10 flex w-full gap-2 text-base"
        >
          <input
            value={otherCode}
            onChange={(e) => setOtherCode(e.target.value)}
            placeholder="Host a different game code"
            className="min-w-0 flex-1 rounded-xl bg-white/15 px-3 py-2 text-center uppercase placeholder:normal-case placeholder:text-white/50"
          />
          <button className="rounded-xl bg-white/20 px-4 font-bold">Go</button>
        </form>
        <Link to="/" className="mt-4 text-white/70 underline">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
