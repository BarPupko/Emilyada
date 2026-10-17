import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import quiz from '../data/questions.json'
import { toLatinKeys } from './keyboard'

// Firestore layout — every game ("room") lives under its own code, so many games can run at once:
//   games/{code}                      -> { title, hostKey, questionTimeSec, createdAt,
//                                          demo, currentQuestionIndex, status, questionStartedAtMs,
//                                          scoredIndex, leaderboard, answerCounts, playerCount, fastest }
//   games/{code}/questions/{id}       -> { order, text, options[4], correctAnswerIndex, image, optionImages[4] }
//   games/{code}/players/{playerId}   -> { name, avatar, score, demoScore, streak, answer, lastResult, rank, reaction }
//   games/{code}/history/{id}         -> { title, finishedAt, questionCount, players: [{ name, avatar, score }] }
//   games/{code}/media/{moment}_{kind} -> { data }  custom sound/picture (data URL), kind = 'sound' | 'picture'

export const DEFAULT_CODE = 'EMILY'
export const DEFAULT_TITLE = quiz.quizTitle
export const SEED_QUESTIONS = quiz.questions
export const DEFAULT_TIME_SEC = 20
export const MAX_POINTS = 1000
export const REACTIONS = ['😀', '😂', '😍', '😮', '👏', '🔥']

export const gameRef = (code) => doc(db, 'games', code)
export const playersCol = (code) => collection(db, 'games', code, 'players')
export const playerRef = (code, id) => doc(db, 'games', code, 'players', id)
export const questionsCol = (code) => collection(db, 'games', code, 'questions')
export const questionRef = (code, id) => doc(db, 'games', code, 'questions', id)
export const historyCol = (code) => collection(db, 'games', code, 'history')
export const mediaCol = (code) => collection(db, 'games', code, 'media')
export const mediaRef = (code, moment, kind) => doc(db, 'games', code, 'media', `${moment}_${kind}`)

// Moments the host can personalise with a recorded voice and/or a picture or GIF.
export const MOMENTS = [
  { id: 'join', emoji: '👋', title: 'Someone joins', where: 'Big screen, when a new player joins' },
  { id: 'correct', emoji: '🎉', title: 'Right answer', where: 'Big screen, when everyone got the answer right' },
  { id: 'wrong', emoji: '😮', title: 'Wrong answer', where: 'Big screen, with the names of everyone who got it wrong', hint: 'like "Oh no, Barka!"' },
  { id: 'winner', emoji: '👑', title: 'Winner', where: 'Big screen, at the end of the game' },
  { id: 'loser', emoji: '🐢', title: 'Last place', where: 'Big screen, a few seconds after the winner is shown' },
]

export const STATUS = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  REVEAL: 'reveal',
  FINISHED: 'finished',
}

// Per-round fields; reset whenever a game goes back to the lobby.
export const LOBBY_STATE = {
  demo: false,
  currentQuestionIndex: 0,
  status: STATUS.WAITING,
  questionStartedAtMs: null,
  scoredIndex: -1,
  leaderboard: [],
  answerCounts: [0, 0, 0, 0],
  fastest: null,
}

// Any case, and a code typed with the keyboard on Hebrew/Russian (קצןךט = EMILY) works too.
export const normalizeCode = (code) => toLatinKeys(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
export const timeMs = (game) => (game?.questionTimeSec ?? DEFAULT_TIME_SEC) * 1000

// Kahoot-style: correct answers earn 500–1000 points, faster = more.
export function pointsFor(correct, reactionMs, totalMs) {
  if (!correct) return 0
  const t = Math.min(Math.max(reactionMs ?? totalMs, 0), totalMs)
  return Math.round(MAX_POINTS * (1 - t / totalMs / 2))
}

// Demo rounds tally into a separate field so real scores are never touched.
export const scoreField = (game) => (game?.demo ? 'demoScore' : 'score')

// Presence: an open phone stamps `lastSeen` every HEARTBEAT_MS. A player not seen for
// AWAY_MS has closed the page (or lost signal); they stay in the game with their score,
// so reopening the page on the same phone carries on where they left off.
export const HEARTBEAT_MS = 20_000
export const AWAY_MS = 60_000
export const isAway = (player, now = Date.now()) => {
  const seen = player?.lastSeen?.toMillis?.()
  return !seen || now - seen > AWAY_MS
}

export function answerFor(player, questionIndex) {
  return player?.answer && player.answer.questionIndex === questionIndex ? player.answer : null
}

export const PRACTICE_QUESTIONS = [
  { text: 'What colour is the sky on a sunny day?', options: ['Red', 'Blue', 'Yellow', 'Green'], correctAnswerIndex: 1 },
  { text: 'How many legs does a dog have?', options: ['2', '4', '6', '8'], correctAnswerIndex: 1 },
  { text: 'Which one is a fruit?', options: ['Car', 'Chair', 'Banana', 'Shoe'], correctAnswerIndex: 2 },
  { text: 'What do bees make?', options: ['Milk', 'Honey', 'Bread', 'Juice'], correctAnswerIndex: 1 },
  { text: 'Which animal says "moo"?', options: ['Cat', 'Duck', 'Cow', 'Frog'], correctAnswerIndex: 2 },
]

const toQuestionDoc = (q, i) => ({
  order: i,
  text: q.text,
  options: q.options,
  correctAnswerIndex: q.correctAnswerIndex,
  image: q.image ?? null,
  optionImages: q.optionImages ?? [null, null, null, null],
})

/** Creates games/{code} and its questions in one batch. */
export async function createGame({ code, title, hostKey, questionTimeSec = DEFAULT_TIME_SEC, questions = [] }) {
  const batch = writeBatch(db)
  batch.set(gameRef(code), { ...LOBBY_STATE, title, hostKey, questionTimeSec, createdAt: serverTimestamp() })
  questions.forEach((q, i) => batch.set(doc(questionsCol(code)), toQuestionDoc(q, i)))
  await batch.commit()
}

/** Picks an unused 4-digit code (easy to type on any phone). */
export async function newGameCode() {
  for (let i = 0; i < 20; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000))
    if (!(await getDoc(gameRef(code))).exists()) return code
  }
  throw new Error('Could not find a free game code — please try again.')
}

/**
 * Makes sure the original Emily game exists. Carries over questions edited before
 * multi-game support (old top-level "questions" collection), else uses the JSON seed.
 */
export async function ensureDefaultGame() {
  if ((await getDoc(gameRef(DEFAULT_CODE))).exists()) return
  let questions = SEED_QUESTIONS
  try {
    const old = await getDocs(query(collection(db, 'questions'), orderBy('order')))
    if (!old.empty) questions = old.docs.map((d) => d.data())
  } catch {
    // fall back to the JSON seed
  }
  await createGame({
    code: DEFAULT_CODE,
    title: DEFAULT_TITLE,
    hostKey: import.meta.env.VITE_HOST_PIN || 'emily2026',
    questions,
  })
}

const LAST_CODE_KEY = 'bar-trivia-last-code'
export const saveLastCode = (code) => localStorage.setItem(LAST_CODE_KEY, code)
export const lastCode = () => localStorage.getItem(LAST_CODE_KEY) || DEFAULT_CODE
