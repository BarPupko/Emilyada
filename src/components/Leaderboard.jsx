const MEDALS = ['🥇', '🥈', '🥉']

/**
 * entries: [{ id?, name, score, delta? }] — already sorted by score desc.
 * Rows slide in one after another.
 */
export default function Leaderboard({ entries, highlightId, limit = 10, title = 'Leaderboard', size = 'md' }) {
  const shown = entries.slice(0, limit)
  const big = size === 'lg'

  return (
    <div className="w-full">
      <h2 className={`text-outline mb-4 animate-pop-in text-center font-bold tracking-wide text-white ${big ? 'text-5xl' : 'text-3xl'}`}>
        {title}
      </h2>
      {shown.length === 0 ? (
        <p className="text-center text-indigo-200">No players yet</p>
      ) : (
        <ol className="space-y-2">
          {shown.map((p, i) => {
            const me = highlightId && p.id === highlightId
            return (
              <li
                key={p.id ?? `${p.name}-${i}`}
                style={{ animationDelay: `${i * 120}ms` }}
                className={`flex animate-slide-up items-center gap-3 rounded-2xl px-4 font-semibold shadow-lg ${
                  big ? 'py-3 text-3xl' : 'py-2 text-xl'
                } ${
                  me
                    ? 'bg-gradient-to-r from-amber-300 to-yellow-400 text-indigo-950 ring-4 ring-white'
                    : i === 0
                      ? 'bg-gradient-to-r from-yellow-200 to-amber-300 text-indigo-950'
                      : i < 3
                        ? 'bg-white text-indigo-950'
                        : 'bg-white/15 text-white'
                }`}
              >
                <span className={`text-center tabular-nums ${big ? 'w-14' : 'w-9'} ${i === 0 ? 'inline-block animate-wiggle' : ''}`}>
                  {MEDALS[i] ?? i + 1}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.delta > 0 && <span className="animate-bounce text-green-600 tabular-nums">+{p.delta}</span>}
                <span className="tabular-nums">{p.score ?? 0}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
