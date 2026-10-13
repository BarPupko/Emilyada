import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { gameRef } from './game'

// Live game doc. undefined = loading, null = no game with that code.
export default function useGame(code, onData) {
  const [game, setGame] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!code) return
    setGame(undefined)
    return onSnapshot(
      gameRef(code),
      (s) => {
        const g = s.exists() ? s.data() : null
        onData?.(g)
        setGame(g)
      },
      (e) => setError(e.message),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return { game, error }
}
