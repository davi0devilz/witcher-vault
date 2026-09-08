import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ArtworkBatchResult, Game, ScanReport } from '../../../shared/models'
import FallbackPoster from '../components/FallbackPoster'
import { PlayIcon } from '../components/icons'

const STORE_LABELS: Record<Game['sources'][number]['store'], string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  manual: 'يدوي'
}

type QuickFilter = 'all' | 'installed' | 'favorite'
type SortMode = 'playtime' | 'recent' | 'alphabetical'

const QUICK_FILTERS: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'installed', label: 'المثبتة فقط' },
  { value: 'favorite', label: 'المفضلة' }
]

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'playtime', label: 'الأكثر لعباً' },
  { value: 'recent', label: 'الأحدث' },
  { value: 'alphabetical', label: 'أبجدياً' }
]

export default function Library(): JSX.Element {
  const [games, setGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [isFetchingArtwork, setIsFetchingArtwork] = useState(false)
  const [scanReport, setScanReport] = useState<ScanReport | null>(null)
  const [artworkReport, setArtworkReport] = useState<ArtworkBatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [genreFilter, setGenreFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('recent')

  useEffect(() => {
    let cancelled = false

    async function loadGames(): Promise<void> {
      try {
        const result = await window.api.library.getGames()
        if (!cancelled) setGames(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadGames()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return window.api.steam.onBackgroundSync((result) => {
      if (result.ok && result.games) setGames(result.games)
    })
  }, [])

  async function handleScan(): Promise<void> {
    setIsScanning(true)
    setError(null)
    try {
      const report = await window.api.library.scanInstalledGames()
      setScanReport(report)
      setGames(report.games)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsScanning(false)
    }
  }

  async function handleFetchArtwork(): Promise<void> {
    setIsFetchingArtwork(true)
    setError(null)
    try {
      const report = await window.api.library.fetchArtwork()
      setArtworkReport(report)
      setGames(report.games)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsFetchingArtwork(false)
    }
  }

  const genres = useMemo(() => {
    const set = new Set<string>()
    for (const game of games) {
      for (const genre of game.genres) set.add(genre)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [games])

  const visibleGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    const filtered = games.filter((game) => {
      if (query && !game.title.toLowerCase().includes(query)) return false
      if (genreFilter !== 'all' && !game.genres.includes(genreFilter)) return false
      if (quickFilter === 'installed' && game.installStatus !== 'installed') return false
      if (quickFilter === 'favorite' && !game.isFavorite) return false
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      // Installed games always anchor the top of the grid — owned-but-uninstalled
      // cloud entries never crowd out what the user can actually play right now.
      const installedRank = (g: Game): number => (g.installStatus === 'installed' ? 0 : 1)
      const installedDiff = installedRank(a) - installedRank(b)
      if (installedDiff !== 0) return installedDiff

      switch (sortMode) {
        case 'playtime':
          return b.playtimeMinutes - a.playtimeMinutes
        case 'alphabetical':
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })

    return sorted
  }, [games, searchQuery, genreFilter, quickFilter, sortMode])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-tajawal text-2xl font-bold text-white">المكتبة</h2>
          <p className="mt-1 text-sm text-white/45">
            {isLoading
              ? 'جارِ تحميل الألعاب المحفوظة...'
              : `لديك ${games.length} لعبة في مكتبتك.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleFetchArtwork}
            disabled={isFetchingArtwork || games.length === 0}
            className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface px-4 py-2.5 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFetchingArtwork ? 'جارِ تحديث الأغلفة...' : '🖼 تحديث الأغلفة'}
          </button>
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-glow transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanning ? 'جارِ الفحص...' : '🔍 فحص الألعاب المثبتة'}
          </button>
        </div>
      </header>

      {scanReport && (
        <ReportBanner>
          تم العثور على {scanReport.steamFound} لعبة من Steam و{scanReport.epicFound} لعبة من Epic
          Games — أُضيف {scanReport.newGames} لعبة جديدة ({scanReport.newSources} مصدر تشغيل جديد).
          {scanReport.errors.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {scanReport.errors.map((e, i) => (
                <li key={i} className="text-xs text-amber-400/80">
                  ⚠ {e.message}
                </li>
              ))}
            </ul>
          )}
        </ReportBanner>
      )}

      {artworkReport && (
        <ReportBanner>
          تمت معالجة {artworkReport.processed} لعبة — {artworkReport.fetched} غلاف جديد،{' '}
          {artworkReport.skipped} محفوظ مسبقاً، و{artworkReport.unavailable} بلا غلاف متاح.
        </ReportBanner>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          حدث خطأ: {error}
        </p>
      )}

      {games.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن لعبة... (عربي / English)"
            className="min-w-[220px] flex-1 rounded-lg border border-base-border bg-base-elevated px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent/60 focus:outline-none"
          />

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="rounded-lg border border-base-border bg-base-elevated px-3 py-2 text-sm text-white/80 focus:border-accent/60 focus:outline-none"
          >
            <option value="all">كل التصنيفات</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-base-border bg-base-elevated px-3 py-2 text-sm text-white/80 focus:border-accent/60 focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                ترتيب: {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 rounded-lg bg-base-elevated p-1">
            {QUICK_FILTERS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setQuickFilter(opt.value)}
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-bold transition-colors duration-200',
                  quickFilter === opt.value
                    ? 'bg-accent text-white shadow-glow'
                    : 'text-white/55 hover:bg-white/10 hover:text-white'
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isLoading && games.length === 0 && (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-base-border bg-base-surface/60 text-center">
          <p className="font-tajawal text-lg font-bold text-white/70">لا توجد ألعاب بعد</p>
          <p className="max-w-sm text-sm text-white/40">
            اضغط على زر "فحص الألعاب المثبتة" أعلاه لاكتشاف ألعابك من Steam وEpic Games تلقائياً.
          </p>
        </div>
      )}

      {games.length > 0 && visibleGames.length === 0 && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-base-border bg-base-surface/60 text-center">
          <p className="font-tajawal text-base font-bold text-white/70">لا توجد نتائج مطابقة</p>
          <p className="text-sm text-white/40">جرّب تعديل البحث أو الفلاتر.</p>
        </div>
      )}

      {visibleGames.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visibleGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportBanner({ children }: { children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-2xl border border-base-border bg-base-surface p-5 text-sm leading-relaxed text-white/60">
      {children}
    </section>
  )
}

function GameCard({ game }: { game: Game }): JSX.Element {
  const hours = Math.floor(game.playtimeMinutes / 60)
  const primaryGenre = game.genres[0] ?? null
  const isNotInstalled = game.installStatus === 'not_installed'
  const [coverFailed, setCoverFailed] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchFailed, setLaunchFailed] = useState(false)

  async function handleQuickPlay(e: ReactMouseEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    setIsLaunching(true)
    setLaunchFailed(false)
    try {
      const result = await window.api.game.launch(game.id)
      if (!result.ok) setLaunchFailed(true)
    } finally {
      setIsLaunching(false)
    }
  }

  return (
    <Link
      to={`/game/${game.id}`}
      className="group relative block aspect-[2/3] w-full overflow-hidden rounded-xl border border-base-border bg-base-surface transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-glow motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      title={game.title}
    >
      <div
        className={
          isNotInstalled
            ? 'h-full w-full opacity-45 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0'
            : 'h-full w-full'
        }
      >
        {game.coverPath && !coverFailed ? (
          <img
            src={`app-artwork://local/${game.coverPath}`}
            alt={game.title}
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <FallbackPoster title={game.title} />
        )}
      </div>

      {isNotInstalled && (
        <span
          title="مملوكة على Steam — غير مثبتة على هذا الجهاز"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm backdrop-blur"
        >
          ☁️
        </span>
      )}

      {!isNotInstalled && (
        <button
          type="button"
          onClick={handleQuickPlay}
          disabled={isLaunching}
          title="تشغيل سريع"
          className="absolute inset-0 z-10 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/90 text-white opacity-0 shadow-glow backdrop-blur transition-all duration-200 hover:scale-110 hover:bg-accent disabled:cursor-wait disabled:opacity-70 group-hover:opacity-100 motion-reduce:transition-none"
        >
          {isLaunching ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : launchFailed ? (
            <span className="text-lg">⚠</span>
          ) : (
            <PlayIcon className="h-5 w-5 translate-x-[-1px]" />
          )}
        </button>
      )}

      <div className="absolute inset-0 flex flex-col justify-end gap-1.5 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-3 opacity-0 transition-opacity duration-300 motion-reduce:transition-none group-hover:opacity-100">
        <h3 className="line-clamp-2 font-tajawal text-sm font-bold text-white">{game.title}</h3>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-white/70">
          {primaryGenre && <span>{primaryGenre}</span>}
          {primaryGenre && <span>•</span>}
          <span>{hours > 0 ? `${hours} ساعة لعب` : 'لم تُلعب بعد'}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {game.sources.map((source) => (
            <span
              key={source.id}
              className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60"
            >
              {STORE_LABELS[source.store]}
            </span>
          ))}
        </div>
      </div>
    </Link>
  )
}
