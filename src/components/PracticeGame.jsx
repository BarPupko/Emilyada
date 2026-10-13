import { useState } from 'react'
import AnswerTile, { ANSWER_STYLES, Shape } from './AnswerTile'
import { Confetti, FunBackground } from './Fun'

// Runs entirely on the phone — nothing is saved, so nobody's score is affected.
const PRACTICE_QUESTIONS = [
  { text: 'What colour is the sky on a sunny day?', options: ['Red', 'Blue', 'Yellow', 'Green'], correctAnswerIndex: 1 },
  { text: 'How many legs does a dog have?', options: ['2', '4', '6', '8'], correctAnswerIndex: 1 },
  { text: 'Which one is a fruit?', options: ['Car', 'Chair', 'Banana', 'Shoe'], correctAnswerIndex: 2 },
]

export default function PracticeGame({ onExit }) {
  const [step, setStep] = useState('intro') // 'intro' | 'question' | 'result' | 'done'
  const [i, setI] = useState(0)
  const [choice, setChoice] = useState(null)
  const [right, setRight] = useState(0)

  const q = PRACTICE_QUESTIONS[i]

  const pick = (k) => {
    navigator.vibrate?.(30)
    setChoice(k)
    if (k === q.correctAnswerIndex) setRight((r) => r + 1)
    setStep('result')
  }

  const next = () => {
    if (i + 1 < PRACTICE_QUESTIONS.length) {
      setI(i + 1)
      setChoice(null)
      setStep('question')
    } else {
      setStep('done')
    }
  }

  const banner = (
    <p className="mb-3 rounded-xl bg-amber-400 py-2 text-center text-lg font-bold text-indigo-950">
      🎮 PRACTICE — points don't count
    </p>
  )

  if (step === 'intro') {
    return (
      <Page>
        {banner}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="animate-bounce text-7xl">🎮</p>
          <h1 className="text-outline animate-pop-in text-4xl font-bold">Let's practise!</h1>
          <ol className="mt-6 space-y-4 text-left text-2xl">
            <li>1️⃣ A question will appear.</li>
            <li>2️⃣ Tap the <b>coloured button</b> with the answer you think is right.</li>
            <li>3️⃣ You'll see if you were right.</li>
          </ol>
          <div className="mt-8 grid grid-cols-4 gap-2">
            {ANSWER_STYLES.map((s) => (
              <div
                key={s.name}
                className={`bg-gradient-to-br ${s.grad} flex h-16 w-16 animate-bob items-center justify-center rounded-xl shadow-lg`}
                style={{ animationDelay: `${ANSWER_STYLES.indexOf(s) * 0.3}s` }}
              >
                <Shape shape={s.shape} className="h-9 w-9" />
              </div>
            ))}
          </div>
        </div>
        <BigButton onClick={() => setStep('question')}>Start practice ▶</BigButton>
        <TextButton onClick={onExit}>← Go back</TextButton>
      </Page>
    )
  }

  if (step === 'question') {
    return (
      <Page>
        {banner}
        <p className="mb-1 text-center text-white/70">
          Question {i + 1} of {PRACTICE_QUESTIONS.length}
        </p>
        <p key={`q${i}`} className="text-outline mb-2 animate-pop-in text-center text-2xl font-semibold leading-snug">{q.text}</p>
        <p className="mb-3 animate-bounce text-center text-lg text-amber-300">👇 Tap your answer</p>
        <div key={`a${i}`} className="grid flex-1 grid-cols-2 grid-rows-2 gap-3">
          {q.options.map((o, k) => (
            <AnswerTile key={k} index={k} label={o} onClick={() => pick(k)} />
          ))}
        </div>
        <TextButton onClick={onExit}>Stop practice</TextButton>
      </Page>
    )
  }

  if (step === 'result') {
    const correct = choice === q.correctAnswerIndex
    const s = ANSWER_STYLES[q.correctAnswerIndex]
    return (
      <Page className={correct ? 'bg-gradient-to-br from-green-400 to-emerald-700' : 'bg-gradient-to-br from-rose-500 to-red-800'}>
        {correct && <Confetti />}
        {banner}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className={`text-8xl ${correct ? 'animate-bounce-in' : 'animate-shake'}`}>{correct ? '🎉' : '😮'}</p>
          <h2 className="text-outline mt-4 animate-pop-in text-5xl font-bold">{correct ? 'Correct!' : 'Not quite!'}</h2>
          <p className="mt-6 text-xl">The right answer was:</p>
          <div className={`bg-gradient-to-br ${s.grad} mt-2 flex animate-slide-up items-center gap-3 rounded-xl px-5 py-3 ring-4 ring-white`}>
            <Shape shape={s.shape} className="h-8 w-8" />
            <span className="text-2xl font-bold">{q.options[q.correctAnswerIndex]}</span>
          </div>
          <p className="mt-6 text-lg text-white/80">In the real game, faster correct answers get more points!</p>
        </div>
        <BigButton onClick={next}>{i + 1 < PRACTICE_QUESTIONS.length ? 'Next question ▶' : 'Finish ▶'}</BigButton>
      </Page>
    )
  }

  return (
    <Page>
      <Confetti count={120} />
      {banner}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="animate-bounce-in text-8xl">🌟</p>
        <h2 className="text-outline mt-4 animate-pop-in text-4xl font-bold">Well done!</h2>
        <p className="mt-2 text-2xl">
          You got {right} of {PRACTICE_QUESTIONS.length} right.
        </p>
        <p className="mt-6 text-xl text-white/80">You're ready! The real game works exactly the same way.</p>
      </div>
      <BigButton onClick={onExit}>OK, I'm ready 👍</BigButton>
    </Page>
  )
}

function Page({ children, className }) {
  return (
    <div className={`relative flex min-h-dvh flex-col overflow-hidden p-4 text-white ${className ?? ''}`}>
      {className ? <FunBackground className="opacity-60" /> : <FunBackground />}
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">{children}</div>
    </div>
  )
}

function BigButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 w-full rounded-2xl bg-amber-400 py-5 text-2xl font-bold text-indigo-950 shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1"
    >
      {children}
    </button>
  )
}

function TextButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="mt-3 py-3 text-lg text-white/70 underline">
      {children}
    </button>
  )
}
