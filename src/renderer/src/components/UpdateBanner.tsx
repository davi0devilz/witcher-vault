import { useEffect, useState } from 'react'
import type { UpdateEvent } from '../../../shared/models'

type BannerState =
  | { phase: 'hidden' }
  | { phase: 'available'; version: string; isPortable: boolean }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'downloaded'; version: string }

/**
 * App-wide "a new version is available" banner — subscribes to the same
 * update-event stream Settings' own panel does (each `.on()` listener gets
 * its own copy of every event, so the two coexist without conflict), but
 * renders in the Layout shell so it's visible no matter what page the user
 * is on. That's the whole point: the automatic startup check in the main
 * process fires long before anyone would think to open Settings.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [state, setState] = useState<BannerState>({ phase: 'hidden' })
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  useEffect(() => {
    return window.api.updater.onUpdateEvent((event: UpdateEvent) => {
      switch (event.type) {
        case 'update-available':
          setState({ phase: 'available', version: event.version, isPortable: event.isPortable })
          break
        case 'download-progress':
          setState((prev) =>
            prev.phase === 'downloading' || prev.phase === 'available'
              ? { phase: 'downloading', version: prev.version, percent: event.percent }
              : prev
          )
          break
        case 'update-downloaded':
          setState({ phase: 'downloaded', version: event.version })
          break
        default:
          // "checking" / "up-to-date" / "error" stay silent here — this
          // banner only ever interrupts the user with genuinely actionable
          // news, never with routine background-check noise.
          break
      }
    })
  }, [])

  async function handleUpdateNow(): Promise<void> {
    if (state.phase !== 'available') return
    setState({ phase: 'downloading', version: state.version, percent: 0 })
    await window.api.updater.startDownload()
  }

  async function handleDownloadPortable(): Promise<void> {
    if (state.phase !== 'available') return
    await window.api.updater.openReleasePage(state.version)
  }

  async function handleInstall(): Promise<void> {
    await window.api.updater.installUpdate()
  }

  if (state.phase === 'hidden') return null
  if (state.phase === 'available' && dismissedVersion === state.version) return null

  return (
    <div className="border-b border-accent/30 bg-gradient-to-l from-accent/15 via-base-surface to-base-surface px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {state.phase === 'available' && (
          <>
            <p className="text-sm text-white/85">
              <span className="ml-1.5">✨</span>
              يتوفر إصدار جديد <span className="font-tajawal font-bold text-accent-soft">v{state.version}</span>
            </p>
            <div className="flex items-center gap-2">
              {state.isPortable ? (
                <button
                  type="button"
                  onClick={handleDownloadPortable}
                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
                >
                  ⬇ تحميل الإصدار الجديد
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUpdateNow}
                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
                >
                  تحديث الآن
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedVersion(state.version)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white/50 transition-colors duration-200 hover:text-white"
              >
                لاحقاً
              </button>
            </div>
          </>
        )}

        {state.phase === 'downloading' && (
          <>
            <p className="text-sm text-white/85">
              جارِ تحميل التحديث <span className="font-tajawal font-bold text-accent-soft">v{state.version}</span>
            </p>
            <div className="flex flex-1 items-center gap-2 sm:max-w-xs">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-elevated">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${Math.round(state.percent)}%` }}
                />
              </div>
              <span className="text-xs text-white/50">{Math.round(state.percent)}%</span>
            </div>
          </>
        )}

        {state.phase === 'downloaded' && (
          <>
            <p className="text-sm text-white/85">
              <span className="ml-1.5">✓</span>
              تم تحميل الإصدار <span className="font-tajawal font-bold text-accent-soft">v{state.version}</span> —
              أعد التشغيل لإكمال التثبيت.
            </p>
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
            >
              إعادة التشغيل والتثبيت
            </button>
          </>
        )}
      </div>
    </div>
  )
}
