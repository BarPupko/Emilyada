import { useEffect, useState } from 'react'

// Returns ms remaining until startMs + durationMs, ticking ~10x/sec. null when startMs is null.
export default function useCountdown(startMs, durationMs) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startMs == null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [startMs])

  if (startMs == null) return null
  return Math.max(0, startMs + durationMs - now)
}
