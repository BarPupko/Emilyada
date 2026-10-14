// Fun avatars handed out at random when someone joins: dinos, faces, animals and monsters.
export const AVATARS = [
  '🦖', '🦕', '🐲', '🐉', '😀', '😎', '🤩', '🥳', '😜', '🤠',
  '👻', '👽', '🤖', '👾', '🦄', '🐶', '🐱', '🐼', '🐨', '🐯',
  '🦁', '🐸', '🐵', '🐧', '🐙', '🦊', '🐰', '🐻', '🐷', '🐮',
  '🦉', '🐢', '🐬', '🦋', '🐝', '🦀', '🦈', '🐳', '🎃', '🤡',
]

/** Random avatar, avoiding ones already taken when possible. */
export function randomAvatar(taken = []) {
  const free = AVATARS.filter((a) => !taken.includes(a))
  const pool = free.length ? free : AVATARS
  return pool[Math.floor(Math.random() * pool.length)]
}

function hash(s = '') {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

// Players who joined before avatars existed (or test bots) still get a stable one.
export const avatarOf = (p) => p?.avatar || AVATARS[hash(p?.id ?? p?.name) % AVATARS.length]
