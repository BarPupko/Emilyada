import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase'
import {
  LOBBY_STATE,
  STATUS,
  answerFor,
  gameRef,
  isAway,
  historyCol,
  normalizeCode,
  playerRef,
  playersCol,
  pointsFor,
  scoreField,
  timeMs,
} from '../lib/game'
import { avatarOf } from '../lib/avatars'
import { playClip, sounds } from '../lib/sound'
import useCountdown from '../lib/useCountdown'
import useGame from '../lib/useGame'
import useMedia from '../lib/useMedia'
import useQuestions from '../lib/useQuestions'
import AnswerTile, { ANSWER_STYLES, Shape } from './AnswerTile'
import { FloatingReactions, MomentPopup, MuteButton, QrCode } from './Extras'
import LiveCamera, { CameraButton, useCameraSetting } from './LiveCamera'
import { Confetti, Dots, FunBackground, TimerBar } from './Fun'
import Leaderboard from './Leaderboard'
import PlayerBricks, { byNewest } from './PlayerBricks'

export default function HostController() {
  const code = normalizeCode(useParams().code)
  const { game, error: gameError } = useGame(code)
  const { questions, loaded: questionsLoaded } = useQuestions(code)
  const [players, setPlayers] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const revealedFor = useRef(-1)
  const media = useMedia(code)
  const [popup, setPopup] = useState(null)

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

  const [cam, updateCam] = useCameraSetting()

  // Re-check who is away every few seconds (their heartbeats stop arriving).
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  const away = players.filter((p) => isAway(p, now))
  const here = players.length - away.length

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
    if (status === STATUS.REVEAL) {
      // Custom moment on the big screen: "Oh no, …!" for those who picked a wrong answer,
      // else the right-answer one. Players who didn't answer (an idle phone) don't count.
      // (Boards from before `answered` was stored: a 0 counts as wrong, as it used to.)
      const board = game.leaderboard ?? []
      const missed = board.filter((e) => !e.delta && (e.answered ?? true))
      const anyRight = board.some((e) => e.delta > 0)
      const m = missed.length ? media.wrong : media.correct
      if ((missed.length || anyRight) && (m?.sound || m?.picture)) {
        if (!playClip(m.sound)) sounds.correct()
        setPopup({
          key: Date.now(),
          picture: m.picture,
          emoji: missed.length ? '😮' : '🎉',
          text: missed.length ? `Oh no, ${nameList(missed)}!` : board.every((e) => e.delta > 0) ? 'Everyone got it right! 🎉' : 'Good answer! 🎉',
          ms: 3500,
        })
      } else sounds.correct()
    }
    if (status !== STATUS.FINISHED) return
    // Winner first; then, if the host set one up, the last-place moment ("Oh no, Barka!").
    const winner = ranked[0]
    const loser = ranked.length > 1 ? ranked[ranked.length - 1] : null
    if (!playClip(media.winner?.sound)) sounds.fanfare()
    if (winner && media.winner?.picture) {
      setPopup({ key: Date.now(), picture: media.winner.picture, text: `👑 ${avatarOf(winner)} ${winner.name} wins!` })
    }
    const lm = media.loser
    if (!loser || !(lm?.sound || lm?.picture)) return
    const t = setTimeout(() => {
      playClip(lm.sound)
      setPopup({ key: Date.now(), picture: lm.picture, emoji: '🐢', text: `Oh no, ${avatarOf(loser)} ${loser.name}!` })
    }, 4500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, idx])
  const playerCount = players.length
  const prevCount = useRef(playerCount)
  useEffect(() => {
    if (status === STATUS.WAITING && playerCount > prevCount.current) {
      if (!playClip(media.join?.sound)) sounds.join()
      const newest = byNewest(players)[0]
      if (newest && media.join?.picture) {
        setPopup({ key: Date.now(), picture: media.join.picture, text: `${avatarOf(newest)} ${newest.name} joined!`, ms: 2500 })
      }
    }
    prevCount.current = playerCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (correct && (!fastest || a.reactionMs < fastest.ms)) fastest = { name: p.name, avatar: avatarOf(p), ms: a.reactionMs }
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
      // Full ranking (not just the top 5) so every phone can show the whole scoreboard.
      leaderboard: results.map((r) => ({ id: r.p.id, name: r.p.name, avatar: avatarOf(r.p), score: r.score, delta: r.points, answered: r.answered })),
    })

    try {
      await batch.commit()
    } catch (e) {
      revealedFor.current = -1
      throw e
    }
  }

  // Reveal when the timer runs out - not as soon as everyone has answered, so latecomers
  // and slow thinkers get the whole time. The host can still press "Reveal answer now".
  useEffect(() => {
    if (status === STATUS.ACTIVE && remaining === 0) run(reveal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, remaining === 0])

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

  // Finishing a real game also saves the final scoreboard to the game's history.
  const finish = () => {
    const batch = writeBatch(db)
    batch.update(gameRef(code), { status: STATUS.FINISHED })
    if (!game.demo) {
      batch.set(doc(historyCol(code)), {
        title: game.title,
        finishedAt: serverTimestamp(),
        questionCount: questions.length,
        players: ranked.map((p) => ({ name: p.name, avatar: avatarOf(p), score: p.score })),
      })
    }
    return batch.commit()
  }

  const next = () => run(() => (idx + 1 < questions.length ? startQuestion(idx + 1) : finish()))

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
  const removeAway = () => {
    if (!confirm(`Remove ${away.length} away player${away.length > 1 ? 's' : ''} and their scores?`)) return
    run(async () => {
      const batch = writeBatch(db)
      away.forEach((p) => batch.delete(playerRef(code, p.id)))
      await batch.commit()
    })
  }

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
  const inGame = (status === STATUS.ACTIVE || status === STATUS.REVEAL) && !!question

  return (
    <div className="relative min-h-dvh overflow-hidden text-white">
      <FunBackground />
      <FloatingReactions players={players} />
      <MomentPopup popup={popup} />
      <LiveCamera cam={cam} update={updateCam} />
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
        <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-sm" title="Away = their phone closed the game">
          👥 {here} {here === 1 ? 'player' : 'players'}
          {away.length > 0 && <span className="text-indigo-200"> · 💤 {away.length} away</span>}
        </span>
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
        {(status === STATUS.WAITING || status === STATUS.FINISHED) && (
          <Link to={`/host/${code}/sounds`} className="rounded-lg bg-pink-500 px-3 py-1 text-sm font-bold hover:brightness-110">
            🎵 Sounds &amp; pictures
          </Link>
        )}
        {(status === STATUS.WAITING || status === STATUS.FINISHED) && (
          <Link to={`/host/${code}/history`} className="rounded-lg bg-sky-500 px-3 py-1 text-sm font-bold hover:brightness-110">
            📜 Saved games
          </Link>
        )}
        <button onClick={() => resetGame(false)} disabled={busy} className="rounded-lg bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
          Reset scores
        </button>
        <button onClick={() => resetGame(true)} disabled={busy} className="rounded-lg bg-red-500/40 px-3 py-1 text-sm hover:bg-red-500/60">
          Clear players
        </button>
        <CameraButton cam={cam} update={updateCam} />
        <MuteButton />
      </header>

      <main
        className={`relative z-10 mx-auto px-6 py-8 ${
          inGame ? 'max-w-7xl lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-8' : 'max-w-6xl'
        }`}
      >
        {/* Mid-game, latecomers can still join: the QR stays on the left of the big screen. */}
        {inGame && (
          <aside className="sticky top-6 hidden animate-slide-up flex-col items-center gap-2 rounded-3xl bg-white/10 p-4 text-center lg:flex">
            <p className="text-2xl font-bold text-amber-300">Join now!</p>
            <QrCode url={joinUrl} size={160} />
            <p className="text-sm text-indigo-100">or type the code</p>
            <p className="rounded-xl bg-white px-3 py-1 font-mono text-2xl font-bold tracking-widest text-indigo-950">{code}</p>
          </aside>
        )}
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
            {players.length === 0 ? (
              <p className="mb-10 text-2xl text-indigo-100">
                Waiting for players <Dots />
              </p>
            ) : (
              <div className="mb-10">
                <PlayerBricks players={players} onKick={kick} away={new Set(away.map((p) => p.id))} />
                {away.length > 0 && (
                  <p className="mt-4 text-indigo-100">
                    💤 Away: their phone closed the game. They keep their score and come back when they reopen it.{' '}
                    <button onClick={removeAway} disabled={busy} className="underline hover:text-white">
                      Remove away players
                    </button>
                  </p>
                )}
              </div>
            )}
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
            <div className="mx-auto mb-4 flex max-w-4xl items-center gap-4 sm:mb-8 sm:gap-8">
              <div className="flex-1">
                <TimerBar remaining={remaining} total={total} />
              </div>
              <div className="text-center">
                <div key={answeredCount} className="animate-pop-in text-3xl font-bold tabular-nums sm:text-5xl">
                  {answeredCount}/{Math.max(here, answeredCount)}
                </div>
                <div className="text-indigo-100">answered</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-5">
              {question.options.map((opt, i) => (
                <AnswerTile key={i} index={i} label={opt} image={question.optionImages?.[i]} size="lg" />
              ))}
            </div>
            <p className="mt-4 text-center text-lg text-indigo-100">📱 Players answer on their phones</p>
            <div className="mt-6 text-center">
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
              <p className="mx-auto mb-4 w-fit animate-bounce-in rounded-full bg-gradient-to-r from-yellow-300 to-amber-500 px-4 py-1 text-base font-bold sm:mb-6 sm:px-6 sm:py-2 sm:text-2xl text-indigo-950 shadow-xl">
                ⚡ Fastest correct: {game.fastest.avatar} {game.fastest.name} ({(game.fastest.ms / 1000).toFixed(1)}s)
              </p>
            )}
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-5 lg:col-span-2">
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

// "Emily, Dan and 3 more"
function nameList(entries) {
  const names = entries.slice(0, 3).map((e) => `${avatarOf(e)} ${e.name}`)
  const more = entries.length - names.length
  return more > 0 ? `${names.join(', ')} and ${more} more` : names.join(' and ')
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
          {avatarOf(p)} {p.name} — {p.streak} in a row
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
      <h2 className="mx-auto mb-4 max-w-5xl animate-pop-in rounded-3xl bg-white px-4 py-3 text-center text-xl font-bold text-indigo-950 shadow-2xl sm:mb-6 sm:px-8 sm:py-6 sm:text-4xl">
        {question.text}
      </h2>
      {question.image && (
        <img
          src={question.image}
          alt=""
          className="mx-auto mb-4 max-h-36 animate-bounce-in rounded-3xl object-contain shadow-2xl ring-4 ring-white/40 sm:max-h-[20vh] sm:ring-8"
        />
      )}
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
              <span className="animate-bob text-6xl">{avatarOf(s.p)}</span>
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
