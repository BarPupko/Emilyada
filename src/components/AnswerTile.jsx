// The four answer colors + shapes, matching the classic red/blue/yellow/green card.
export const ANSWER_STYLES = [
  { name: 'Red', bg: 'bg-red-500', grad: 'from-red-400 to-red-600', ring: 'ring-red-200', shape: 'triangle' },
  { name: 'Blue', bg: 'bg-blue-500', grad: 'from-sky-400 to-blue-600', ring: 'ring-blue-200', shape: 'diamond' },
  { name: 'Yellow', bg: 'bg-amber-400', grad: 'from-yellow-300 to-amber-500', ring: 'ring-amber-100', shape: 'circle' },
  { name: 'Green', bg: 'bg-green-500', grad: 'from-lime-400 to-green-600', ring: 'ring-green-200', shape: 'square' },
]

export function Shape({ shape, className = 'w-10 h-10', fill = 'fill-white', style }) {
  return (
    <svg viewBox="0 0 100 100" className={`${className} ${fill} shrink-0 drop-shadow`} style={style} aria-hidden="true">
      {shape === 'triangle' && <polygon points="50,8 95,90 5,90" strokeLinejoin="round" />}
      {shape === 'diamond' && <polygon points="50,4 96,50 50,96 4,50" />}
      {shape === 'circle' && <circle cx="50" cy="50" r="44" />}
      {shape === 'square' && <rect x="10" y="10" width="80" height="80" rx="8" />}
    </svg>
  )
}

/**
 * state: 'idle' | 'selected' | 'correct' | 'wrong' | 'dimmed'
 * Pops in one after another, then gently bobs while waiting to be tapped.
 */
export default function AnswerTile({ index, label, image, onClick, disabled, state = 'idle', size = 'md', count }) {
  const style = ANSWER_STYLES[index]
  const lg = size === 'lg'
  const playful = state === 'idle'

  const stateClass = {
    idle: 'hover:brightness-110 active:scale-90',
    selected: `ring-8 ${style.ring} scale-[1.03]`,
    correct: 'ring-8 ring-white scale-[1.04] animate-heartbeat',
    wrong: 'opacity-30 grayscale scale-95',
    dimmed: 'opacity-40',
  }[state]

  const Tag = onClick ? 'button' : 'div'

  return (
    <div className="flex animate-pop-in" style={{ animationDelay: `${index * 110}ms` }}>
      <div className={`flex flex-1 ${playful ? 'animate-bob' : ''}`} style={{ animationDelay: `${index * 0.45}s` }}>
        <Tag
          type={onClick ? 'button' : undefined}
          onClick={onClick}
          disabled={onClick ? disabled : undefined}
          aria-label={`${style.name}: ${label}`}
          className={`bg-gradient-to-br ${style.grad} ${stateClass} group relative flex flex-1 overflow-hidden rounded-3xl text-left font-semibold text-white shadow-[0_8px_0_rgba(0,0,0,0.28)] transition-all duration-200 select-none touch-manipulation ${
            image ? 'flex-col items-center justify-center gap-2 p-3 text-center' : 'items-center'
          } ${lg ? `min-h-36 ${image ? '' : 'gap-5 p-6'} text-3xl` : `min-h-28 ${image ? '' : 'gap-3 p-4'} text-xl`}`}
        >
          {/* moving shine */}
          {playful && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/25 blur-md"
              style={{ animationDelay: `${index * 0.6}s` }}
            />
          )}
          {image ? (
            <>
              <img src={image} alt="" className={`${lg ? 'max-h-40' : 'max-h-24'} w-auto rounded-xl object-contain shadow-md`} />
              <span className="flex items-center gap-2">
                <Shape shape={style.shape} className={`${lg ? 'h-8 w-8' : 'h-5 w-5'} ${playful ? 'animate-wiggle' : ''}`} />
                <span className="leading-tight [text-shadow:0_2px_2px_rgba(0,0,0,0.35)]">{label}</span>
              </span>
            </>
          ) : (
            <>
              <Shape shape={style.shape} className={`${lg ? 'h-16 w-16' : 'h-10 w-10'} ${playful ? 'animate-wiggle' : ''}`} />
              <span className="flex-1 leading-tight [text-shadow:0_2px_2px_rgba(0,0,0,0.35)]">{label}</span>
            </>
          )}
          {state === 'correct' && <span className="absolute right-3 top-2 text-4xl">✅</span>}
          {typeof count === 'number' && (
            <span className="absolute bottom-2 right-3 rounded-full bg-black/30 px-3 py-1 text-xl tabular-nums">{count}</span>
          )}
        </Tag>
      </div>
    </div>
  )
}
