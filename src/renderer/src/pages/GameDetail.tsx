import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { GameDetail as GameDetailModel, HltbResult, SessionUpdate } from '../../../shared/models'
import AmbientMusicPlayer from '../components/AmbientMusicPlayer'
import CoverPickerModal from '../components/CoverPickerModal'

function formatHltbHours(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const hours = seconds / 3600
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)} ساعة`
}

type TabKey = 'about' | 'story' | 'progress' | 'notes'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'about', label: 'عن اللعبة' },
  { key: 'story', label: 'القصة وأسلوب اللعب' },
  { key: 'progress', label: 'تقدمي وجلساتي' },
  { key: 'notes', label: 'وين وصلت؟' }
]

function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return 'لم تُلعب بعد'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins} دقيقة`
  if (mins === 0) return `${hours} ساعة`
  return `${hours} ساعة و${mins} دقيقة`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function GameDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const gameId = Number(id)

  const [game, setGame] = useState<GameDetailModel | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('about')
  const [showSpoiler, setShowSpoiler] = useState(false)
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false)
  const [session, setSession] = useState<SessionUpdate | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [hltb, setHltb] = useState<HltbResult | null>(null)

  const loadGame = useCallback(async () => {
    if (!Number.isFinite(gameId)) {
      setNotFound(true)
      setIsLoading(false)
      return
    }
    try {
      const detail = await window.api.game.getDetail(gameId)
      if (!detail) {
        setNotFound(true)
      } else {
        setGame(detail)
      }
    } finally {
      setIsLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    loadGame()
  }, [loadGame])

  useEffect(() => {
    const unsubscribe = window.api.game.onSessionUpdate((update) => {
      if (update.gameId !== gameId) return
      setSession(update)
      if (update.status === 'ended' || update.status === 'timeout' || update.status === 'error') {
        loadGame()
      }
    })
    return unsubscribe
  }, [gameId, loadGame])

  useEffect(() => {
    if (!game) return
    let cancelled = false
    window.api.hltb
      .getForGame(game.id, game.title)
      .then((result) => {
        if (!cancelled) setHltb(result)
      })
      .catch(() => {
        // How-long-to-beat data is a nice-to-have — never surfaced as an error.
      })
    return () => {
      cancelled = true
    }
  }, [game?.id, game?.title])

  async function handleLaunch(): Promise<void> {
    setIsLaunching(true)
    setLaunchError(null)
    try {
      const result = await window.api.game.launch(gameId)
      if (!result.ok) setLaunchError(result.message ?? 'تعذّر تشغيل اللعبة.')
    } finally {
      setIsLaunching(false)
    }
  }

  async function handleToggleFavorite(): Promise<void> {
    if (!game) return
    const next = !game.isFavorite
    setGame({ ...game, isFavorite: next })
    await window.api.game.toggleFavorite(gameId, next)
  }

  async function handleOpenInstallFolder(): Promise<void> {
    await window.api.game.openInstallFolder(gameId)
  }

  async function handleRemove(): Promise<void> {
    if (!game) return
    if (!window.confirm(`هل تريد إزالة "${game.title}" من المكتبة؟ لن يتم حذف أي ملفات فعلية.`)) {
      return
    }
    await window.api.library.removeGame(gameId)
    navigate('/library')
  }

  async function handleTranslate(): Promise<void> {
    setIsTranslating(true)
    setTranslateError(null)
    try {
      const result = await window.api.game.translateDescription(gameId)
      if (result.ok) {
        setGame((prev) =>
          prev
            ? {
                ...prev,
                shortDescription: result.shortDescription ?? prev.shortDescription,
                detailedDescription: result.detailedDescription ?? prev.detailedDescription,
                descriptionLanguage: 'ar'
              }
            : prev
        )
      } else {
        setTranslateError(result.message ?? 'تعذّرت الترجمة.')
      }
    } finally {
      setIsTranslating(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-white/40">جارِ التحميل...</p>
  }

  if (notFound || !game) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-tajawal text-lg font-bold text-white/70">اللعبة غير موجودة</p>
        <Link to="/library" className="text-sm text-accent-soft hover:underline">
          العودة إلى المكتبة
        </Link>
      </div>
    )
  }

  const primarySource = game.sources.find((s) => s.isPrimary) ?? game.sources[0]
  const isTracking = session?.status === 'starting' || session?.status === 'running'
  const totalSessionMinutes = game.sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  return (
    <div className="flex flex-col gap-6 pb-10">
      <section className="relative -mx-8 -mt-8 overflow-hidden">
        <div className="relative aspect-[21/9] w-full">
          {game.heroPath ? (
            <img
              src={`app-artwork://local/${game.heroPath}`}
              alt={game.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-accent/25 via-base-elevated to-base-bg" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-base-bg via-base-bg/40 to-transparent" />
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-8 pb-6">
          <div>
            <h1 className="font-tajawal text-3xl font-bold text-white drop-shadow">{game.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/70">
              {game.genres.map((genre) => (
                <span key={genre} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                  {genre}
                </span>
              ))}
              <span>⏱ {formatPlaytime(game.playtimeMinutes)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isLaunching || isTracking}
              className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white shadow-glow transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isTracking
                ? `▶ قيد اللعب الآن... ${session?.elapsedMinutes ?? 0} د`
                : isLaunching
                  ? 'جارِ التشغيل...'
                  : '▶ تشغيل اللعبة'}
            </button>

            <button
              type="button"
              onClick={handleToggleFavorite}
              className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface/80 px-4 py-3 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
            >
              {game.isFavorite ? '⭐ في المفضلة' : '☆ المفضلة'}
            </button>

            <button
              type="button"
              onClick={() => setIsCoverModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface/80 px-4 py-3 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
            >
              🖼 تعديل الغلاف
            </button>

            <button
              type="button"
              onClick={handleOpenInstallFolder}
              className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface/80 px-4 py-3 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
            >
              📂 فتح مجلد التثبيت
            </button>
          </div>

          {launchError && <p className="text-sm text-red-400">{launchError}</p>}
          {session?.status === 'timeout' && (
            <p className="text-sm text-amber-400">
              لم يتم رصد بدء تشغيل اللعبة تلقائياً — إن كانت تعمل فعلاً، سيتم تسجيل الجلسة القادمة
              بشكل طبيعي.
            </p>
          )}
        </div>
      </section>

      <HltbCard hltb={hltb} />

      <nav className="flex gap-1 border-b border-base-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-200',
              activeTab === tab.key
                ? 'border-accent text-white'
                : 'border-transparent text-white/45 hover:text-white/70'
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'about' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoRow
            label="الوصف"
            value={game.shortDescription ?? 'غير متاح'}
            span
            translateSlot={
              game.shortDescription ? (
                <TranslateButton
                  isTranslating={isTranslating}
                  onClick={handleTranslate}
                  error={translateError}
                  alreadyArabic={game.descriptionLanguage === 'ar'}
                />
              ) : null
            }
          />
          <InfoRow label="المطوّر" value={game.developer ?? 'غير متاح'} />
          <InfoRow label="الناشر" value={game.publisher ?? 'غير متاح'} />
          <InfoRow label="تاريخ الإصدار" value={game.releaseDate ?? 'غير متاح'} />
          <InfoRow
            label="المسار"
            value={primarySource?.installDir ?? primarySource?.executablePath ?? 'غير متاح'}
            span
          />
        </div>
      )}

      {activeTab === 'story' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-base-border bg-base-surface p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-tajawal text-sm font-bold text-white">نبذة عامة (بدون حرق)</h3>
              {game.shortDescription && (
                <TranslateButton
                  isTranslating={isTranslating}
                  onClick={handleTranslate}
                  error={translateError}
                  alreadyArabic={game.descriptionLanguage === 'ar'}
                />
              )}
            </div>
            <p className="whitespace-pre-line text-sm leading-loose text-white/60">
              {game.shortDescription ?? 'غير متاح'}
            </p>
          </div>

          {!showSpoiler ? (
            <button
              type="button"
              onClick={() => setShowSpoiler(true)}
              disabled={!game.detailedDescription}
              className="self-start rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-300 transition-colors duration-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🚨 عرض القصة كاملة
            </button>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <h3 className="mb-2 font-tajawal text-sm font-bold text-amber-300">الوصف الكامل</h3>
              <p className="whitespace-pre-line text-sm leading-loose text-white/60">
                {game.detailedDescription ?? 'غير متاح'}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="إجمالي وقت اللعب" value={formatPlaytime(game.playtimeMinutes)} />
            <StatCard label="عدد الجلسات" value={String(game.sessions.length)} />
            <StatCard
              label="آخر مرة لُعبت"
              value={game.lastPlayedAt ? formatDateTime(game.lastPlayedAt) : 'لم تُلعب بعد'}
            />
          </div>

          <div className="rounded-2xl border border-base-border bg-base-surface">
            <h3 className="border-b border-base-border px-5 py-3 font-tajawal text-sm font-bold text-white">
              سجل الجلسات
            </h3>
            {game.sessions.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-white/40">لا توجد جلسات مسجّلة بعد.</p>
            ) : (
              <ul className="divide-y divide-base-border">
                {game.sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-white/70">{formatDateTime(s.startedAt)}</span>
                    <span className="text-white/45">{formatPlaytime(s.durationMinutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {totalSessionMinutes !== game.playtimeMinutes && (
            <p className="text-xs text-white/30">
              ملاحظة: إجمالي مدة الجلسات المسجّلة قد يختلف قليلاً عن إجمالي وقت اللعب المخزّن.
            </p>
          )}
        </div>
      )}

      {activeTab === 'notes' && (
        <NotesPanel
          gameId={gameId}
          initialNotes={game.notes}
          notesUpdatedAt={game.notesUpdatedAt}
          onSaved={(notes, updatedAt) =>
            setGame((prev) => (prev ? { ...prev, notes, notesUpdatedAt: updatedAt } : prev))
          }
        />
      )}

      <div className="mt-4 border-t border-base-border pt-4">
        <button
          type="button"
          onClick={handleRemove}
          className="text-sm text-red-400/80 transition-colors duration-200 hover:text-red-400"
        >
          🗑 إزالة من المكتبة
        </button>
      </div>

      {isCoverModalOpen && (
        <CoverPickerModal
          gameId={gameId}
          steamAppId={game.sources.find((s) => s.store === 'steam')?.storeAppId ?? null}
          onClose={() => setIsCoverModalOpen(false)}
          onUpdated={loadGame}
        />
      )}

      <AmbientMusicPlayer gameId={gameId} title={game.title} suspended={isTracking} />
    </div>
  )
}

function HltbCard({ hltb }: { hltb: HltbResult | null }): JSX.Element | null {
  if (!hltb) return null

  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'القصة الرئيسية', value: formatHltbHours(hltb.mainSeconds) },
    { label: 'القصة + المهام الإضافية', value: formatHltbHours(hltb.mainExtraSeconds) },
    { label: 'التختيم الكامل', value: formatHltbHours(hltb.completionistSeconds) }
  ]

  if (rows.every((r) => r.value === null)) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="rounded-2xl border border-base-border bg-base-surface px-4 py-3 text-center"
        >
          <p className="font-tajawal text-base font-bold text-white">
            {row.value ?? 'غير متاح'}
          </p>
          <p className="mt-1 text-xs text-white/40">⏳ {row.label}</p>
        </div>
      ))}
    </div>
  )
}

function TranslateButton({
  isTranslating,
  onClick,
  error,
  alreadyArabic
}: {
  isTranslating: boolean
  onClick: () => void
  error: string | null
  alreadyArabic: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isTranslating}
        className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent-soft transition-colors duration-200 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isTranslating ? 'جارِ الترجمة...' : alreadyArabic ? '🌐 إعادة الترجمة' : '🌐 ترجمة للعربية'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

function InfoRow({
  label,
  value,
  span,
  translateSlot
}: {
  label: string
  value: string
  span?: boolean
  translateSlot?: ReactNode
}): JSX.Element {
  return (
    <div
      className={[
        'rounded-2xl border border-base-border bg-base-surface p-4',
        span ? 'sm:col-span-2' : ''
      ].join(' ')}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/40">{label}</p>
        {translateSlot}
      </div>
      <p className="whitespace-pre-line text-sm leading-loose text-white/80">{value}</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-base-border bg-base-surface p-4 text-center">
      <p className="font-tajawal text-lg font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/40">{label}</p>
    </div>
  )
}

function NotesPanel({
  gameId,
  initialNotes,
  notesUpdatedAt,
  onSaved
}: {
  gameId: number
  initialNotes: string | null
  notesUpdatedAt: string | null
  onSaved: (notes: string, updatedAt: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(initialNotes ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(notesUpdatedAt)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function save(text: string): Promise<void> {
    setStatus('saving')
    const updatedAt = await window.api.game.updateNotes(gameId, text)
    setLastUpdatedAt(updatedAt)
    setStatus('saved')
    onSaved(text, updatedAt)
  }

  function handleChange(value: string): void {
    setDraft(value)
    setStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      save(value)
    }, 1200)
  }

  function handleManualSave(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    save(draft)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/45">
        دوّن أين توقفت، أو أي ملاحظات وخطط قادمة لهذه اللعبة — تُحفظ تلقائياً أثناء الكتابة.
      </p>
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="مثال: وصلت للفصل الثالث، الزعيم القادم صعب — أحتاج أسلحة أفضل قبل المتابعة."
        rows={8}
        className="w-full resize-y rounded-2xl border border-base-border bg-base-surface p-4 text-sm leading-loose text-white placeholder:text-white/30 focus:border-accent/60 focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleManualSave}
          disabled={status === 'saving'}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'saving' ? 'جارِ الحفظ...' : '💾 حفظ الملاحظة'}
        </button>
        <span className="text-xs text-white/35">
          {status === 'saving' && 'جارِ الحفظ...'}
          {status === 'saved' && lastUpdatedAt && `✓ آخر تحديث: ${formatDateTime(lastUpdatedAt)}`}
          {status === 'idle' && lastUpdatedAt && `آخر تحديث: ${formatDateTime(lastUpdatedAt)}`}
        </span>
      </div>
    </div>
  )
}
