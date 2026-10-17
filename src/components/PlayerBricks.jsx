import { AVATARS, avatarOf } from '../lib/avatars'
import { ANSWER_STYLES } from './AnswerTile'

const joinedMs = (p) => p.joinedAt?.toMillis?.() ?? Infinity // not yet stamped = just joined
export const byNewest = (players) => [...players].sort((a, b) => joinedMs(b) - joinedMs(a))

// Lobby "brick wall": every player is a square brick, newest first. Keys change with the
// player count, so each time someone joins their brick drops in and the others get knocked about.
// `away`: ids of players whose phone stopped checking in - shown faded with 💤.
export default function PlayerBricks({ players, onKick, highlightId, size = 'lg', away }) {
  const wall = byNewest(players)
  const small = size === 'sm' || wall.length > 24
  return (
    <div className="flex max-w-5xl flex-wrap justify-center gap-3">
      {wall.map((p, i) => {
        const style = ANSWER_STYLES[AVATARS.indexOf(avatarOf(p)) % 4]
        return (
          <div
            key={`${p.id}-${wall.length}`}
            style={{ '--tilt': `${i % 2 ? -4 : 4}deg`, animationDelay: i === 0 ? '0s' : `${Math.min(i, 20) * 25 + 350}ms` }}
            className={`${i === 0 ? 'animate-brick-drop' : 'animate-brick-bump'} group relative flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${style.grad} p-2 shadow-[0_6px_0_rgba(0,0,0,0.3)] ${
              p.id === highlightId ? 'ring-4 ring-amber-300' : 'ring-4 ring-white/30'
            } ${small ? 'h-24 w-24' : 'h-32 w-32'} ${away?.has(p.id) ? 'opacity-40 grayscale' : ''}`}
            title={away?.has(p.id) ? 'Away - their phone closed the game' : undefined}
          >
            {away?.has(p.id) && <span className="absolute left-1 top-1 text-lg">💤</span>}
            <span className={small ? 'text-4xl' : 'text-5xl'}>{avatarOf(p)}</span>
            <span className={`mt-1 w-full truncate text-center font-bold ${small ? 'text-sm' : 'text-lg'}`}>{p.name}</span>
            {onKick && (
              <button
                onClick={() => onKick(p.id)}
                title="Remove player"
                className="absolute right-1 top-1 hidden h-7 w-7 rounded-full bg-black/40 text-sm group-hover:block"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
