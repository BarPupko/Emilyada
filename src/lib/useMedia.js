import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { mediaCol } from './game'

// Live custom sounds/pictures for one game: { wrong: { sound, picture }, winner: { ... }, ... }
export default function useMedia(code) {
  const [media, setMedia] = useState({})

  useEffect(() => {
    if (!code) return
    return onSnapshot(
      mediaCol(code),
      (s) => {
        const m = {}
        s.docs.forEach((d) => {
          const [moment, kind] = d.id.split('_')
          ;(m[moment] ??= {})[kind] = d.data().data
        })
        setMedia(m)
      },
      () => setMedia({}),
    )
  }, [code])

  return media
}
