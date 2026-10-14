import { useEffect, useRef, useState } from 'react'
import { deleteDoc, setDoc } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { MOMENTS, mediaRef, normalizeCode } from '../lib/game'
import resizeImage from '../lib/resizeImage'
import { playClip } from '../lib/sound'
import useMedia from '../lib/useMedia'
import { FunBackground } from './Fun'

const MAX_RECORD_SEC = 8
const MAX_SOUND_BYTES = 600_000 // ~800 KB as text; a Firestore document holds 1 MB
const MAX_GIF_BYTES = 700_000

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error("We couldn't read that file."))
    r.readAsDataURL(blob)
  })

// Host page: record a voice and/or add a picture or GIF for each game moment.
export default function MomentSettings() {
  const code = normalizeCode(useParams().code)
  const media = useMedia(code)
  const [message, setMessage] = useState(null)

  const flash = (text, type = 'ok') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3500)
  }

  return (
    <div className="relative min-h-dvh text-white">
      <FunBackground />
      <header className="relative z-10 flex flex-wrap items-center gap-3 bg-black/20 px-6 py-3 backdrop-blur">
        <Link to={`/host/${code}`} className="rounded-xl bg-white px-4 py-2 text-lg font-bold text-indigo-950 hover:brightness-95">
          ← Back to the game
        </Link>
        <h1 className="text-outline text-3xl font-bold">🎵 Sounds &amp; pictures</h1>
        <span className="ml-auto rounded-full bg-white px-3 py-1 font-mono text-lg font-bold text-indigo-950">#{code}</span>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-6">
        <p className="mb-6 rounded-2xl bg-white/15 p-4 text-xl leading-relaxed">
          Make the game your own! For each moment you can <b>record a voice</b> (like &quot;Oh no, Barka!&quot;) and add a{' '}
          <b>funny picture or GIF</b>. Moments you leave empty use the normal game sounds.
        </p>
        {MOMENTS.map((m) => (
          <MomentCard key={m.id} code={code} moment={m} media={media[m.id] ?? {}} flash={flash} />
        ))}
      </main>

      {message && (
        <p
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-bounce-in rounded-2xl px-6 py-3 text-xl font-bold shadow-2xl ${
            message.type === 'error' ? 'bg-red-600' : 'bg-green-500'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

function MomentCard({ code, moment, media, flash }) {
  const [busy, setBusy] = useState(false)

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      if (ok) flash(ok)
    } catch (e) {
      flash(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const save = (kind, data) => run(() => setDoc(mediaRef(code, moment.id, kind), { data }), 'Saved! ✅')
  const remove = (kind) => {
    if (!confirm(`Remove the ${kind} for "${moment.title}"?`)) return
    run(() => deleteDoc(mediaRef(code, moment.id, kind)), 'Removed.')
  }

  const pickSound = (file) =>
    run(async () => {
      if (file.size > MAX_SOUND_BYTES) throw new Error('That sound is too long. Please use a short clip (under 600 KB).')
      await setDoc(mediaRef(code, moment.id, 'sound'), { data: await toDataUrl(file) })
    }, 'Sound saved! ✅')

  const pickPicture = (file) =>
    run(async () => {
      let data
      if (file.type === 'image/gif') {
        // Resizing would freeze the animation, so GIFs are stored as they are.
        if (file.size > MAX_GIF_BYTES) throw new Error('That GIF is too big (max 700 KB). Please try a smaller one.')
        data = await toDataUrl(file)
      } else {
        data = await resizeImage(file, { maxSide: 700, maxChars: 400_000 })
      }
      await setDoc(mediaRef(code, moment.id, 'picture'), { data })
    }, 'Picture saved! ✅')

  return (
    <section className="mb-6 animate-slide-up rounded-3xl bg-white p-5 text-indigo-950 shadow-xl">
      <div className="mb-4 flex items-center gap-4">
        <span className="text-6xl">{moment.emoji}</span>
        <div>
          <h2 className="text-3xl font-bold">{moment.title}</h2>
          <p className="text-lg text-indigo-700">{moment.where}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl bg-indigo-50 p-4">
          <h3 className="text-2xl font-bold">🔊 Sound</h3>
          {media.sound ? (
            <div className="flex flex-wrap gap-2">
              <BigButton onClick={() => playClip(media.sound)} className="bg-green-500 text-white">
                ▶ Play it
              </BigButton>
              <BigButton onClick={() => remove('sound')} disabled={busy} className="bg-red-100 text-red-700">
                🗑️ Remove
              </BigButton>
            </div>
          ) : (
            <p className="text-lg text-indigo-600">No sound yet{moment.hint ? ` — record one ${moment.hint}` : ''}</p>
          )}
          <Recorder disabled={busy} onDone={(data) => save('sound', data)} onError={(e) => flash(e, 'error')} />
          <FileButton accept="audio/*" disabled={busy} onFile={pickSound}>
            📁 Choose a sound file
          </FileButton>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4">
          <h3 className="text-2xl font-bold">🖼️ Picture or GIF</h3>
          {media.picture ? (
            <>
              <img src={media.picture} alt="" className="max-h-48 self-center rounded-2xl object-contain shadow-lg" />
              <BigButton onClick={() => remove('picture')} disabled={busy} className="bg-red-100 text-red-700">
                🗑️ Remove picture
              </BigButton>
            </>
          ) : (
            <p className="text-lg text-amber-700">No picture yet</p>
          )}
          <FileButton accept="image/*" disabled={busy} onFile={pickPicture}>
            {media.picture ? '🔁 Change picture' : '➕ Add a picture or GIF'}
          </FileButton>
        </div>
      </div>
    </section>
  )
}

// Tap to start, tap to stop (stops by itself after a few seconds).
function Recorder({ onDone, onError, disabled }) {
  const [secs, setSecs] = useState(null) // null = not recording
  const rec = useRef(null)
  const supported = typeof window !== 'undefined' && window.MediaRecorder && navigator.mediaDevices?.getUserMedia

  useEffect(() => () => rec.current?.state === 'recording' && rec.current.stop(), [])

  const stop = () => {
    if (rec.current?.state === 'recording') rec.current.stop()
  }

  const start = async () => {
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return onError("We couldn't use the microphone. Please allow microphone access and try again.")
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const r = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 48_000 })
    const chunks = []
    let s = 0
    const tick = setInterval(() => {
      s += 1
      setSecs(s)
      if (s >= MAX_RECORD_SEC) stop()
    }, 1000)
    r.ondataavailable = (e) => chunks.push(e.data)
    r.onstop = async () => {
      clearInterval(tick)
      stream.getTracks().forEach((t) => t.stop())
      setSecs(null)
      onDone(await toDataUrl(new Blob(chunks, { type: r.mimeType })))
    }
    rec.current = r
    r.start()
    setSecs(0)
  }

  if (!supported) return <p className="text-base text-indigo-500">Recording needs a secure (https) page — you can still choose a file.</p>

  return secs === null ? (
    <BigButton onClick={start} disabled={disabled} className="bg-rose-500 text-white">
      🎙️ Record my voice
    </BigButton>
  ) : (
    <BigButton onClick={stop} className="animate-pulse bg-red-600 text-white">
      ⏹️ Stop recording ({MAX_RECORD_SEC - secs}s left)
    </BigButton>
  )
}

function FileButton({ accept, onFile, disabled, children }) {
  const input = useRef(null)
  return (
    <>
      <BigButton onClick={() => input.current.click()} disabled={disabled} className="bg-indigo-600 text-white">
        {children}
      </BigButton>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </>
  )
}

function BigButton({ className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-2xl px-5 py-3 text-xl font-bold shadow-[0_4px_0_rgba(0,0,0,0.2)] transition active:translate-y-1 disabled:opacity-40 ${className}`}
    />
  )
}
