import { useState } from 'react'
import { getDoc } from 'firebase/firestore'
import { Link, useNavigate } from 'react-router-dom'
import { DEFAULT_CODE, ensureDefaultGame, gameRef, lastCode, normalizeCode, saveLastCode } from '../lib/game'
import { sounds } from '../lib/sound'
import { ANSWER_STYLES, Shape } from './AnswerTile'
import { FunBackground } from './Fun'
import { MuteButton } from './Extras'
import PracticeGame from './PracticeGame'

export default function Home() {
  const [code, setCode] = useState(lastCode)
  const [practice, setPractice] = useState(false)
  const [problem, setProblem] = useState(null)
  const [checking, setChecking] = useState(false)
  const navigate = useNavigate()

  if (practice) return <PracticeGame onExit={() => setPractice(false)} />

  const join = async (e) => {
    e.preventDefault()
    const c = normalizeCode(code)
    if (!c) return
    setChecking(true)
    setProblem(null)
    try {
      if (c === DEFAULT_CODE) await ensureDefaultGame()
      if (!(await getDoc(gameRef(c))).exists()) {
        setProblem(`No game found with code ${c}. Please check the code on the big screen.`)
        return
      }
      sounds.join()
      saveLastCode(c)
      navigate(`/play/${c}`)
    } catch (err) {
      setProblem(err.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white">
      <FunBackground />
      <div className="fixed left-3 top-3 z-20">
        <MuteButton />
      </div>
      <Link
        to={`/host/${normalizeCode(code) || DEFAULT_CODE}`}
        className="fixed right-3 top-3 z-20 rounded-full bg-amber-400 px-4 py-2 text-base font-bold text-indigo-950 shadow-lg hover:brightness-110"
      >
        👑 I'm the host
      </Link>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <div className="animate-bob">
          <div className="grid h-28 w-28 animate-pop-in grid-cols-2 overflow-hidden rounded-2xl shadow-2xl ring-4 ring-white/30">
            {ANSWER_STYLES.map((s, i) => (
              <div key={s.name} className={`bg-gradient-to-br ${s.grad} flex items-center justify-center`}>
                <Shape shape={s.shape} className="h-8 w-8 animate-wiggle" style={{ animationDelay: `${i * 0.3}s` }} />
              </div>
            ))}
          </div>
        </div>
        <h1 className="text-outline mt-5 animate-bounce-in text-5xl font-bold tracking-wider">EMILYADA</h1>

        <form onSubmit={join} className="mt-8 flex w-full animate-slide-up flex-col gap-3">
          <label className="text-xl font-semibold">Game code:</label>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setProblem(null)
            }}
            maxLength={8}
            autoCapitalize="characters"
            className="rounded-2xl bg-white px-4 py-4 text-center font-mono text-4xl font-bold tracking-[0.3em] text-indigo-950 shadow-lg outline-none ring-amber-400 focus:ring-4"
          />
          <p className="text-base text-white/70">The code is shown on the big screen.</p>
          <button
            type="submit"
            disabled={!normalizeCode(code) || checking}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 py-4 text-2xl font-bold text-indigo-950 shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1 disabled:opacity-40"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/50 blur-md" />
            {checking ? 'Checking…' : 'Join game 🚀'}
          </button>
        </form>
        {problem && <p className="mt-3 animate-shake rounded-xl bg-red-600/90 px-3 py-2 text-lg">{problem}</p>}

        <div className="mt-6 grid w-full animate-slide-up grid-cols-2 gap-3" style={{ animationDelay: '0.2s' }}>
          <button
            onClick={() => setPractice(true)}
            className="rounded-2xl border-4 border-amber-300 bg-white/5 py-4 text-xl font-bold text-amber-300 active:translate-y-1"
          >
            🎮 Demo game
          </button>
          <Link
            to="/create"
            className="rounded-2xl border-4 border-green-300 bg-white/5 py-4 text-xl font-bold text-green-300 active:translate-y-1"
          >
            ✨ Create your own game
          </Link>
        </div>
        <p className="mt-2 text-base text-white/60">Demo = practice, nothing counts</p>
      </div>
    </div>
  )
}
