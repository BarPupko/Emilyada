import { useEffect, useState } from 'react'
import { deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { historyCol, normalizeCode } from '../lib/game'
import { Dots, FunBackground } from './Fun'
import Leaderboard from './Leaderboard'

const MEDALS = ['🥇', '🥈', '🥉']

// Host page: every finished game's final scoreboard, newest first.
export default function GameHistory() {
  const code = normalizeCode(useParams().code)
  const [games, setGames] = useState(undefined)
  const [open, setOpen] = useState(null)

  useEffect(
    () =>
      onSnapshot(
        query(historyCol(code), orderBy('finishedAt', 'desc')),
        (s) => setGames(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setGames([]),
      ),
    [code],
  )

  const remove = (g) => {
    if (confirm(`Delete the saved scores from ${when(g)}?`)) deleteDoc(doc(historyCol(code), g.id))
  }

  return (
    <div className="relative min-h-dvh text-white">
      <FunBackground />
      <header className="relative z-10 flex flex-wrap items-center gap-3 bg-black/20 px-6 py-3 backdrop-blur">
        <Link to={`/host/${code}`} className="rounded-xl bg-white px-4 py-2 text-lg font-bold text-indigo-950 hover:brightness-95">
          ← Back to the game
        </Link>
        <h1 className="text-outline text-3xl font-bold">📜 Saved games &amp; scores</h1>
        <span className="ml-auto rounded-full bg-white px-3 py-1 font-mono text-lg font-bold text-indigo-950">#{code}</span>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 py-6">
        <p className="mb-6 rounded-2xl bg-white/15 p-4 text-xl">
          Every time you finish a game (press <b>Final results 🏆</b>), the scores are saved here automatically. Demo rounds are not saved.
        </p>
        {games === undefined && (
          <p className="text-center text-2xl">
            Loading <Dots />
          </p>
        )}
        {games?.length === 0 && <p className="text-center text-2xl text-indigo-100">No finished games yet.</p>}
        {games?.map((g) => (
          <section key={g.id} className="mb-5 animate-slide-up rounded-3xl bg-white/10 p-5 shadow-xl backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{g.title}</h2>
                <p className="text-indigo-200">
                  {when(g)} · {g.players.length} players · {g.questionCount} questions
                </p>
              </div>
              <button onClick={() => setOpen(open === g.id ? null : g.id)} className="rounded-xl bg-amber-400 px-4 py-2 text-lg font-bold text-indigo-950">
                {open === g.id ? 'Hide' : 'All scores'}
              </button>
              <button onClick={() => remove(g)} title="Delete" className="rounded-xl bg-red-500/40 px-3 py-2 text-lg hover:bg-red-500/60">
                🗑️
              </button>
            </div>
            {open === g.id ? (
              <div className="mt-4">
                <Leaderboard entries={g.players} limit={100} title="" />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {g.players.slice(0, 3).map((p, i) => (
                  <span key={i} className="rounded-full bg-white px-4 py-1 text-lg font-semibold text-indigo-950">
                    {MEDALS[i]} {p.avatar} {p.name} — {p.score}
                  </span>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  )
}

const when = (g) =>
  g.finishedAt?.toDate?.().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) ?? 'just now'
