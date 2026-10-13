#!/usr/bin/env node
// Simulates N automatic players (each on its own connection) that answer randomly.
// Handy for a quick dry-run without AI agents.
//   node scripts/sim-players.mjs <CODE> <N>
import { onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { connect, refs } from './fb.mjs'

const [code, nRaw = '5'] = process.argv.slice(2)
const n = Number(nRaw)
const EMOJIS = ['😀', '😂', '😍', '😮', '👏', '🔥']
let finished = 0

for (let i = 1; i <= n; i++) {
  const db = connect(`sim-${i}`)
  const r = refs(db, code)
  const id = `sim-${i}`
  await setDoc(r.player(id), { name: `Sim ${i}`, score: 0, streak: 0, answer: null, lastResult: null, rank: null, reaction: null, joinedAt: serverTimestamp() })
  const done = new Set()
  onSnapshot(r.game, (s) => {
    const g = s.data()
    if (g.status === 'active' && !done.has(g.questionStartedAtMs)) {
      done.add(g.questionStartedAtMs)
      const delay = 800 + Math.random() * 6000
      setTimeout(() => {
        updateDoc(r.player(id), {
          answer: { questionIndex: g.currentQuestionIndex, choice: Math.floor(Math.random() * 4), reactionMs: Date.now() - g.questionStartedAtMs, sentAtMs: Date.now() },
        })
        if (Math.random() < 0.25) updateDoc(r.player(id), { reaction: { emoji: EMOJIS[Math.floor(Math.random() * 6)], at: Date.now() } })
      }, delay)
    }
    if (g.status === 'finished' && !done.has('end')) {
      done.add('end')
      if (++finished === n) setTimeout(() => process.exit(0), 1000)
    }
  })
}
console.log(`${n} simulated players joined ${code}`)
