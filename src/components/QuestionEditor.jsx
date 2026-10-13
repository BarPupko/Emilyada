import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, deleteDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { STATUS, gameRef, questionRef, questionsCol, seedQuestions } from '../lib/game'
import useQuestions from '../lib/useQuestions'
import resizeImage from '../lib/resizeImage'
import { ANSWER_STYLES, Shape } from './AnswerTile'

const EMPTY = { text: '', options: ['', '', '', ''], correctAnswerIndex: null, image: null, optionImages: [null, null, null, null] }
const ANSWER_IMAGE = { maxSide: 400, maxChars: 110_000 }

const withOptionImages = (q) => ({ ...q, options: [...q.options], optionImages: q.optionImages ? [...q.optionImages] : [null, null, null, null] })

export default function QuestionEditor() {
  const { questions, loaded, inFirestore } = useQuestions()
  const [game, setGame] = useState(undefined)
  const [editing, setEditing] = useState(null) // null = list, otherwise { id?, ...question }
  const [message, setMessage] = useState(null)
  const seeding = useRef(false)
  const quickInput = useRef(null)
  const quickTarget = useRef(null)

  useEffect(() => onSnapshot(gameRef, (s) => setGame(s.exists() ? s.data() : null)), [])

  // First visit: copy the starting questions from the JSON file into Firestore.
  useEffect(() => {
    if (loaded && !inFirestore && !seeding.current) {
      seeding.current = true
      seedQuestions().catch((e) => setMessage({ type: 'error', text: e.message }))
    }
  }, [loaded, inFirestore])

  const locked = game?.status === STATUS.ACTIVE || game?.status === STATUS.REVEAL

  const flash = (text, type = 'ok') => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const remove = async (q, i) => {
    if (questions.length <= 1) return flash('You need at least one question.', 'error')
    if (!confirm(`Delete question ${i + 1}?\n\n"${q.text}"\n\nThis cannot be undone.`)) return
    await deleteDoc(questionRef(q.id))
    flash('Question deleted.')
  }

  const move = async (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= questions.length) return
    const batch = writeBatch(db)
    batch.update(questionRef(questions[i].id), { order: questions[j].order })
    batch.update(questionRef(questions[j].id), { order: questions[i].order })
    await batch.commit()
  }

  const save = async (q) => {
    const data = {
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctAnswerIndex: q.correctAnswerIndex,
      image: q.image ?? null,
      optionImages: q.optionImages ?? [null, null, null, null],
    }
    if (q.id) {
      await setDoc(questionRef(q.id), { ...data, order: q.order }, { merge: true })
    } else {
      const maxOrder = Math.max(-1, ...questions.map((x) => x.order ?? 0))
      await addDoc(questionsCol, { ...data, order: maxOrder + 1 })
    }
    setEditing(null)
    flash('Saved! ✅')
  }

  // One-tap "📷 Picture" on a question card: pick a photo and save it straight away.
  const quickPicture = (q) => {
    quickTarget.current = q
    quickInput.current.click()
  }
  const onQuickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const q = quickTarget.current
    if (!file || !q) return
    try {
      flash('Adding picture…')
      const image = await resizeImage(file)
      await setDoc(questionRef(q.id), { image }, { merge: true })
      flash('Picture added! 📷')
    } catch (err) {
      flash(err.message, 'error')
    }
  }

  if (editing) {
    return <EditForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-32 text-slate-900">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-indigo-950 px-4 py-4 text-white shadow">
        <Link to="/host" className="rounded-xl bg-white/15 px-4 py-3 text-lg font-bold">
          ← Back
        </Link>
        <h1 className="flex-1 text-center text-2xl font-black">Edit Questions</h1>
        <span className="w-20" />
      </header>

      <main className="mx-auto max-w-3xl p-4">
        {message && (
          <p
            className={`mb-4 rounded-xl px-4 py-3 text-center text-xl font-bold ${
              message.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            {message.text}
          </p>
        )}

        {locked ? (
          <p className="rounded-2xl bg-amber-200 p-6 text-center text-xl">
            ⏸ A game is being played right now.
            <br />
            You can change questions when the game is over or back in the lobby.
          </p>
        ) : (
          <button
            onClick={() => setEditing(withOptionImages(EMPTY))}
            className="mb-6 w-full rounded-2xl bg-green-600 py-6 text-2xl font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.25)] active:translate-y-1"
          >
            ➕ Add a new question
          </button>
        )}

        {!loaded && <p className="text-center text-xl">Loading…</p>}
        <input ref={quickInput} type="file" accept="image/*" onChange={onQuickFile} className="hidden" />

        <ol className="space-y-4">
          {questions.map((q, i) => (
            <li key={q.id} className="overflow-hidden rounded-2xl bg-white shadow">
              <div className="flex items-start gap-3 p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-950 text-xl font-black text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  {q.image && <img src={q.image} alt="" className="mb-3 max-h-40 rounded-xl object-contain" />}
                  <p className="text-xl font-bold">{q.text}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {q.options.map((o, k) => (
                      <div
                        key={k}
                        className={`${ANSWER_STYLES[k].bg} flex items-center gap-2 rounded-lg px-3 py-2 font-bold text-white ${
                          k === q.correctAnswerIndex ? 'ring-4 ring-slate-900' : 'opacity-60'
                        }`}
                      >
                        {q.optionImages?.[k] ? (
                          <img src={q.optionImages[k]} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <Shape shape={ANSWER_STYLES[k].shape} className="h-5 w-5" />
                        )}
                        <span className="flex-1">{o}</span>
                        {k === q.correctAnswerIndex && <span className="text-lg">✓ Correct</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {!locked && (
                <div className="flex border-t border-slate-200 text-lg font-bold">
                  <button onClick={() => setEditing(withOptionImages(q))} className="flex-1 py-4 text-indigo-700 hover:bg-indigo-50">
                    ✏️ Change
                  </button>
                  <button onClick={() => quickPicture(q)} className="flex-1 py-4 text-purple-700 hover:bg-purple-50">
                    📷 {q.image ? 'New picture' : 'Picture'}
                  </button>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="px-5 py-4 hover:bg-slate-100 disabled:opacity-20" title="Move up">
                    ⬆️
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === questions.length - 1}
                    className="px-5 py-4 hover:bg-slate-100 disabled:opacity-20"
                    title="Move down"
                  >
                    ⬇️
                  </button>
                  <button onClick={() => remove(q, i)} className="flex-1 py-4 text-red-600 hover:bg-red-50">
                    🗑️ Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}

function EditForm({ initial, onSave, onCancel }) {
  const [q, setQ] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const fileInput = useRef(null)
  const optionInput = useRef(null)
  const optionTarget = useRef(null)

  const setOption = (k, value) => setQ((prev) => ({ ...prev, options: prev.options.map((o, i) => (i === k ? value : o)) }))

  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoadingImage(true)
    setProblem(null)
    try {
      const image = await resizeImage(file)
      setQ((prev) => ({ ...prev, image }))
    } catch (err) {
      setProblem(err.message)
    } finally {
      setLoadingImage(false)
    }
  }

  const pickOptionImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const k = optionTarget.current
    if (!file || k == null) return
    setLoadingImage(true)
    setProblem(null)
    try {
      const img = await resizeImage(file, ANSWER_IMAGE)
      setQ((prev) => ({ ...prev, optionImages: prev.optionImages.map((x, i) => (i === k ? img : x)) }))
    } catch (err) {
      setProblem(err.message)
    } finally {
      setLoadingImage(false)
    }
  }
  const removeOptionImage = (k) => setQ((prev) => ({ ...prev, optionImages: prev.optionImages.map((x, i) => (i === k ? null : x)) }))

  const submit = async () => {
    if (!q.text.trim()) return setProblem('Step 1: please write the question.')
    const empty = q.options.findIndex((o) => !o.trim())
    if (empty !== -1) return setProblem(`Step 3: please fill in the ${ANSWER_STYLES[empty].name.toLowerCase()} answer.`)
    if (q.correctAnswerIndex == null) return setProblem('Step 4: please tap the correct answer.')
    setSaving(true)
    setProblem(null)
    try {
      await onSave(q)
    } catch (err) {
      setProblem(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-40 text-slate-900">
      <header className="sticky top-0 z-10 bg-indigo-950 px-4 py-4 text-center text-white shadow">
        <h1 className="text-2xl font-black">{initial.id ? 'Change question' : 'New question'}</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-4">
        <Step n={1} title="Write the question">
          <textarea
            value={q.text}
            onChange={(e) => setQ({ ...q, text: e.target.value })}
            rows={3}
            placeholder="For example: What is Emily's favourite colour?"
            className="w-full rounded-xl border-2 border-slate-300 p-4 text-xl outline-none focus:border-indigo-600"
          />
        </Step>

        <Step n={2} title="Add a picture (you can skip this)">
          {q.image ? (
            <div className="space-y-3">
              <img src={q.image} alt="" className="mx-auto max-h-64 rounded-xl object-contain" />
              <div className="flex gap-3">
                <button onClick={() => fileInput.current.click()} className="flex-1 rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white">
                  🔄 Change picture
                </button>
                <button onClick={() => setQ({ ...q, image: null })} className="flex-1 rounded-xl bg-slate-300 py-4 text-lg font-bold">
                  ✖ Remove picture
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInput.current.click()}
              disabled={loadingImage}
              className="w-full rounded-xl border-4 border-dashed border-indigo-400 py-8 text-xl font-bold text-indigo-700 hover:bg-indigo-50"
            >
              {loadingImage ? 'Loading picture…' : '📷 Choose a picture'}
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" onChange={pickImage} className="hidden" />
        </Step>

        <Step n={3} title="Write the 4 answers">
          <p className="-mt-2 mb-3 text-lg text-slate-600">Tap 📷 to add a picture to an answer (you can skip this).</p>
          <div className="space-y-3">
            {q.options.map((o, k) => (
              <div key={k} className={`${ANSWER_STYLES[k].bg} rounded-xl p-3`}>
                <div className="flex items-center gap-3">
                  <Shape shape={ANSWER_STYLES[k].shape} className="h-8 w-8" />
                  <input
                    value={o}
                    onChange={(e) => setOption(k, e.target.value)}
                    placeholder={`${ANSWER_STYLES[k].name} answer`}
                    className="min-w-0 flex-1 rounded-lg bg-white px-3 py-3 text-xl outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      optionTarget.current = k
                      optionInput.current.click()
                    }}
                    className="rounded-lg bg-white/90 px-3 py-3 text-2xl"
                    title="Add a picture to this answer"
                  >
                    📷
                  </button>
                </div>
                {q.optionImages?.[k] && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={q.optionImages[k]} alt="" className="h-24 rounded-lg object-contain ring-4 ring-white/60" />
                    <button type="button" onClick={() => removeOptionImage(k)} className="rounded-lg bg-white/90 px-4 py-2 text-lg font-bold">
                      ✖ Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <input ref={optionInput} type="file" accept="image/*" onChange={pickOptionImage} className="hidden" />
        </Step>

        <Step n={4} title="Tap the correct answer">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {q.options.map((o, k) => {
              const chosen = q.correctAnswerIndex === k
              return (
                <button
                  key={k}
                  onClick={() => setQ({ ...q, correctAnswerIndex: k })}
                  className={`${ANSWER_STYLES[k].bg} flex items-center gap-3 rounded-xl p-4 text-left text-xl font-bold text-white transition ${
                    chosen ? 'scale-[1.02] ring-8 ring-slate-900' : q.correctAnswerIndex != null ? 'opacity-40' : ''
                  }`}
                >
                  <Shape shape={ANSWER_STYLES[k].shape} className="h-8 w-8" />
                  <span className="flex-1">{o || `(${ANSWER_STYLES[k].name})`}</span>
                  {chosen && <span className="text-3xl">✓</span>}
                </button>
              )
            })}
          </div>
        </Step>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white p-4 shadow-2xl">
        <div className="mx-auto max-w-2xl">
          {problem && <p className="mb-3 rounded-xl bg-red-600 px-4 py-3 text-center text-lg font-bold text-white">{problem}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={saving} className="flex-1 rounded-2xl bg-slate-300 py-5 text-xl font-bold">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || loadingImage}
              className="flex-[2] rounded-2xl bg-green-600 py-5 text-2xl font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.25)] active:translate-y-1 disabled:opacity-50"
            >
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow">
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-black">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-950 text-lg text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
