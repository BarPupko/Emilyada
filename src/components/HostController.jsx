import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDoc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import {
  INITIAL_GAME_STATE,
  QUESTION_TIME_MS,
  QUIZ_TITLE,
  STATUS,
  answerFor,
  gameRef,
  playerRef,
  playersCol,
  pointsFor,
  scoreField,
} from '../lib/game'
import useCountdown from '../lib/useCountdown'
import useQuestions from '../lib/useQuestions'
import { Link } from 'react-router-dom'
import AnswerTile, { ANSWER_STYLES, Shape } from './AnswerTile'
import { Confetti, Dots, FunBackground, TimerBar } from './Fun'
import Leaderboard from './Leaderboard'

export default function HostController() {
  const [game, setGame] = useState(undefined) // undefined = loading, null = not created yet
  const [players, setPlayers] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const revealedFor = useRef(-1)
  const { questions } = useQuestions()

  // Real-time listeners: one doc + one small collection. Firestore pushes deltas over a
  // single WebChannel stream, so updates land in well under 500ms even with ~50 players.
  useEffect(() => {
    const onErr = (e) => setError(e.message)
    const unsubGame = onSnapshot(gameRef, (s) => setGame(s.exists() ? s.data() : null), onErr)
    const unsubPlayers = onSnapshot(
      playersCol,
      (s) => setPlayers(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onErr,
    )
    return () => {
      unsubGame()
      unsubPlayers()
    }
  }, [])

  useEffect(() => {
    if (game === null) setDoc(gameRef, INITIAL_GAME_STATE).catch((e) => setError(e.message))
  }, [game])

  const status = game?.status
  const idx = game?.currentQuestionIndex ?? 0
  const question = questions[idx]
  const remaining = useCountdown(status === STATUS.ACTIVE ? game.questionStartedAtMs : null, QUESTION_TIME_MS)
  const answeredCount = players.filter((p) => answerFor(p, idx)).length
  const field = scoreField(game)
  const ranked = useMemo(
    () =>
      players
        .map((p) => ({ ...p, score: p[field] ?? 0 }))
        .sort((a, b) => b.score - a.score),
    [players, field],
  )

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
    return updateDoc(gameRef, {
      currentQuestionIndex: i,
      status: STATUS.ACTIVE,
      questionStartedAtMs: Date.now(),
      answerCounts: [0, 0, 0, 0],
    })
  }

  // Score everyone in a single atomic batch, then flip status to 'reveal'.
  const reveal = async () => {
    if (game.scoredIndex === idx || revealedFor.current === idx) return
    revealedFor.current = idx

    const counts = [0, 0, 0, 0]
    const results = players
      .map((p) => {
        const a = answerFor(p, idx)
        if (a) counts[a.choice]++
        const correct = !!a && a.choice === question.correctAnswerIndex
        const points = a ? pointsFor(correct, a.reactionMs) : 0
        return { p, answered: !!a, correct, points, score: (p[field] ?? 0) + points }
      })
      .sort((x, y) => y.score - x.score)

    const batch = writeBatch(db)
    results.forEach((r, i) =>
      batch.update(playerRef(r.p.id), {
        [field]: r.score,
        rank: i + 1,
        lastResult: { questionIndex: idx, answered: r.answered, correct: r.correct, points: r.points },
      }),
    )
    batch.update(gameRef, {
      status: STATUS.REVEAL,
      scoredIndex: idx,
      answerCounts: counts,
      playerCount: results.length,
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

  const startGame = (demo) =>
    run(async () => {
      const batch = writeBatch(db)
      players.forEach((p) =>
        batch.update(playerRef(p.id), {
          [demo ? 'demoScore' : 'score']: 0,
          answer: null,
          lastResult: null,
          rank: null,
        }),
      )
      batch.set(gameRef, { ...INITIAL_GAME_STATE, demo, status: STATUS.ACTIVE, questionStartedAtMs: Date.now() })
      revealedFor.current = -1
      await batch.commit()
    })

  const backToLobby = () =>
    run(async () => {
      const batch = writeBatch(db)
      players.forEach((p) => batch.update(playerRef(p.id), { answer: null, lastResult: null, rank: null }))
      batch.set(gameRef, INITIAL_GAME_STATE)
      revealedFor.current = -1
      await batch.commit()
    })

  const next = () =>
    run(() =>
      idx + 1 < questions.length ? startQuestion(idx + 1) : updateDoc(gameRef, { status: STATUS.FINISHED }),
    )

  const resetGame = (removePlayers) => {
    const msg = removePlayers ? 'Remove ALL players and reset the game?' : 'Reset all scores and go back to the lobby?'
    if (!confirm(msg)) return
    run(async () => {
      const batch = writeBatch(db)
      players.forEach((p) =>
        removePlayers
          ? batch.delete(playerRef(p.id))
          : batch.update(playerRef(p.id), { score: 0, answer: null, lastResult: null, rank: null }),
      )
      batch.set(gameRef, INITIAL_GAME_STATE)
      await batch.commit()
      revealedFor.current = -1
    })
  }

  const kick = (id) => run(() => deleteDoc(playerRef(id)))

  if (game === undefined || game === null) {
    return (
      <Screen>
        <Title />
        <p className="text-2xl">
          Getting the game ready <Dots />
        </p>
        <ErrorBox error={error} />
      </Screen>
    )
  }

  const joinUrl = `${window.location.origin}/`

  return (
    <div className="relative min-h-dvh overflow-hidden text-white">
      <FunBackground />
      <header className="relative z-10 flex flex-wrap items-center gap-3 bg-black/20 px-6 py-3 backdrop-blur">
        <span className="text-outline text-2xl font-bold tracking-wider">BAR TRIVIA</span>
        <span className="text-indigo-200">{QUIZ_TITLE}</span>
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
          <Link to="/host/edit" className="rounded-lg bg-green-500 px-3 py-1 text-sm font-bold hover:brightness-110">
            ✏️ Edit questions &amp; pictures
          </Link>
        )}
        <button onClick={() => resetGame(false)} disabled={busy} className="rounded-lg bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
          Reset scores
        </button>
        <button onClick={() => resetGame(true)} disabled={busy} className="rounded-lg bg-red-500/40 px-3 py-1 text-sm hover:bg-red-500/60">
          Clear players
        </button>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <ErrorBox error={error} />

        {status === STATUS.WAITING && (
          <div className="flex flex-col items-center text-center">
            <Title />
            <p className="text-2xl text-indigo-100">📱 Join on your phone at</p>
            <p className="mb-8 mt-3 animate-bob rounded-3xl bg-white px-8 py-4 font-mono text-4xl font-bold text-indigo-950 shadow-2xl ring-8 ring-amber-300/60">
              {joinUrl}
            </p>
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
            <div className="flex flex-wrap justify-center gap-4">
              <BigButton onClick={() => startGame(false)} disabled={busy || players.length === 0}>
                Start game ▶
              </BigButton>
              <button
                onClick={() => startGame(true)}
                disabled={busy || players.length === 0}
                className="rounded-2xl border-4 border-amber-300 bg-white/5 px-8 py-3 text-2xl font-bold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-40"
              >
                Try demo (no points)
              </button>
            </div>
          </div>
        )}

        {status === STATUS.ACTIVE && question && (
          <div key={`active-${idx}`}>
            <QuestionHeader question={question} />
            <div className="mx-auto mb-8 flex max-w-4xl items-center gap-8">
              <div className="flex-1">
                <TimerBar remaining={remaining} total={QUESTION_TIME_MS} />
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
              <Leaderboard entries={game.leaderboard ?? []} limit={5} title="Top 5" />
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

function Screen({ children }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white">
      <FunBackground />
      <div className="relative z-10 flex flex-col items-center">{children}</div>
    </div>
  )
}

function Title() {
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
      <h1 className="text-outline animate-bounce-in text-7xl font-bold tracking-wider md:text-8xl">BAR TRIVIA</h1>
      <p className="mb-8 mt-2 animate-slide-up text-3xl font-semibold text-amber-300">{QUIZ_TITLE}</p>
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
