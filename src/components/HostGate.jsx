import { useState } from 'react'
import { FunBackground } from './Fun'

const HOST_PIN = import.meta.env.VITE_HOST_PIN ?? ''
const SESSION_KEY = 'bar-trivia-host-ok'

// Simple PIN screen in front of /host so players can't open the controls.
export default function HostGate({ children }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem(SESSION_KEY) === HOST_PIN && HOST_PIN !== '')
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)

  if (ok) return children

  const submit = (e) => {
    e.preventDefault()
    if (HOST_PIN && pin.trim() === HOST_PIN) {
      sessionStorage.setItem(SESSION_KEY, HOST_PIN)
      setOk(true)
    } else {
      setWrong(true)
      setPin('')
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white">
      <FunBackground />
      <div className="relative z-10 flex w-full flex-col items-center">
      <p className="animate-bounce text-6xl">👑</p>
      <h1 className="text-outline animate-pop-in text-5xl font-bold tracking-wider">BAR TRIVIA</h1>
      <p className="mb-8 mt-2 text-xl font-bold text-amber-300">Host login</p>
      {!HOST_PIN ? (
        <p className="max-w-sm rounded-xl bg-red-600/80 px-4 py-3">
          No host key set. Add <code className="font-mono">VITE_HOST_PIN=yourkey</code> to <code>.env</code> and restart{' '}
          <code>npm run dev</code>.
        </p>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setWrong(false)
            }}
            placeholder="Host key"
            autoFocus
            className="rounded-xl bg-white px-4 py-4 text-center text-2xl font-bold text-indigo-950 outline-none ring-amber-400 focus:ring-4"
          />
          <button
            type="submit"
            disabled={!pin}
            className="rounded-xl bg-amber-400 py-4 text-2xl font-bold text-indigo-950 shadow-[0_5px_0_rgba(0,0,0,0.3)] active:translate-y-1 disabled:opacity-40"
          >
            Enter
          </button>
          {wrong && <p className="rounded-lg bg-red-600/80 px-3 py-2">Wrong key, try again.</p>}
        </form>
      )}
      </div>
    </div>
  )
}
