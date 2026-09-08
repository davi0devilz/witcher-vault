import { useEffect, useRef, useState } from 'react'

const MUTED_KEY = 'ambientMusic.muted'
const VOLUME_KEY = 'ambientMusic.volume'
const DEFAULT_VOLUME = 0.35
const FADE_MS = 1400

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

function readStoredVolume(): number {
  try {
    const raw = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

export default function AmbientMusicPlayer({
  gameId,
  title,
  suspended
}: {
  gameId: number
  title: string
  suspended: boolean
}): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [trackPath, setTrackPath] = useState<string | null>(null)
  const [source, setSource] = useState<'khinsider' | 'custom' | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [muted, setMuted] = useState(readStoredMuted)
  const [volume, setVolume] = useState(readStoredVolume)
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setTrackPath(null)
    setSource(null)

    window.api.themeAudio
      .get(gameId, title)
      .then((result) => {
        if (cancelled) return
        setTrackPath(result?.path ?? null)
        setSource(result?.source ?? null)
      })
      .catch(() => {
        // Silently treated as "no track available" — never surfaced to the user.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameId, title])

  function clearFade(): void {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
  }

  function fadeTo(target: number, durationMs: number): void {
    const audio = audioRef.current
    if (!audio) return
    clearFade()
    const steps = 20
    const stepMs = durationMs / steps
    const start = audio.volume
    let step = 0
    fadeTimerRef.current = setInterval(() => {
      step += 1
      const progress = step / steps
      const next = start + (target - start) * progress
      audio.volume = Math.min(1, Math.max(0, next))
      if (step >= steps) {
        audio.volume = Math.min(1, Math.max(0, target))
        clearFade()
      }
    }, stepMs)
  }

  // Fade in when a track becomes available (unless paused for gameplay or muted),
  // fade out and pause when leaving the page or the game starts running.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !trackPath) return

    if (suspended) {
      fadeTo(0, 900)
      const timeout = setTimeout(() => audio.pause(), 950)
      return () => clearTimeout(timeout)
    }

    audio.volume = 0
    audio.play().catch(() => {
      // Autoplay can be blocked before any user gesture — the floating
      // control still lets the user start playback manually.
    })
    fadeTo(muted ? 0 : volume, FADE_MS)
    return undefined
  }, [trackPath, suspended])

  useEffect(() => {
    if (!trackPath || suspended) return
    fadeTo(muted ? 0 : volume, 350)
  }, [muted, volume])

  useEffect(() => {
    try {
      localStorage.setItem(MUTED_KEY, String(muted))
    } catch {
      // Best-effort persistence only.
    }
  }, [muted])

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      // Best-effort persistence only.
    }
  }, [volume])

  useEffect(() => {
    return () => {
      clearFade()
      audioRef.current?.pause()
    }
  }, [])

  async function handlePickLocalFile(): Promise<void> {
    const ok = await window.api.themeAudio.setFromFile(gameId)
    if (!ok) return
    setIsLoading(true)
    try {
      const result = await window.api.themeAudio.get(gameId, title)
      setTrackPath(result?.path ?? null)
      setSource(result?.source ?? null)
    } finally {
      setIsLoading(false)
    }
  }

  const hasTrack = Boolean(trackPath)
  const isAudible = hasTrack && !muted && !suspended
  const icon = isLoading ? '🎵' : !hasTrack ? '🎧' : isAudible ? '🔊' : '🔇'

  return (
    <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-2">
      {trackPath && (
        <audio ref={audioRef} src={`app-audio://local/${trackPath}`} loop preload="auto" />
      )}

      {showPanel && (
        <div className="w-64 rounded-2xl border border-base-border bg-base-surface/95 p-4 text-sm text-white/80 shadow-xl backdrop-blur">
          <p className="mb-3 font-tajawal text-xs font-bold text-white/70">
            🎶 موسيقى الأجواء
          </p>

          {hasTrack ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">
                  {source === 'custom' ? 'مقطع مخصص' : 'مقطع تلقائي'}
                </span>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="rounded-lg border border-base-border px-2.5 py-1 text-xs font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
                >
                  {muted ? '🔇 مكتومة' : '🔊 مفعّلة'}
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          ) : (
            <p className="mb-3 text-xs leading-loose text-white/45">
              {isLoading ? 'جارِ البحث عن مقطع صوتي...' : 'لم يتم العثور على مقطع صوتي لهذه اللعبة.'}
            </p>
          )}

          <button
            type="button"
            onClick={handlePickLocalFile}
            className="mt-3 w-full rounded-xl border border-base-border bg-base-bg/60 px-3 py-2 text-xs font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
          >
            📁 اختيار ملف MP3 محلي
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowPanel((v) => !v)}
        title="موسيقى الأجواء"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-base-border bg-base-surface/90 text-lg shadow-lg backdrop-blur transition-colors duration-200 hover:border-accent/40"
      >
        {icon}
      </button>
    </div>
  )
}
