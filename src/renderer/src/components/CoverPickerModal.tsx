import { useEffect, useState } from 'react'
import type { CoverOption } from '../../../shared/models'

type PickerMode = 'cover' | 'hero'

interface CoverPickerModalProps {
  gameId: number
  steamAppId: string | null
  onClose: () => void
  onUpdated: () => void
}

const MODE_CONFIG: Record<
  PickerMode,
  { label: string; aspectClass: string; gridClass: string; description: string }
> = {
  cover: {
    label: 'الغلاف العمودي',
    aspectClass: 'aspect-[2/3]',
    gridClass: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5',
    description: 'بوسترات عمودية بنسبة 2:3 فقط — بدون تشويه أو قص.'
  },
  hero: {
    label: 'البانوراما العريضة',
    aspectClass: 'aspect-[16/9]',
    gridClass: 'grid-cols-2 sm:grid-cols-3',
    description: 'خلفيات عريضة تُعرض أعلى صفحة اللعبة.'
  }
}

export default function CoverPickerModal({
  gameId,
  steamAppId,
  onClose,
  onUpdated
}: CoverPickerModalProps): JSX.Element {
  const [mode, setMode] = useState<PickerMode>('cover')
  const [options, setOptions] = useState<CoverOption[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [steamGridDbConfigured, setSteamGridDbConfigured] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoadingOptions(true)
    setError(null)

    async function loadOptions(): Promise<void> {
      if (!steamAppId) {
        if (!cancelled) setIsLoadingOptions(false)
        return
      }
      try {
        if (mode === 'cover') {
          const result = await window.api.cover.getOptions(steamAppId)
          if (!cancelled) {
            setOptions(result.options)
            setSteamGridDbConfigured(result.steamGridDbConfigured)
          }
        } else {
          const heroOptions = await window.api.hero.getOptions(steamAppId)
          if (!cancelled) setOptions(heroOptions)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoadingOptions(false)
      }
    }

    loadOptions()
    return () => {
      cancelled = true
    }
  }, [mode, steamAppId])

  async function applyOption(option: CoverOption): Promise<void> {
    setApplyingId(option.id)
    setError(null)
    try {
      const ok =
        mode === 'cover'
          ? await window.api.cover.setFromUrl(gameId, option.url)
          : await window.api.hero.setFromUrl(gameId, option.url)
      if (ok) {
        onUpdated()
        onClose()
      } else {
        setError('تعذّر تنزيل هذه الصورة. جرّب خياراً آخر.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplyingId(null)
    }
  }

  async function handleUpload(): Promise<void> {
    setIsUploading(true)
    setError(null)
    try {
      const ok =
        mode === 'cover'
          ? await window.api.cover.setFromFile(gameId)
          : await window.api.hero.setFromFile(gameId)
      if (ok) {
        onUpdated()
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsUploading(false)
    }
  }

  const config = MODE_CONFIG[mode]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-base-border bg-base-surface p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-tajawal text-lg font-bold text-white">تعديل الصور</h3>
            <p className="mt-1 text-xs text-white/45">{config.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-white/50 hover:bg-white/5 hover:text-white"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl border border-base-border bg-base-elevated p-1">
          {(Object.keys(MODE_CONFIG) as PickerMode[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={[
                'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors duration-200',
                mode === key ? 'bg-accent text-white' : 'text-white/50 hover:text-white'
              ].join(' ')}
            >
              {MODE_CONFIG[key].label}
            </button>
          ))}
        </div>

        {mode === 'cover' && !steamGridDbConfigured && (
          <p className="mb-4 rounded-xl border border-base-border bg-base-elevated px-4 py-3 text-xs leading-relaxed text-white/50">
            لعرض تصاميم إضافية من مجتمع اللاعبين (SteamGridDB)، أضف مفتاح API الخاص بك مجاناً من
            صفحة الإعدادات.
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="overflow-y-auto">
          {!steamAppId && (
            <p className="py-6 text-center text-sm text-white/40">
              لا تتوفر خيارات عبر الإنترنت لهذه اللعبة — يمكنك رفع صورة يدوياً.
            </p>
          )}

          {steamAppId && isLoadingOptions && (
            <p className="py-6 text-center text-sm text-white/40">جارِ تحميل الخيارات...</p>
          )}

          {steamAppId && !isLoadingOptions && options.length > 0 && (
            <div className={`grid gap-3 ${config.gridClass}`}>
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyOption(option)}
                  disabled={applyingId !== null}
                  className={`group relative ${config.aspectClass} overflow-hidden rounded-lg border border-base-border transition-colors duration-200 hover:border-accent disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <img src={option.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {option.source === 'steamgriddb' && (
                    <span className="absolute right-1 top-1 rounded bg-accent/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      SGDB
                    </span>
                  )}
                  {applyingId === option.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
                      جارِ الحفظ...
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-base-border pt-4">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full rounded-xl border border-base-border bg-base-elevated px-4 py-2.5 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? 'جارِ الرفع...' : `📁 رفع ${mode === 'cover' ? 'غلاف' : 'بانوراما'} من جهازك`}
          </button>
        </div>
      </div>
    </div>
  )
}
