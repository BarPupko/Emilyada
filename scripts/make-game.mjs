#!/usr/bin/env node
// Make a game of your own from a terminal (for AI agents, or a person without the editor).
//
//   node scripts/make-game.mjs create <CODE> <HOST_KEY> <SECONDS> "<Title>"     new empty game
//   node scripts/make-game.mjs add <CODE> "<question>" "<A>" "<B>" "<C>" "<D>" <0-3>
//                                                         add a question (0-3 = the right one)
//   node scripts/make-game.mjs remove <CODE> <N>          remove question N (the rest move up)
//   node scripts/make-game.mjs list <CODE>                the game and its questions
//
// Every command prints one line of JSON. `create` refuses a code that is already taken.
import { deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { connect, refs } from './fb.mjs'

const [cmd, rawCode, ...args] = process.argv.slice(2)
const code = (rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const out = (obj) => {
  console.log(JSON.stringify(obj))
  process.exit(obj.error ? 1 : 0)
}
if (!cmd || !code) out({ error: 'usage: make-game.mjs create|add|list CODE ...' })

const db = connect()
const r = refs(db, code)

async function create() {
  const [hostKey, secs, title] = args
  if (code.length < 3) out({ error: 'the code needs at least 3 letters or numbers' })
  if (!hostKey || hostKey.length < 4) out({ error: 'the host key needs at least 4 characters' })
  if ((await getDoc(r.game)).exists()) out({ error: `code ${code} is taken - pick another` })
  await setDoc(r.game, {
    title: (title || 'Our game').slice(0, 80),
    hostKey,
    questionTimeSec: Math.min(120, Math.max(5, Number(secs) || 20)),
    createdAt: serverTimestamp(),
    demo: false,
    currentQuestionIndex: 0,
    status: 'waiting',
    questionStartedAtMs: null,
    scoredIndex: -1,
    leaderboard: [],
    answerCounts: [0, 0, 0, 0],
    fastest: null,
  })
  out({ ok: true, created: code, title: title || 'Our game', secondsPerQuestion: Number(secs) || 20 })
}

async function add() {
  const [text, a, b, c, d, right] = args
  const correctAnswerIndex = Number(right)
  if (!text || ![a, b, c, d].every(Boolean)) out({ error: 'need the question and four answers' })
  if (![0, 1, 2, 3].includes(correctAnswerIndex)) out({ error: 'the right answer must be 0, 1, 2 or 3' })
  const g = await getDoc(r.game)
  if (!g.exists()) out({ error: `no game ${code}` })
  if (g.data().status !== 'waiting') out({ error: 'the game has started - questions can only be added in the lobby' })
  const order = (await getDocs(r.questions)).size
  await setDoc(doc(r.questions), {
    order,
    text: text.slice(0, 200),
    options: [a, b, c, d].map((o) => o.slice(0, 80)),
    correctAnswerIndex,
    image: null,
    optionImages: [null, null, null, null],
  })
  out({ ok: true, added: order + 1, question: text })
}

async function remove() {
  const n = Number(args[0])
  const g = await getDoc(r.game)
  if (!g.exists()) out({ error: `no game ${code}` })
  if (g.data().status !== 'waiting') out({ error: 'the game has started - questions can only be removed in the lobby' })
  const qs = (await getDocs(query(r.questions, orderBy('order')))).docs
  if (!(n >= 1 && n <= qs.length)) out({ error: `pick a question from 1 to ${qs.length}` })
  const [gone] = qs.splice(n - 1, 1)
  await deleteDoc(gone.ref)
  // renumber, which also fixes two questions added at the same moment with the same number
  await Promise.all(qs.map((d, i) => (d.data().order === i ? null : updateDoc(d.ref, { order: i }))))
  out({ ok: true, removed: gone.data().text, questions: qs.length })
}

async function list() {
  const g = await getDoc(r.game)
  if (!g.exists()) out({ error: `no game ${code}` })
  const qs = (await getDocs(query(r.questions, orderBy('order')))).docs.map((d) => d.data())
  out({ code, title: g.data().title, status: g.data().status, questions: qs.map((q) => ({ question: q.text, options: q.options, right: q.correctAnswerIndex })) })
}

const commands = { create, add, remove, list }
if (!commands[cmd]) out({ error: `unknown command ${cmd}` })
commands[cmd]().catch((e) => out({ error: e.message }))
