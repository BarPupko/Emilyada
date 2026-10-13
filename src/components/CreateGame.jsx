import { useState } from 'react'
import { getDocs, orderBy, query } from 'firebase/firestore'
import { Link, useNavigate } from 'react-router-dom'
import {
  DEFAULT_CODE,
  DEFAULT_TIME_SEC,
  PRACTICE_QUESTIONS,
  SEED_QUESTIONS,
  createGame,
  ensureDefaultGame,
  newGameCode,
  questionsCol,
  saveLastCode,
} from '../lib/game'
import { sounds } from '../lib/sound'
import { Confetti, FunBackground } from './Fun'
import { rememberHost } from './HostGate'

const STARTERS = [
  { id: 'blank', emoji: '📝', title: 'Start empty', text: "I'll write my own questions" },
  { id: 'easy', emoji: '🐮', title: 'Easy sample questions', text: '5 simple questions to get started' },
  { id: 'emily', emoji: '🎂', title: 'Copy the Emily quiz', text: 'All the Emily questions — then change them' },
]

const TIMES = [10, 20, 30, 60]

export default function CreateGame() {
  const [title, setTitle] = useState('')
  const [hostKey, setHostKey] = useState(() => String(1000 + Math.floor(Math.random() * 9000)))
  const [starter, setStarter] = useState('blank')
  const [time, setTime] = useState(DEFAULT_TIME_SEC)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [created, setCreated] = useState(null) // { code }
  const navigate = useNavigate()

  const create = async () => {
    if (!title.trim()) return setProblem('Step 1: please give your game a name.')
    if (hostKey.trim().length < 4) return setProblem('Step 2: the host key needs at least 4 letters or numbers.')
    setBusy(true)
    setProblem(null)
    try {
      let questions = []
      if (starter === 'easy') questions = PRACTICE_QUESTIONS
      if (starter === 'emily') {
        await ensureDefaultGame()
        const snap = await getDocs(query(questionsCol(DEFAULT_CODE), orderBy('order')))
        questions = snap.empty ? SEED_QUESTIONS : snap.docs.map((d) => d.data())
      }
      const code = await newGameCode()
      await createGame({ code, title: title.trim(), hostKey: hostKey.trim(), questionTimeSec: time, questions })
      rememberHost(code, hostKey.trim())
      saveLastCode(code)
      sounds.fanfare()
      setCreated({ code, empty: questions.length === 0 })
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white">
        <FunBackground />
        <Confetti count={120} />
        <div className="relative z-10 flex w-full max-w-md flex-col items-center">
          <p className="animate-bounce-in text-7xl">🎉</p>
          <h1 className="text-outline mt-2 text-4xl font-bold">Your game is ready!</h1>
          <p className="mt-6 text-xl">Your game code is:</p>
          <p className="mt-2 animate-pop-in rounded-3xl bg-white px-8 py-4 font-mono text-6xl font-bold tracking-[0.2em] text-indigo-950 shadow-2xl">
            {created.code}
          </p>
          <div className="mt-6 w-full rounded-2xl bg-amber-300 p-4 text-left text-lg text-indigo-950">
            <b>✍️ Write these down:</b>
            <br />
            Game code: <b className="font-mono">{created.code}</b> — players type this to join
            <br />
            Host key: <b className="font-mono">{hostKey}</b> — only for you, to control the game
          </div>
          <div className="mt-6 flex w-full flex-col gap-3">
            <button
              onClick={() => navigate(`/host/${created.code}/edit`)}
              className="rounded-2xl bg-green-500 py-4 text-2xl font-bold shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1"
            >
              {created.empty ? '✏️ Write my questions' : '✏️ Look at / change the questions'}
            </button>
            <button
              onClick={() => navigate(`/host/${created.code}`)}
              className="rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 py-4 text-2xl font-bold text-indigo-950 shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1"
            >
              👑 Go to the host screen
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-40 text-slate-900">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-indigo-950 px-4 py-4 text-white shadow">
        <Link to="/" className="rounded-xl bg-white/15 px-4 py-3 text-lg font-bold">
          ← Back
        </Link>
        <h1 className="flex-1 text-center text-2xl font-bold">✨ Create your own game</h1>
        <span className="w-20" />
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-4">
        <Step n={1} title="Give your game a name">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="For example: Grandma's Birthday Quiz"
            className="w-full rounded-xl border-2 border-slate-300 p-4 text-xl outline-none focus:border-indigo-600"
          />
        </Step>

        <Step n={2} title="Choose a secret host key">
          <p className="mb-3 text-lg text-slate-600">You type this to control the game. Don't show it to players!</p>
          <input
            value={hostKey}
            onChange={(e) => setHostKey(e.target.value)}
            maxLength={20}
            className="w-full rounded-xl border-2 border-slate-300 p-4 text-center font-mono text-3xl font-bold tracking-widest outline-none focus:border-indigo-600"
          />
        </Step>

        <Step n={3} title="How do you want to start?">
          <div className="space-y-3">
            {STARTERS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStarter(s.id)}
                className={`flex w-full items-center gap-4 rounded-2xl border-4 p-4 text-left transition ${
                  starter === s.id ? 'scale-[1.02] border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'
                }`}
              >
                <span className="text-5xl">{s.emoji}</span>
                <span className="flex-1">
                  <span className="block text-xl font-bold">{s.title}</span>
                  <span className="text-lg text-slate-600">{s.text}</span>
                </span>
                {starter === s.id && <span className="text-3xl text-indigo-600">✓</span>}
              </button>
            ))}
          </div>
        </Step>

        <Step n={4} title="How long to answer each question?">
          <div className="grid grid-cols-4 gap-3">
            {TIMES.map((t) => (
              <button
                key={t}
                onClick={() => setTime(t)}
                className={`rounded-2xl border-4 py-4 text-2xl font-bold transition ${
                  time === t ? 'scale-105 border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white'
                }`}
              >
                {t}s
              </button>
            ))}
          </div>
          <p className="mt-3 text-lg text-slate-600">Tip: choose 30 or 60 seconds for younger kids or grandparents.</p>
        </Step>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white p-4 shadow-2xl">
        <div className="mx-auto max-w-2xl">
          {problem && <p className="mb-3 animate-shake rounded-xl bg-red-600 px-4 py-3 text-center text-lg font-bold text-white">{problem}</p>}
          <button
            onClick={create}
            disabled={busy}
            className="w-full rounded-2xl bg-green-600 py-5 text-2xl font-bold text-white shadow-[0_6px_0_rgba(0,0,0,0.25)] active:translate-y-1 disabled:opacity-50"
          >
            {busy ? 'Creating…' : '🎉 Create my game'}
          </button>
        </div>
      </footer>
    </div>
  )
}

export function Step({ n, title, children }) {
  return (
    <section className="animate-slide-up rounded-2xl bg-white p-5 shadow" style={{ animationDelay: `${n * 80}ms` }}>
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-950 text-lg text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
