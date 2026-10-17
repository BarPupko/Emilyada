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
    // only a phone's tiles take taps; the big screen's are just a display
    idle: onClick ? 'hover:brightness-110 active:scale-90' : '',
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
            image ? 'flex-col items-center justify-center gap-2 p-2 text-center sm:flex-row sm:justify-start sm:gap-3 sm:text-left' : 'items-center'
          } ${lg ? `min-h-20 sm:min-h-28 ${image ? 'sm:p-3' : 'gap-3 p-3 sm:gap-5 sm:p-5'} text-lg sm:text-2xl lg:text-3xl` : `min-h-24 ${image ? '' : 'gap-3 p-4'} text-lg`}`}
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
              {/* small picture beside the answer, like Kahoot - keeps all four on one screen */}
              <img src={image} alt="" className={`${lg ? 'h-14 sm:h-24' : 'h-14'} aspect-square shrink-0 rounded-xl bg-white object-contain shadow-md`} />
              <span className="flex min-w-0 items-center gap-2">
                <Shape shape={style.shape} className={`${lg ? 'h-5 w-5 sm:h-8 sm:w-8' : 'h-5 w-5'} ${playful ? 'animate-wiggle' : ''}`} />
                <span className="leading-tight [text-shadow:0_2px_2px_rgba(0,0,0,0.35)]">{label}</span>
              </span>
            </>
          ) : (
            <>
              <Shape shape={style.shape} className={`${lg ? 'h-8 w-8 sm:h-14 sm:w-14' : 'h-10 w-10'} ${playful ? 'animate-wiggle' : ''}`} />
              <span className="flex-1 leading-tight [text-shadow:0_2px_2px_rgba(0,0,0,0.35)]">{label}</span>
            </>
          )}
          {state === 'correct' && <span className="absolute right-2 top-1 text-2xl sm:right-3 sm:top-2 sm:text-4xl">✅</span>}
          {typeof count === 'number' && (
            // top corner on phones, so it doesn't sit on the answer text
            <span className="absolute left-2 top-2 rounded-full bg-black/30 px-2 py-0.5 text-sm tabular-nums sm:left-auto sm:top-auto sm:bottom-2 sm:right-3 sm:px-3 sm:py-1 sm:text-xl">{count}</span>
          )}
        </Tag>
      </div>
    </div>
  )
}
