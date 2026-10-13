// Shared Firebase setup for the Node test scripts (reads the same .env as the app).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc } from 'firebase/firestore'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const ROOT = root

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

export const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

// Each named app gets its own connection — used to simulate many separate phones.
export function connect(name = '[DEFAULT]') {
  const app = initializeApp(config, name)
  return getFirestore(app)
}

export const refs = (db, code) => ({
  game: doc(db, 'games', code),
  players: collection(db, 'games', code, 'players'),
  player: (id) => doc(db, 'games', code, 'players', id),
  questions: collection(db, 'games', code, 'questions'),
})

export const botId = (name) => 'bot-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const COLORS = ['red', 'blue', 'yellow', 'green']
