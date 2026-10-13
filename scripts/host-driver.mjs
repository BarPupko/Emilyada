#!/usr/bin/env node
// Runs a full game from the REAL host screen (headless Chrome), while N separate
// Firestore connections measure how fast updates reach "phones".
//
//   node scripts/host-driver.mjs <CODE> <HOST_KEY> <EXPECTED_PLAYERS> [joinWaitSec=300] [revealPauseSec=4]
//
// Needs the dev server running (npm run dev). Writes test-results/<CODE>/REPORT.md + screenshots.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'
import { getDocs, onSnapshot } from 'firebase/firestore'
import { ROOT, connect, refs } from './fb.mjs'

const [code, hostKey, expectedRaw, joinWaitRaw = '300', pauseRaw = '4'] = process.argv.slice(2)
const expected = Number(expectedRaw)
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const outDir = join(ROOT, 'test-results', code)
mkdirSync(outDir, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- latency monitor: N independent connections, like N phones ----------
const questionLatency = {} // questionIndex -> [ms per listener]
const answerLatency = [] // write → visible on another connection
for (let n = 0; n < expected; n++) {
  const db = connect(`phone-${n}`)
  const seen = new Set()
  onSnapshot(refs(db, code).game, (s) => {
    const g = s.data()
    if (g?.status === 'active' && g.questionStartedAtMs && !seen.has(g.questionStartedAtMs)) {
      seen.add(g.questionStartedAtMs)
      ;(questionLatency[g.currentQuestionIndex] ??= []).push(Date.now() - g.questionStartedAtMs)
    }
  })
}
const mainDb = connect('host-observer')
const r = refs(mainDb, code)
let players = []
let game = null
const seenAnswers = new Set()
onSnapshot(r.players, (s) => {
  players = s.docs.map((d) => ({ id: d.id, ...d.data() }))
  for (const p of players) {
    const a = p.answer
    if (a?.sentAtMs) {
      const key = `${p.id}:${a.questionIndex}:${a.sentAtMs}`
      if (!seenAnswers.has(key)) {
        seenAnswers.add(key)
        answerLatency.push(Date.now() - a.sentAtMs)
      }
    }
  }
})
onSnapshot(r.game, (s) => (game = s.data()))

// ---------- host browser ----------
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

const hasButton = (text) =>
  page.evaluate((t) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(t) && !b.disabled), text)
const click = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled)
    b?.click()
    return !!b
  }, text)
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) })

await page.goto(`${BASE}/host/${code}`, { waitUntil: 'networkidle2' })
await page.waitForSelector('input[type=password]', { timeout: 30000 })
await page.type('input[type=password]', hostKey)
await click('Enter')
await page.waitForFunction(() => document.body.innerText.includes('Start game'), { timeout: 30000 })
log('host logged in, waiting for players…')

const joinDeadline = Date.now() + Number(joinWaitRaw) * 1000
let lastCount = -1
while (players.length < expected && Date.now() < joinDeadline) {
  if (players.length !== lastCount) log(`players joined: ${players.length}/${expected}`)
  lastCount = players.length
  await sleep(1000)
}
log(`starting with ${players.length} players`)
await sleep(1500)
await shot('01-lobby')

const t0 = Date.now()
await click('Start game')
const perQuestion = []
let shotN = 2
const questionTotal = (await getDocs(r.questions)).size

for (;;) {
  // wait for the reveal (auto when everyone answered or time is up)
  const qStart = Date.now()
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => /Next question|Final results/.test(b.textContent)),
    { timeout: ((game?.questionTimeSec ?? 60) + 60) * 1000, polling: 250 },
  )
  // The button can appear before this script's own listener sees the scored reveal.
  while (!(game?.status === 'reveal' && game.scoredIndex === game.currentQuestionIndex)) await sleep(100)
  const idx = game.currentQuestionIndex
  const answered = game.answerCounts.reduce((a, b) => a + b, 0)
  perQuestion.push({ q: idx + 1, answered, of: players.length, counts: game.answerCounts, fastest: game.fastest, secs: (Date.now() - qStart) / 1000 })
  log(`Q${idx + 1}: ${answered}/${players.length} answered in ${((Date.now() - qStart) / 1000).toFixed(1)}s, fastest ${game.fastest?.name ?? '-'}`)
  if (idx === 0 || idx === Math.floor(questionTotal / 2)) await shot(`${String(shotN++).padStart(2, '0')}-reveal-q${idx + 1}`)
  await sleep(Number(pauseRaw) * 1000)
  if (await hasButton('Final results')) {
    await click('Final results')
    break
  }
  await click('Next question')
  await sleep(1200)
  if (idx === 1) await shot(`${String(shotN++).padStart(2, '0')}-question-live`)
}

await sleep(4000)
await shot(`${String(shotN++).padStart(2, '0')}-final-podium`)
const durationMin = (Date.now() - t0) / 60000

// ---------- report ----------
const ranked = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
const stats = (arr) => {
  if (!arr.length) return { n: 0 }
  const s = [...arr].sort((a, b) => a - b)
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
  return { n: s.length, p50: pct(50), p95: pct(95), max: s[s.length - 1] }
}
const allQ = Object.values(questionLatency).flat()
const qStats = stats(allQ)
const aStats = stats(answerLatency)

const lines = [
  `# EMILYADA load test — game ${code}`,
  '',
  `- Players: **${players.length}** (expected ${expected})`,
  `- Questions: ${questionTotal}, game length ${durationMin.toFixed(1)} min`,
  `- Host page errors: ${pageErrors.length ? pageErrors.join('; ') : 'none'}`,
  '',
  '## Latency (all on one machine, so clocks agree)',
  '',
  `| Measure | samples | median | 95th pct | worst |`,
  `|---|---|---|---|---|`,
  `| Host starts question → ${expected} phone connections see it | ${qStats.n} | ${qStats.p50} ms | ${qStats.p95} ms | ${qStats.max} ms |`,
  `| Player answers → host sees answer | ${aStats.n} | ${aStats.p50 ?? '-'} ms | ${aStats.p95 ?? '-'} ms | ${aStats.max ?? '-'} ms |`,
  '',
  `Target < 500 ms: question fan-out 95th pct ${qStats.p95 < 500 ? '✅ PASS' : '❌ over'}, answers 95th pct ${aStats.p95 == null ? 'n/a' : aStats.p95 < 500 ? '✅ PASS' : '❌ over'}`,
  '',
  '## Final scoreboard (first recorded game)',
  '',
  '| # | Player | Score |',
  '|---|---|---|',
  ...ranked.map((p, i) => `| ${i + 1} | ${p.name} | ${p.score ?? 0} |`),
  '',
  '## Per question',
  '',
  '| Q | answered | 🔺 | 🔷 | 🟡 | 🟩 | fastest correct | time to reveal |',
  '|---|---|---|---|---|---|---|---|',
  ...perQuestion.map(
    (q) =>
      `| ${q.q} | ${q.answered}/${q.of} | ${q.counts.join(' | ')} | ${q.fastest ? `${q.fastest.name} (${(q.fastest.ms / 1000).toFixed(1)}s)` : '-'} | ${q.secs.toFixed(1)}s |`,
  ),
]
writeFileSync(join(outDir, 'REPORT.md'), lines.join('\n'))
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify({ code, players: ranked.map((p) => ({ name: p.name, score: p.score })), perQuestion, questionLatency: qStats, answerLatency: aStats, durationMin }, null, 2),
)
log(`done — report at test-results/${code}/REPORT.md`)
log(`winner: ${ranked[0]?.name} (${ranked[0]?.score})`)
await browser.close()
process.exit(0)
