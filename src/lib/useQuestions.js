import { useEffect, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { SEED_QUESTIONS, questionsCol } from './game'

// Live question list from Firestore. Until the host has saved questions there,
// falls back to the JSON seed so the game still works.
export default function useQuestions() {
  const [docs, setDocs] = useState(undefined)

  useEffect(
    () =>
      onSnapshot(
        query(questionsCol, orderBy('order')),
        (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setDocs([]),
      ),
    [],
  )

  return {
    loaded: docs !== undefined,
    inFirestore: !!docs?.length,
    questions: docs?.length ? docs : SEED_QUESTIONS,
  }
}
