#!/usr/bin/env node
// Command-line trivia player, so an AI agent (or a person) can play from a terminal.
//
//   node scripts/bot.mjs join   <CODE> <NAME>          join the game
//   node scripts/bot.mjs next   <CODE> <NAME>          wait for the next question (or the end)
//   node scripts/bot.mjs answer <CODE> <NAME> <0-3>    answer the current question
//   node scripts/bot.mjs react  <CODE> <NAME> <EMOJI>  send 😀 😂 😍 😮 👏 🔥 to the big screen
//
// Every command prints one line of JSON.
import { getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { COLORS, botId, connect, refs } from './fb.mjs'

const [cmd, rawCode, name, arg] = process.argv.slice(2)
const code = (rawCode ?? '').toUpperCase()
const out = (obj) => {
  console.log(JSON.stringify(obj))
  process.exit(obj.error ? 1 : 0)
}
if (!cmd || !code || !name) out({ error: 'usage: bot.mjs join|next|answer|react CODE NAME [arg]' })

const db = connect()
const r = refs(db, code)
const id = botId(name)

async function questions() {
  const s = await getDocs(query(r.questions, orderBy('order')))
  return s.docs.map((d) => d.data())
}

async function join() {
  const g = await getDoc(r.game)
  if (!g.exists()) out({ error: `no game ${code}` })
  await setDoc(r.player(id), {
    name: name.slice(0, 20),
    score: 0,
    streak: 0,
    answer: null,
    lastResult: null,
    rank: null,
    reaction: null,
    joinedAt: serverTimestamp(),
  })
  out({ ok: true, joined: code, name, status: g.data().status })
}

// Resolves once there's an unanswered live question, or the game is over.
async function next() {
  const qs = await questions()
  const deadline = Date.now() + 9 * 60_000
  let game = null
  let me = null

  const check = () => {
    if (!game || !me) return
    const prev = me.lastResult
      ? { correct: me.lastResult.correct, points: me.lastResult.points, score: me.score, rank: me.rank }
      : undefined
    if (game.status === 'finished') {
      out({ type: 'finished', score: me.score, rank: me.rank, players: game.playerCount, previous: prev })
    }
    if (game.status === 'active') {
      const i = game.currentQuestionIndex
      const answered = me.answer && me.answer.questionIndex === i
      const left = Math.round((game.questionStartedAtMs + (game.questionTimeSec ?? 20) * 1000 - Date.now()) / 1000)
      if (!answered && left > 0) {
        const q = qs[i]
        out({
          type: 'question',
          number: i + 1,
          of: qs.length,
          question: q.text,
          options: q.options.map((text, choice) => ({ choice, color: COLORS[choice], text })),
          secondsLeft: left,
          previous: prev,
        })
      }
    }
    if (Date.now() > deadline) out({ type: 'timeout', status: game.status })
  }

  onSnapshot(r.game, (s) => {
    game = s.data()
    check()
  })
  onSnapshot(r.player(id), (s) => {
    if (!s.exists()) out({ error: 'not joined — run join first' })
    me = s.data()
    check()
  })
  setInterval(check, 1000)
}

async function answer() {
  const choice = Number(arg)
  if (![0, 1, 2, 3].includes(choice)) out({ error: 'choice must be 0, 1, 2 or 3' })
  const g = (await getDoc(r.game)).data()
  if (g?.status !== 'active') out({ error: `no live question (status: ${g?.status})` })
  const reactionMs = Date.now() - g.questionStartedAtMs
  await updateDoc(r.player(id), {
    answer: { questionIndex: g.currentQuestionIndex, choice, reactionMs, sentAtMs: Date.now() },
  })
  out({ ok: true, question: g.currentQuestionIndex + 1, choice, color: COLORS[choice], seconds: +(reactionMs / 1000).toFixed(1) })
}

async function react() {
  await updateDoc(r.player(id), { reaction: { emoji: arg || '😀', at: Date.now() } })
  out({ ok: true, reacted: arg })
}

const commands = { join, next, answer, react }
if (!commands[cmd]) out({ error: `unknown command ${cmd}` })
commands[cmd]().catch((e) => out({ error: e.message }))
