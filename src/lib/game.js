import { collection, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import quiz from '../data/questions.json'

export const QUIZ_TITLE = quiz.quizTitle
// The JSON file is only the starting set; live questions are stored in Firestore
// so they can be edited from the host's "Edit questions" screen.
export const SEED_QUESTIONS = quiz.questions
export const QUESTION_TIME_MS = 20_000
export const MAX_POINTS = 1000

// Firestore layout:
//   gameState/current  -> { demo, currentQuestionIndex, status, questionStartedAtMs, scoredIndex, leaderboard, answerCounts }
//   questions/{id}     -> { order, text, options[4], correctAnswerIndex, image (small JPEG data URL) | null }
//   players/{playerId} -> { name, score, answer: { questionIndex, choice, reactionMs } | null, lastResult, rank }
export const gameRef = doc(db, 'gameState', 'current')
export const playersCol = collection(db, 'players')
export const playerRef = (id) => doc(db, 'players', id)
export const questionsCol = collection(db, 'questions')
export const questionRef = (id) => doc(db, 'questions', id)

export async function seedQuestions() {
  const batch = writeBatch(db)
  SEED_QUESTIONS.forEach((q, i) =>
    batch.set(questionRef(q.id), {
      order: i,
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      image: null,
    }),
  )
  await batch.commit()
}

export const STATUS = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  REVEAL: 'reveal',
  FINISHED: 'finished',
}

export const INITIAL_GAME_STATE = {
  demo: false,
  currentQuestionIndex: 0,
  status: STATUS.WAITING,
  questionStartedAtMs: null,
  scoredIndex: -1,
  leaderboard: [],
  answerCounts: [0, 0, 0, 0],
}

// Kahoot-style: correct answers earn 500–1000 points, faster = more.
export function pointsFor(correct, reactionMs) {
  if (!correct) return 0
  const t = Math.min(Math.max(reactionMs ?? QUESTION_TIME_MS, 0), QUESTION_TIME_MS)
  return Math.round(MAX_POINTS * (1 - t / QUESTION_TIME_MS / 2))
}

// Demo rounds tally into a separate field so real scores are never touched.
export const scoreField = (game) => (game?.demo ? 'demoScore' : 'score')

export function answerFor(player, questionIndex) {
  return player?.answer && player.answer.questionIndex === questionIndex ? player.answer : null
}
