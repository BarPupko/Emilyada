import { useEffect, useRef, useState } from 'react'

// Optional webcam on the big screen, so the room sees itself playing. Off by default; the
// picture only goes from this device's camera to this screen - it is never uploaded.
const KEY = 'emilyada-camera'
const SIZES = ['w-56', 'w-80', 'w-[28rem]']
const CORNERS = ['bottom-4 right-4', 'bottom-4 left-4', 'top-20 left-4', 'top-20 right-4']

const load = () => {
  try {
    return { on: false, size: 1, corner: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { on: false, size: 1, corner: 0 }
  }
}

export function useCameraSetting() {
  const [cam, setCam] = useState(load)
  const update = (patch) =>
    setCam((c) => {
      const next = { ...c, ...patch }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  return [cam, update]
}

export function CameraButton({ cam, update }) {
  return (
    <button
      onClick={() => update({ on: !cam.on })}
      title={cam.on ? 'Hide the camera' : 'Show the room live on the big screen (optional)'}
      className={`rounded-lg px-3 py-1 text-sm font-bold ${cam.on ? 'bg-emerald-500 hover:brightness-110' : 'bg-white/15 hover:bg-white/25'}`}
    >
      📷 Camera {cam.on ? 'on' : 'off'}
    </button>
  )
}

export default function LiveCamera({ cam, update }) {
  const video = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!cam.on) return
    let stream
    let cancelled = false
    setError(null)
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch((e) => setError(e.name === 'NotAllowedError' ? 'Camera blocked - allow it in the browser to show the room.' : 'No camera found on this device.'))
    if (!navigator.mediaDevices) setError('This browser has no camera access (it needs https).')
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [cam.on])

  if (!cam.on) return null
  return (
    <div className={`fixed z-30 ${CORNERS[cam.corner % CORNERS.length]} ${SIZES[cam.size % SIZES.length]} group animate-pop-in`}>
      {error ? (
        <p className="rounded-2xl bg-black/70 p-3 text-sm text-white">📷 {error}</p>
      ) : (
        // mirrored, like a selfie camera, so moving left moves left on screen
        <video ref={video} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 rounded-2xl bg-black object-cover shadow-2xl ring-4 ring-white/60" />
      )}
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
        <CamCtl title="Bigger / smaller" onClick={() => update({ size: (cam.size + 1) % SIZES.length })}>⤢</CamCtl>
        <CamCtl title="Move to the next corner" onClick={() => update({ corner: (cam.corner + 1) % CORNERS.length })}>↻</CamCtl>
        <CamCtl title="Hide the camera" onClick={() => update({ on: false })}>✕</CamCtl>
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">● LIVE</span>
    </div>
  )
}

function CamCtl({ children, ...props }) {
  return (
    <button {...props} className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80">
      {children}
    </button>
  )
}
