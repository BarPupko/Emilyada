#!/usr/bin/env node
// Creates (or resets) a game for load testing, copying the Emily questions.
//   node scripts/create-test-game.mjs <CODE> <HOST_KEY> [secondsPerQuestion]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { doc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { ROOT, connect, refs } from './fb.mjs'

const [code = 'TEST', hostKey = 'test1234', secs = '60'] = process.argv.slice(2)
const db = connect()
const r = refs(db, code)
const emily = refs(db, 'EMILY')

let questions = (await getDocs(query(emily.questions, orderBy('order')))).docs.map((d) => d.data())
if (!questions.length) questions = JSON.parse(readFileSync(join(ROOT, 'src/data/questions.json'), 'utf8')).questions

const batch = writeBatch(db)
for (const d of (await getDocs(r.players)).docs) batch.delete(d.ref)
for (const d of (await getDocs(r.questions)).docs) batch.delete(d.ref)
batch.set(r.game, {
  title: 'Load test — How well do you know Emily?',
  hostKey,
  questionTimeSec: Number(secs),
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
questions.forEach((q, i) =>
  batch.set(doc(r.questions), {
    order: i,
    text: q.text,
    options: q.options,
    correctAnswerIndex: q.correctAnswerIndex,
    image: q.image ?? null,
    optionImages: q.optionImages ?? [null, null, null, null],
  }),
)
await batch.commit()
console.log(JSON.stringify({ ok: true, code, hostKey, questions: questions.length, secondsPerQuestion: Number(secs) }))
process.exit(0)
