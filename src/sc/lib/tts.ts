import { toast } from 'sonner'

let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null

function ensureContext() {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

export function initAudioContext() {
  ensureContext()
}

export async function speak(text: string, voiceId?: string | null) {
  if (currentSource) {
    try { currentSource.stop() } catch { /* noop */ }
    currentSource = null
  }
  ensureContext()
  if (!audioCtx) return

  // Hub: becky-tts loads its voice on every reply, so say that it is coming, and say why if it fails.
  const waiting = toast.loading('Reading the reply aloud. The voice takes about 40 seconds to start.')
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 2000), ...(voiceId ? { voiceId } : {}) }),
  })
  toast.dismiss(waiting)
  if (!res.ok) {
    const failure = await res.json().catch(() => null) as { error?: string } | null
    toast.error(failure?.error?.replace(/^Error:\s*/, '') || 'The voice could not read this reply.')
    return
  }

  const buf = await res.arrayBuffer()
  const audio = await audioCtx.decodeAudioData(buf)
  currentSource = audioCtx.createBufferSource()
  currentSource.buffer = audio
  currentSource.connect(audioCtx.destination)
  currentSource.onended = () => { currentSource = null }
  currentSource.start()
}

export function stopSpeaking() {
  if (currentSource) {
    try { currentSource.stop() } catch { /* noop */ }
    currentSource = null
  }
}
