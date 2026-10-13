import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDoc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase'
import {
  LOBBY_STATE,
  STATUS,
  answerFor,
  gameRef,
  normalizeCode,
  playerRef,
  playersCol,
  pointsFor,
  scoreField,
  timeMs,
} from '../lib/game'
import { sounds } from '../lib/sound'
import useCountdown from '../lib/useCountdown'
import useGame from '../lib/useGame'
import useQuestions from '../lib/useQuestions'
import AnswerTile, { ANSWER_STYLES, Shape } from './AnswerTile'
import { FloatingReactions, MuteButton, QrCode } from './Extras'
import { Confetti, Dots, FunBackground, TimerBar } from './Fun'
import Leaderboard from './Leaderboard'

export default function HostController() {
  const code = normalizeCode(useParams().code)
  const { game, error: gameError } = useGame(code)
  const { questions, loaded: questionsLoaded } = useQuestions(code)
  const [players, setPlayers] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const revealedFor = useRef(-1)

  // Real-time listeners: one doc + one small collection. Firestore pushes deltas over a
  // single WebChannel stream, so updates land in well under 500ms even with ~50 players.
  useEffect(
    () =>
      onSnapshot(
        playersCol(code),
        (s) => setPlayers(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (e) => setError(e.message),
      ),
    [code],
  )

  const status = game?.status
  const idx = game?.currentQuestionIndex ?? 0
  const question = questions[idx]
  const total = timeMs(game)
  const remaining = useCountdown(status === STATUS.ACTIVE ? game.questionStartedAtMs : null, total)
  const answeredCount = players.filter((p) => answerFor(p, idx)).length
  const field = scoreField(game)
  const ranked = useMemo(
    () => players.map((p) => ({ ...p, score: p[field] ?? 0 })).sort((a, b) => b.score - a.score),
    [players, field],
  )

  // ---- sound effects ----
  const secsLeft = remaining == null ? null : Math.ceil(remaining / 1000)
  useEffect(() => {
    if (secsLeft != null && secsLeft > 0 && secsLeft <= 5) sounds.tick()
  }, [secsLeft])
  useEffect(() => {
    if (status === STATUS.ACTIVE) sounds.start()
    if (status === STATUS.REVEAL) sounds.correct()
    if (status === STATUS.FINISHED) sounds.fanfare()
  }, [status, idx])
  const playerCount = players.length
  const prevCount = useRef(playerCount)
  useEffect(() => {
    if (status === STATUS.WAITING && playerCount > prevCount.current) sounds.join()
    prevCount.current = playerCount
  }, [playerCount, status])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const startQuestion = (i) => {
    revealedFor.current = -1
    return updateDoc(gameRef(code), {
      currentQuestionIndex: i,
      status: STATUS.ACTIVE,
      questionStartedAtMs: Date.now(),
      answerCounts: [0, 0, 0, 0],
      fastest: null,
    })
  }

  // Score everyone in a single atomic batch, then flip status to 'reveal'.
  const reveal = async () => {
    if (game.scoredIndex === idx || revealedFor.current === idx) return
    revealedFor.current = idx

    const counts = [0, 0, 0, 0]
    let fastest = null
    const results = players
      .map((p) => {
        const a = answerFor(p, idx)
        if (a) counts[a.choice]++
        const correct = !!a && a.choice === question.correctAnswerIndex
        if (correct && (!fastest || a.reactionMs < fastest.ms)) fastest = { name: p.name, ms: a.reactionMs }
        const points = a ? pointsFor(correct, a.reactionMs, total) : 0
        const streak = correct ? (p.streak ?? 0) + 1 : 0
        return { p, answered: !!a, correct, points, streak, score: (p[field] ?? 0) + points }
      })
      .sort((x, y) => y.score - x.score)

    const batch = writeBatch(db)
    results.forEach((r, i) =>
      batch.update(playerRef(code, r.p.id), {
        [field]: r.score,
        rank: i + 1,
        streak: r.streak,
        lastResult: { questionIndex: idx, answered: r.answered, correct: r.correct, points: r.points, streak: r.streak },
      }),
    )
    batch.update(gameRef(code), {
      status: STATUS.REVEAL,
      scoredIndex: idx,
      answerCounts: counts,
      playerCount: results.length,
      fastest,
      leaderboard: results.slice(0, 5).map((r) => ({ id: r.p.id, name: r.p.name, score: r.score, delta: r.points })),
    })

    try {
      await batch.commit()
    } catch (e) {
      revealedFor.current = -1
      throw e
    }
  }

  // Auto-reveal when the timer runs out or every player has answered.
  useEffect(() => {
    if (status !== STATUS.ACTIVE) return
    const everyoneAnswered = players.length > 0 && answeredCount >= players.length
    if (remaining === 0 || everyoneAnswered) run(reveal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, remaining === 0, answeredCount, players.length])

  // Clears every player's round data; `extra` resets a score field too.
  const resetPlayers = (batch, extra = {}) =>
    players.forEach((p) => batch.update(playerRef(code, p.id), { answer: null, lastResult: null, rank: null, streak: 0, ...extra }))

  const startGame = (demo) =>
    run(async () => {
      const batch = writeBatch(db)
      resetPlayers(batch, { [demo ? 'demoScore' : 'score']: 0 })
      batch.update(gameRef(code), { ...LOBBY_STATE, demo, status: STATUS.ACTIVE, questionStartedAtMs: Date.now() })
      revealedFor.current = -1
      await batch.commit()
    })

  const backToLobby = () =>
    run(async () => {
      const batch = writeBatch(db)
      resetPlayers(batch)
      batch.update(gameRef(code), LOBBY_STATE)
      revealedFor.current = -1
      await batch.commit()
    })

  const next = () =>
    run(() => (idx + 1 < questions.length ? startQuestion(idx + 1) : updateDoc(gameRef(code), { status: STATUS.FINISHED })))

  const resetGame = (removePlayers) => {
    const msg = removePlayers ? 'Remove ALL players and reset the game?' : 'Reset all scores and go back to the lobby?'
    if (!confirm(msg)) return
    run(async () => {
      const batch = writeBatch(db)
      if (removePlayers) players.forEach((p) => batch.delete(playerRef(code, p.id)))
      else resetPlayers(batch, { score: 0 })
      batch.update(gameRef(code), LOBBY_STATE)
      await batch.commit()
      revealedFor.current = -1
    })
  }

  const kick = (id) => run(() => deleteDoc(playerRef(code, id)))

  if (!game) {
    return (
      <Screen>
        <p className="text-2xl">
          Getting the game ready <Dots />
        </p>
        <ErrorBox error={error ?? gameError} />
      </Screen>
    )
  }

  const joinUrl = `${window.location.origin}${import.meta.env.BASE_URL}play/${code}`
  const noQuestions = questionsLoaded && questions.length === 0

  return (
    <div className="relative min-h-dvh overflow-hidden text-white">
      <FunBackground />
      <FloatingReactions players={players} />
      <header className="relative z-10 flex flex-wrap items-center gap-3 bg-black/20 px-6 py-3 backdrop-blur">
        <Link to="/" className="text-outline text-2xl font-bold tracking-wider">
          EMILYADA
        </Link>
        <span className="text-indigo-200">{game.title}</span>
        <span className="rounded-full bg-white px-3 py-1 font-mono text-lg font-bold text-indigo-950">#{code}</span>
        {game.demo && (
          <span className="animate-pulse rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-indigo-950">
            DEMO — points don&apos;t count
          </span>
        )}
        <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-sm">👥 {players.length} players</span>
        {status !== STATUS.WAITING && status !== STATUS.FINISHED && (
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
            Question {idx + 1} / {questions.length}
          </span>
        )}
        {game.demo && status !== STATUS.WAITING && (
          <button onClick={backToLobby} disabled={busy} className="rounded-lg bg-amber-400 px-3 py-1 text-sm font-bold text-indigo-950 hover:brightness-110">
            End demo
          </button>
        )}
        {(status === STATUS.WAITING || status === STATUS.FINISHED) && (
          <Link to={`/host/${code}/edit`} className="rounded-lg bg-green-500 px-3 py-1 text-sm font-bold hover:brightness-110">
            ✏️ Edit questions &amp; pictures
          </Link>
        )}
        <button onClick={() => resetGame(false)} disabled={busy} className="rounded-lg bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
          Reset scores
        </button>
        <button onClick={() => resetGame(true)} disabled={busy} className="rounded-lg bg-red-500/40 px-3 py-1 text-sm hover:bg-red-500/60">
          Clear players
        </button>
        <MuteButton />
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <ErrorBox error={error ?? gameError} />

        {status === STATUS.WAITING && (
          <div className="flex flex-col items-center text-center">
            <Title title={game.title} />
            <div className="mb-8 flex flex-wrap items-center justify-center gap-8">
              <div className="animate-pop-in">
                <QrCode url={joinUrl} />
                <p className="mt-2 text-lg text-indigo-100">📷 Scan to join</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-2xl text-indigo-100">📱 or go to</p>
                <p className="rounded-2xl bg-white/90 px-5 py-2 font-mono text-2xl font-bold text-indigo-950">{window.location.host + import.meta.env.BASE_URL.replace(/\/$/, '')}</p>
                <p className="mt-2 text-2xl text-indigo-100">and type the code</p>
                <p className="animate-bob rounded-3xl bg-white px-8 py-3 font-mono text-7xl font-bold tracking-[0.2em] text-indigo-950 shadow-2xl ring-8 ring-amber-300/60">
                  {code}
                </p>
              </div>
            </div>
            <div className="mb-10 flex min-h-24 max-w-4xl flex-wrap justify-center gap-3">
              {players.length === 0 && (
                <p className="text-2xl text-indigo-100">
                  Waiting for players <Dots />
                </p>
              )}
              {players.map((p, i) => (
                <span
                  key={p.id}
                  className={`flex animate-bounce-in items-center gap-2 rounded-full bg-gradient-to-br ${ANSWER_STYLES[i % 4].grad} px-5 py-2 text-2xl font-semibold shadow-lg`}
                >
                  {p.name}
                  <button onClick={() => kick(p.id)} title="Remove player" className="text-white/50 hover:text-white">
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {noQuestions ? (
              <Link to={`/host/${code}/edit`} className="rounded-2xl bg-green-500 px-10 py-4 text-2xl font-bold shadow-[0_6px_0_rgba(0,0,0,0.3)]">
                ✏️ Add some questions first
              </Link>
            ) : (
              <div className="flex flex-wrap justify-center gap-4">
                <BigButton onClick={() => startGame(false)} disabled={busy || players.length === 0 || !questions.length}>
                  Start game ▶
                </BigButton>
                <button
                  onClick={() => startGame(true)}
                  disabled={busy || players.length === 0 || !questions.length}
                  className="rounded-2xl border-4 border-amber-300 bg-white/5 px-8 py-3 text-2xl font-bold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-40"
                >
                  Try demo (no points)
                </button>
              </div>
            )}
            <p className="mt-4 text-indigo-200">
              {questions.length} questions · {game.questionTimeSec ?? 20} seconds each
            </p>
          </div>
        )}

        {status === STATUS.ACTIVE && question && (
          <div key={`active-${idx}`}>
            <QuestionHeader question={question} />
            <div className="mx-auto mb-8 flex max-w-4xl items-center gap-8">
              <div className="flex-1">
                <TimerBar remaining={remaining} total={total} />
              </div>
              <div className="text-center">
                <div key={answeredCount} className="animate-pop-in text-5xl font-bold tabular-nums">
                  {answeredCount}/{players.length}
                </div>
                <div className="text-indigo-100">answered</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {question.options.map((opt, i) => (
                <AnswerTile key={i} index={i} label={opt} image={question.optionImages?.[i]} size="lg" />
              ))}
            </div>
            <div className="mt-8 text-center">
              <BigButton onClick={() => run(reveal)} disabled={busy}>
                Reveal answer now
              </BigButton>
            </div>
          </div>
        )}

        {status === STATUS.REVEAL && question && (
          <div key={`reveal-${idx}`}>
            <QuestionHeader question={question} />
            {game.fastest && (
              <p className="mx-auto mb-6 w-fit animate-bounce-in rounded-full bg-gradient-to-r from-yellow-300 to-amber-500 px-6 py-2 text-2xl font-bold text-indigo-950 shadow-xl">
                ⚡ Fastest correct: {game.fastest.name} ({(game.fastest.ms / 1000).toFixed(1)}s)
              </p>
            )}
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:col-span-2">
                {question.options.map((opt, i) => (
                  <AnswerTile
                    key={i}
                    index={i}
                    label={opt}
                    image={question.optionImages?.[i]}
                    size="lg"
                    count={game.answerCounts?.[i] ?? 0}
                    state={i === question.correctAnswerIndex ? 'correct' : 'wrong'}
                  />
                ))}
              </div>
              <div>
                <Leaderboard entries={game.leaderboard ?? []} limit={5} title="Top 5" />
                <Streaks players={players} />
              </div>
            </div>
            <div className="mt-10 text-center">
              <BigButton onClick={next} disabled={busy}>
                {idx + 1 < questions.length ? 'Next question ▶' : 'Final results 🏆'}
              </BigButton>
            </div>
          </div>
        )}

        {status === STATUS.FINISHED && (
          <div className="mx-auto max-w-3xl">
            <Confetti count={160} />
            <Podium top={ranked.slice(0, 3)} />
            <Leaderboard entries={ranked} limit={50} title={game.demo ? 'Demo Results' : 'Final Results'} size="lg" />
            <div className="mt-10 text-center">
              <BigButton onClick={game.demo ? backToLobby : () => resetGame(false)} disabled={busy}>
                {game.demo ? 'Back to lobby' : 'Play again'}
              </BigButton>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// "On fire" list: players with 3+ correct answers in a row.
function Streaks({ players }) {
  const hot = players.filter((p) => (p.streak ?? 0) >= 3).sort((a, b) => b.streak - a.streak).slice(0, 4)
  if (!hot.length) return null
  return (
    <div className="mt-6 animate-slide-up rounded-2xl bg-white/10 p-4">
      <h3 className="mb-2 text-center text-xl font-bold">🔥 On fire!</h3>
      {hot.map((p) => (
        <p key={p.id} className="text-center text-lg">
          {p.name} — {p.streak} in a row
        </p>
      ))}
    </div>
  )
}

function Screen({ children }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white">
      <FunBackground />
      <div className="relative z-10 flex flex-col items-center">{children}</div>
    </div>
  )
}

function Title({ title }) {
  return (
    <>
      <div className="mb-4 flex gap-3">
        {ANSWER_STYLES.map((s, i) => (
          <div
            key={s.name}
            className={`flex h-16 w-16 animate-bob items-center justify-center rounded-2xl bg-gradient-to-br ${s.grad} shadow-xl`}
            style={{ animationDelay: `${i * 0.3}s` }}
          >
            <Shape shape={s.shape} className="h-9 w-9 animate-wiggle" />
          </div>
        ))}
      </div>
      <h1 className="text-outline animate-bounce-in text-7xl font-bold tracking-wider md:text-8xl">EMILYADA</h1>
      <p className="mb-8 mt-2 animate-slide-up text-3xl font-semibold text-amber-300">{title}</p>
    </>
  )
}

function QuestionHeader({ question }) {
  return (
    <>
      {question.image && (
        <img
          src={question.image}
          alt=""
          className="mx-auto mb-6 max-h-72 animate-bounce-in rounded-3xl object-contain shadow-2xl ring-8 ring-white/40"
        />
      )}
      <h2 className="mx-auto mb-8 max-w-5xl animate-pop-in rounded-3xl bg-white px-8 py-6 text-center text-4xl font-bold text-indigo-950 shadow-2xl">
        {question.text}
      </h2>
    </>
  )
}

// 2nd, 1st, 3rd — winner rises in last.
function Podium({ top }) {
  if (top.length === 0) return null
  const slots = [
    { p: top[1], place: 2, h: 'h-28', medal: '🥈', delay: '0.4s', grad: 'from-slate-200 to-slate-400' },
    { p: top[0], place: 1, h: 'h-40', medal: '👑', delay: '0.9s', grad: 'from-yellow-300 to-amber-500' },
    { p: top[2], place: 3, h: 'h-20', medal: '🥉', delay: '0s', grad: 'from-orange-300 to-orange-600' },
  ]
  return (
    <div className="mb-10 flex items-end justify-center gap-4">
      {slots.map(
        (s) =>
          s.p && (
            <div key={s.place} className="flex w-44 animate-bounce-in flex-col items-center" style={{ animationDelay: s.delay }}>
              <span className={`text-6xl ${s.place === 1 ? 'animate-bounce' : ''}`}>{s.medal}</span>
              <span className="text-outline mt-1 max-w-full truncate text-2xl font-bold">{s.p.name}</span>
              <span className="text-xl text-amber-200">{s.p.score} pts</span>
              <div
                className={`mt-2 flex w-full ${s.h} items-start justify-center rounded-t-2xl bg-gradient-to-b ${s.grad} pt-2 text-4xl font-bold text-indigo-950 shadow-2xl`}
              >
                {s.place}
              </div>
            </div>
          ),
      )}
    </div>
  )
}

function BigButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 px-10 py-4 text-2xl font-bold text-indigo-950 shadow-[0_6px_0_rgba(0,0,0,0.3)] transition hover:scale-105 active:translate-y-1 disabled:opacity-40 disabled:hover:scale-100"
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/50 blur-md" />
      {children}
    </button>
  )
}

function ErrorBox({ error }) {
  if (!error) return null
  return <p className="mx-auto mb-6 max-w-2xl rounded-xl bg-red-600/90 px-4 py-3 text-center">{error}</p>
}
