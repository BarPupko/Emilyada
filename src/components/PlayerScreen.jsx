import { useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { DEFAULT_CODE, STATUS, answerFor, ensureDefaultGame, normalizeCode, playerRef, playersCol, saveLastCode, scoreField, timeMs } from '../lib/game'
import { sounds } from '../lib/sound'
import useCountdown from '../lib/useCountdown'
import useGame from '../lib/useGame'
import useQuestions from '../lib/useQuestions'
import AnswerTile, { ANSWER_STYLES, Shape } from './AnswerTile'
import { MuteButton, ReactionBar } from './Extras'
import { Confetti, Dots, FunBackground, TimerBar } from './Fun'
import Leaderboard from './Leaderboard'
import PracticeGame from './PracticeGame'

const NAME_KEY = 'bar-trivia-name'

const CHEERS = ['Amazing!', 'Super star!', 'You got it!', 'Brilliant!', 'Woohoo!']
const OOPS = ['Oh no!', 'So close!', 'Not this time!', 'Next one!']

// Stable per-device id (per game) so a refresh rejoins as the same player.
// (Uses Firestore's id generator: crypto.randomUUID isn't available over plain-http LAN.)
function getPlayerId(code) {
  const key = `bar-trivia-player-${code}`
  let id = localStorage.getItem(key)
  if (!id) {
    id = doc(playersCol(code)).id
    localStorage.setItem(key, id)
  }
  return id
}

export default function PlayerScreen() {
  const code = normalizeCode(useParams().code)
  const playerId = useMemo(() => getPlayerId(code), [code])
  const [me, setMe] = useState(undefined)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [pending, setPending] = useState(null) // optimistic { startedAt, choice }
  const [start, setStart] = useState({ startedAt: null, perf: 0, wall: null })
  const [error, setError] = useState(null)
  const [practice, setPractice] = useState(false)
  const { questions } = useQuestions(code)

  // Each phone listens to just two documents (game + its own player doc), keeping
  // fan-out tiny so 50 phones don't each receive every other player's writes.
  // The reaction clock starts the instant this device learns a new question is live;
  // keyed on the start time (not the index) so a demo's Q1 and the real Q1 differ.
  const { game, error: gameError } = useGame(code, (g) => {
    if (g?.status === STATUS.ACTIVE) {
      setStart((prev) =>
        prev.startedAt === g.questionStartedAtMs ? prev : { startedAt: g.questionStartedAtMs, perf: performance.now(), wall: Date.now() },
      )
    }
  })

  useEffect(() => {
    if (code === DEFAULT_CODE) ensureDefaultGame().catch(() => {})
    saveLastCode(code)
  }, [code])

  useEffect(
    () =>
      onSnapshot(
        playerRef(code, playerId),
        (s) => setMe(s.exists() ? { id: s.id, ...s.data() } : null),
        (e) => setError(e.message),
      ),
    [code, playerId],
  )

  const status = game?.status
  const idx = game?.currentQuestionIndex ?? 0
  const question = questions[idx]
  const total = timeMs(game)
  const liveStart = status === STATUS.ACTIVE && start.startedAt === game?.questionStartedAtMs ? start.wall : null
  const remaining = useCountdown(liveStart, total)
  const myScore = me?.[scoreField(game)] ?? 0
  const myAnswer = (pending && pending.startedAt === game?.questionStartedAtMs ? pending : null) ?? answerFor(me, idx)
  const result = status === STATUS.REVEAL && me?.lastResult?.questionIndex === idx ? me.lastResult : null

  // If the real game starts while someone is practising, jump straight into it.
  useEffect(() => {
    if (me && (status === STATUS.ACTIVE || status === STATUS.REVEAL)) setPractice(false)
  }, [me, status])

  // Sound + buzz when the result arrives.
  useEffect(() => {
    if (!result) return
    if (result.correct) sounds.correct()
    else if (result.answered) sounds.wrong()
    navigator.vibrate?.(result.correct ? [60, 40, 60] : 200)
  }, [result?.questionIndex, result?.correct, game?.questionStartedAtMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e) => {
    e.preventDefault()
    const n = name.trim().slice(0, 20)
    if (!n) return
    localStorage.setItem(NAME_KEY, n)
    setError(null)
    try {
      await setDoc(playerRef(code, playerId), {
        name: n,
        score: 0,
        streak: 0,
        answer: null,
        lastResult: null,
        rank: null,
        reaction: null,
        joinedAt: serverTimestamp(),
      })
      sounds.join()
    } catch (err) {
      setError(err.message)
    }
  }

  const answer = (choice) => {
    if (myAnswer || status !== STATUS.ACTIVE || remaining === 0) return
    const reactionMs = Math.round(performance.now() - start.perf)
    setPending({ startedAt: game.questionStartedAtMs, choice })
    sounds.tap()
    navigator.vibrate?.(40)
    updateDoc(playerRef(code, playerId), { answer: { questionIndex: idx, choice, reactionMs } }).catch((err) => {
      setPending(null)
      setError(err.message)
    })
  }

  const react = (emoji) => updateDoc(playerRef(code, playerId), { reaction: { emoji, at: Date.now() } }).catch(() => {})

  const leave = () => {
    if (confirm('Leave the game? Your score will be lost.')) deleteDoc(playerRef(code, playerId))
  }

  // ---------- screens ----------

  if (practice) return <PracticeGame onExit={() => setPractice(false)} />

  if (game === undefined || me === undefined) {
    return (
      <Full>
        <MiniCard />
        <p className="mt-6 text-2xl">
          Loading <Dots />
        </p>
        <ErrorText error={gameError} />
      </Full>
    )
  }

  if (game === null) {
    return (
      <Full>
        <p className="text-7xl">🤔</p>
        <h2 className="mt-4 text-3xl font-bold">No game with code {code}</h2>
        <p className="mt-2 text-xl text-white/80">Please check the code on the big screen.</p>
        <Link to="/" className="mt-8 rounded-2xl bg-amber-400 px-8 py-4 text-2xl font-bold text-indigo-950">
          ← Try again
        </Link>
      </Full>
    )
  }

  if (me === null) {
    return (
      <Full>
        <TopBar code={code} />
        <h1 className="text-outline animate-bounce-in text-5xl font-bold tracking-wider">EMILYADA</h1>
        <p className="mb-8 mt-2 animate-slide-up text-xl font-semibold text-amber-300" style={{ animationDelay: '0.2s' }}>
          {game.title}
        </p>
        <MiniCard />
        <form onSubmit={join} className="mt-8 flex w-full max-w-sm animate-slide-up flex-col gap-3" style={{ animationDelay: '0.4s' }}>
          <label className="text-xl font-semibold">Type your name:</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Your name"
            autoComplete="nickname"
            className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-semibold text-indigo-950 shadow-lg outline-none ring-amber-400 focus:ring-4"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 py-4 text-2xl font-bold text-indigo-950 shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1 disabled:opacity-40"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/50 blur-md" />
            Join game 🚀
          </button>
        </form>
        <button
          onClick={() => setPractice(true)}
          className="mt-4 w-full max-w-sm animate-slide-up rounded-2xl border-4 border-amber-300 bg-white/5 py-4 text-2xl font-bold text-amber-300 active:translate-y-1"
          style={{ animationDelay: '0.55s' }}
        >
          🎮 Demo game
        </button>
        <p className="mt-2 text-base text-white/70">Try it first — just for practice, nothing counts</p>
        <Link to="/" className="mt-4 text-white/70 underline">
          Different game code?
        </Link>
        <ErrorText error={error} />
      </Full>
    )
  }

  const footer = (
    <div className="mt-auto w-full pt-4">
      <div className="flex w-full items-center justify-between gap-2 text-base text-white/80">
        <span className="rounded-full bg-white/15 px-3 py-1 font-semibold text-white">😀 {me.name}</span>
        {game.demo && status !== STATUS.WAITING && (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-sm font-bold text-indigo-950">DEMO</span>
        )}
        {(me.streak ?? 0) >= 2 && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-sm font-bold">🔥 {me.streak}</span>}
        <span className="rounded-full bg-white/15 px-3 py-1 font-semibold tabular-nums">⭐ {myScore}</span>
        <button onClick={leave} className="text-sm underline">
          Leave
        </button>
      </div>
    </div>
  )

  const reactions = (
    <div className="mt-6 w-full">
      <ReactionBar onReact={react} />
    </div>
  )

  if (status === STATUS.WAITING) {
    return (
      <Full>
        <TopBar code={code} />
        <p className="animate-bounce text-7xl">🎉</p>
        <h2 className="text-outline mt-2 animate-pop-in text-4xl font-bold">You&apos;re in, {me.name}!</h2>
        <p className="mt-2 text-xl text-indigo-100">
          Waiting for the host to start <Dots />
        </p>
        <p className="mt-1 text-base text-white/70">The game will appear here by itself. No need to do anything.</p>
        <div className="mt-6 w-full animate-slide-up rounded-3xl bg-white/10 p-5 text-left shadow-xl backdrop-blur" style={{ animationDelay: '0.2s' }}>
          <h3 className="mb-3 text-center text-2xl font-bold">How to play</h3>
          <ol className="space-y-3 text-xl">
            <li>1️⃣ A question shows up on the big screen and on your phone.</li>
            <li>2️⃣ Tap the <b>coloured button</b> with your answer.</li>
            <li>3️⃣ Faster right answers = more points!</li>
          </ol>
          <div className="mt-4 flex justify-center gap-2">
            {ANSWER_STYLES.map((s, i) => (
              <div
                key={s.name}
                className={`bg-gradient-to-br ${s.grad} flex h-14 w-14 animate-bob items-center justify-center rounded-xl shadow-lg`}
                style={{ animationDelay: `${i * 0.3}s` }}
              >
                <Shape shape={s.shape} className="h-8 w-8" />
              </div>
            ))}
          </div>
        </div>
        {reactions}
        <button
          onClick={() => setPractice(true)}
          className="mt-6 w-full rounded-2xl border-4 border-amber-300 bg-white/5 py-4 text-2xl font-bold text-amber-300 active:translate-y-1"
        >
          🎮 Practise while you wait
        </button>
        {footer}
      </Full>
    )
  }

  if (status === STATUS.ACTIVE && question) {
    if (myAnswer) {
      const s = ANSWER_STYLES[myAnswer.choice]
      return (
        <Full bg={`bg-gradient-to-br ${s.grad}`}>
          <div className="animate-bounce-in">
            <Shape shape={s.shape} className="h-32 w-32 animate-spin-slow" />
          </div>
          <h2 className="text-outline mt-6 text-4xl font-bold">Answer locked in! 🔒</h2>
          <p className="mt-3 rounded-2xl bg-black/20 px-5 py-2 text-2xl">{question.options[myAnswer.choice]}</p>
          <p className="mt-6 text-xl text-white/90">
            Let&apos;s see if you&apos;re right <Dots />
          </p>
          {reactions}
          {footer}
        </Full>
      )
    }
    if (remaining === 0) {
      return (
        <Full>
          <p className="animate-wiggle text-8xl">⏰</p>
          <h2 className="text-outline mt-4 animate-pop-in text-4xl font-bold">Time&apos;s up!</h2>
          {reactions}
          {footer}
        </Full>
      )
    }
    return (
      <div className="relative flex min-h-dvh flex-col p-3 text-white">
        <FunBackground />
        <div className="relative z-10 flex flex-1 flex-col">
          {game.demo && (
            <p className="mb-2 rounded-xl bg-amber-400 py-1 text-center text-base font-bold text-indigo-950">DEMO ROUND — points don&apos;t count</p>
          )}
          <TimerBar remaining={remaining} total={total} />
          {question.image && (
            <img
              key={`img${idx}`}
              src={question.image}
              alt=""
              className="mt-3 max-h-40 animate-pop-in self-center rounded-2xl object-contain shadow-xl ring-4 ring-white/40"
            />
          )}
          <p key={`q${idx}`} className="text-outline my-3 animate-pop-in text-center text-2xl font-semibold leading-snug">
            {question.text}
          </p>
          <p className="mb-2 animate-bounce text-center text-lg text-amber-300">👇 Tap your answer</p>
          <div key={`a${idx}`} className="grid flex-1 grid-cols-2 grid-rows-2 gap-3">
            {question.options.map((opt, i) => (
              <AnswerTile key={i} index={i} label={opt} image={question.optionImages?.[i]} onClick={() => answer(i)} />
            ))}
          </div>
          <div className="mt-3">
            <ReactionBar onReact={react} compact />
          </div>
          <ErrorText error={error} />
        </div>
      </div>
    )
  }

  if (status === STATUS.REVEAL && question) {
    const r = result
    const correctStyle = ANSWER_STYLES[question.correctAnswerIndex]
    const bg = r?.correct
      ? 'bg-gradient-to-br from-green-400 to-emerald-700'
      : r?.answered
        ? 'bg-gradient-to-br from-rose-500 to-red-800'
        : 'bg-gradient-to-br from-slate-500 to-slate-800'
    const word = (list) => list[idx % list.length]
    return (
      <Full bg={bg}>
        {r?.correct && <Confetti />}
        <p className={`text-8xl ${r?.correct ? 'animate-bounce-in' : r?.answered ? 'animate-shake' : 'animate-pop-in'}`}>
          {r?.correct ? '🎉' : r?.answered ? '😮' : '😴'}
        </p>
        <h2 className="text-outline mt-4 animate-pop-in text-5xl font-bold">{r?.correct ? word(CHEERS) : r?.answered ? word(OOPS) : 'No answer'}</h2>
        {r?.correct && (
          <p className="mt-3 animate-bounce-in rounded-full bg-black/25 px-6 py-2 text-3xl font-bold" style={{ animationDelay: '0.3s' }}>
            +{r.points} ⭐
          </p>
        )}
        {r?.streak >= 2 && (
          <p className="mt-3 animate-bounce-in rounded-full bg-orange-500 px-5 py-1 text-2xl font-bold shadow-lg" style={{ animationDelay: '0.5s' }}>
            🔥 {r.streak} in a row!
          </p>
        )}
        <p className="mt-5 text-xl">The right answer:</p>
        <div className={`bg-gradient-to-br ${correctStyle.grad} mt-2 flex animate-slide-up items-center gap-3 rounded-2xl px-5 py-3 shadow-xl ring-4 ring-white`}>
          <Shape shape={correctStyle.shape} className="h-9 w-9" />
          <span className="text-2xl font-semibold">{question.options[question.correctAnswerIndex]}</span>
        </div>
        {me.rank && (
          <p className="mt-5 animate-slide-up text-2xl font-semibold" style={{ animationDelay: '0.3s' }}>
            {me.rank === 1 ? '👑 ' : ''}You&apos;re #{me.rank}
            {game.playerCount ? ` of ${game.playerCount}` : ''}
          </p>
        )}
        {reactions}
        {footer}
      </Full>
    )
  }

  if (status === STATUS.FINISHED) {
    const entries = (game.leaderboard ?? []).map(({ delta: _delta, ...rest }) => rest)
    return (
      <Full>
        <Confetti count={120} />
        <p className="animate-bounce-in text-8xl">{me.rank === 1 ? '👑' : '🏆'}</p>
        <h2 className="text-outline mt-2 text-4xl font-bold">{game.demo ? 'Demo over!' : 'Game over!'}</h2>
        {me.rank && (
          <p className="mb-6 mt-1 text-2xl text-amber-300">
            You finished #{me.rank} with {myScore} points
          </p>
        )}
        {game.demo && <p className="mb-4 text-lg text-white/80">That was practice — the real game is next!</p>}
        <div className="w-full max-w-sm">
          <Leaderboard entries={entries} highlightId={playerId} limit={5} title="Top 5" />
        </div>
        {reactions}
        {footer}
      </Full>
    )
  }

  return (
    <Full>
      <p className="text-xl">
        Hang tight <Dots />
      </p>
      {footer}
    </Full>
  )
}

// Full-screen page with the animated background. Pass `bg` to replace it with a solid colour.
function Full({ children, bg }) {
  return (
    <div className={`relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center text-white ${bg ?? ''}`}>
      {bg ? <FunBackground className="opacity-60" /> : <FunBackground />}
      <div className="relative z-10 flex w-full max-w-md flex-1 flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// Little 2x2 card from the reference image, used as the logo.
function MiniCard() {
  return (
    <div className="animate-bob">
      <div className="grid h-32 w-32 animate-pop-in grid-cols-2 overflow-hidden rounded-2xl shadow-2xl ring-4 ring-white/30">
        {ANSWER_STYLES.map((s, i) => (
          <div key={s.name} className={`bg-gradient-to-br ${s.grad} flex items-center justify-center`}>
            <Shape shape={s.shape} className="h-9 w-9 animate-wiggle" style={{ animationDelay: `${i * 0.3}s` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Mute toggle + game code + way into the host screen (which asks for the host key).
function TopBar({ code }) {
  return (
    <div className="fixed inset-x-3 top-3 z-20 flex items-center gap-2">
      <MuteButton />
      <span className="rounded-full bg-white/15 px-3 py-1 font-mono text-base font-bold">#{code}</span>
      <Link
        to={`/host/${code}`}
        className="ml-auto rounded-full bg-amber-400 px-4 py-2 text-base font-bold text-indigo-950 shadow-lg hover:brightness-110"
      >
        👑 I&apos;m the host
      </Link>
    </div>
  )
}

function ErrorText({ error }) {
  if (!error) return null
  return <p className="mt-4 rounded-xl bg-red-600/90 px-3 py-2 text-base">{error}</p>
}
