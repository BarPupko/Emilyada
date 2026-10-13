import { useEffect, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { questionsCol } from './game'

// Live question list for one game.
export default function useQuestions(code) {
  const [docs, setDocs] = useState(undefined)

  useEffect(() => {
    if (!code) return
    return onSnapshot(
      query(questionsCol(code), orderBy('order')),
      (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setDocs([]),
    )
  }, [code])

  return { loaded: docs !== undefined, questions: docs ?? [] }
}
