import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Game, SessionUpdate } from '../../../shared/models'
import FallbackPoster from '../components/FallbackPoster'

type Step = 'time' | 'mood' | 'result'
type TimeChoice = 'quick' | 'medium' | 'long'
type MoodChoice = 'relax' | 'action' | 'story'

const TIME_OPTIONS: Array<{ value: TimeChoice; label: string; hint: string }> = [
  { value: 'quick', label: 'جلسة سريعة', hint: 'أقل من 30 دقيقة' },
  { value: 'medium', label: 'جلسة متوسطة', hint: 'من ساعة إلى ساعتين' },
  { value: 'long', label: 'سهرة طويلة', hint: '+3 ساعات' }
]

const MOOD_OPTIONS: Array<{ value: MoodChoice; label: string; icon: string }> = [
  { value: 'relax', label: 'استرخاء وتسلية', icon: '😌' },
  { value: 'action', label: 'أكشن وتحدي', icon: '⚔️' },
  { value: 'story', label: 'قصة واستكشاف', icon: '🗺️' }
]

const MOOD_GENRES: Record<MoodChoice, string[]> = {
  relax: ['سهلة', 'مستقلة', 'محاكاة', 'عائلية'],
  action: ['إثارة', 'استراتيجية', 'أكشن'],
  story: ['مغامرة', 'تقمص أدوار', 'قصة']
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
}

function scoreGame(game: Game, time: TimeChoice, mood: MoodChoice): number {
  let score = 0

  if (MOOD_GENRES[mood].some((g) => game.genres.includes(g))) score += 4

  const isInProgress = game.playtimeMinutes > 0
  const isBacklog = game.playtimeMinutes === 0

  if (time === 'quick' && isInProgress) score += 3
  if (time === 'medium') score += isInProgress ? 2 : isBacklog ? 1 : 0
  if (time === 'long' && isBacklog) score += 3
  if (time === 'long' && isInProgress) score += 1

  if (daysSince(game.lastPlayedAt) > 14) score += 1

  score += Math.random() * 0.5
  return score
}

function pickGame(
  games: Game[],
  time: TimeChoice,
  mood: MoodChoice,
  excludedIds: Set<number>
): Game | null {
  const installed = games.filter((g) => g.installStatus === 'installed')
  if (installed.length === 0) return null

  let pool = installed.filter((g) => !excludedIds.has(g.id))
  if (pool.length === 0) pool = installed

  return pool.reduce<Game | null>((best, game) => {
    if (!best) return game
    return scoreGame(game, time, mood) > scoreGame(best, time, mood) ? game : best
  }, null)
}

export default function WhatToPlay(): JSX.Element {
  const [games, setGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [step, setStep] = useState<Step>('time')
  const [timeChoice, setTimeChoice] = useState<TimeChoice | null>(null)
  const [moodChoice, setMoodChoice] = useState<MoodChoice | null>(null)
  const [suggestion, setSuggestion] = useState<Game | null>(null)
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set())
  const [session, setSession] = useState<SessionUpdate | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.library.getGames().then((result) => {
      if (!cancelled) {
        setGames(result)
        setIsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!suggestion) return
    const unsubscribe = window.api.game.onSessionUpdate((update) => {
      if (update.gameId === suggestion.id) setSession(update)
    })
    return unsubscribe
  }, [suggestion])

  const installedCount = useMemo(
    () => games.filter((g) => g.installStatus === 'installed').length,
    [games]
  )

  function handleTimeChoice(value: TimeChoice): void {
    setTimeChoice(value)
    setStep('mood')
  }

  function handleMoodChoice(value: MoodChoice): void {
    if (!timeChoice) return
    setMoodChoice(value)
    const picked = pickGame(games, timeChoice, value, new Set())
    setSuggestion(picked)
    setExcludedIds(picked ? new Set([picked.id]) : new Set())
    setSession(null)
    setLaunchMessage(null)
    setStep('result')
  }

  function handleSuggestAnother(): void {
    if (!timeChoice || !moodChoice) return
    const picked = pickGame(games, timeChoice, moodChoice, excludedIds)
    setSuggestion(picked)
    if (picked) setExcludedIds((prev) => new Set(prev).add(picked.id))
    setSession(null)
    setLaunchMessage(null)
  }

  function handleRestart(): void {
    setStep('time')
    setTimeChoice(null)
    setMoodChoice(null)
    setSuggestion(null)
    setExcludedIds(new Set())
    setSession(null)
    setLaunchMessage(null)
  }

  async function handleLaunchNow(): Promise<void> {
    if (!suggestion) return
    setIsLaunching(true)
    setLaunchMessage(null)
    try {
      const result = await window.api.game.launch(suggestion.id)
      if (!result.ok) setLaunchMessage(result.message ?? 'تعذّر تشغيل اللعبة.')
    } finally {
      setIsLaunching(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-white/40">جارِ التحميل...</p>
  }

  if (installedCount === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-base-border bg-base-surface/60 text-center">
        <p className="font-tajawal text-lg font-bold text-white/70">لا توجد ألعاب في مكتبتك بعد</p>
        <p className="max-w-sm text-sm text-white/40">
          اذهب إلى المكتبة وافحص ألعابك المثبتة أولاً حتى نتمكن من اقتراح ما تلعبه.
        </p>
        <Link
          to="/library"
          className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
        >
          الذهاب إلى المكتبة
        </Link>
      </div>
    )
  }

  const isTracking = session?.status === 'starting' || session?.status === 'running'

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-tajawal text-2xl font-bold text-white">🎲 وش ألعب؟</h2>
        <p className="mt-1 text-sm text-white/45">
          أخبرنا عن وقتك ومزاجك، وسنقترح عليك اللعبة المناسبة من مكتبتك.
        </p>
      </header>

      {step === 'time' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTimeChoice(opt.value)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-base-border bg-base-surface p-8 text-center transition-colors duration-200 hover:border-accent/50 hover:bg-base-elevated"
            >
              <span className="font-tajawal text-lg font-bold text-white">{opt.label}</span>
              <span className="text-sm text-white/45">{opt.hint}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'mood' && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setStep('time')}
            className="self-start text-sm text-white/40 hover:text-white/70"
          >
            → رجوع
          </button>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleMoodChoice(opt.value)}
                className="flex flex-col items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-8 text-center transition-colors duration-200 hover:border-accent/50 hover:bg-base-elevated"
              >
                <span className="text-4xl">{opt.icon}</span>
                <span className="font-tajawal text-lg font-bold text-white">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'result' &&
        (suggestion ? (
          <div className="overflow-hidden rounded-3xl border border-base-border bg-base-surface shadow-glow">
            <div className="relative aspect-[21/9] w-full lg:aspect-[28/9]">
              {suggestion.heroPath ? (
                <img
                  src={`app-artwork://local/${suggestion.heroPath}`}
                  alt={suggestion.title}
                  className="h-full w-full object-cover"
                />
              ) : suggestion.coverPath ? (
                <img
                  src={`app-artwork://local/${suggestion.coverPath}`}
                  alt={suggestion.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full">
                  <FallbackPoster title={suggestion.title} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-base-surface via-base-surface/40 to-transparent" />
            </div>

            <div className="flex flex-col gap-5 p-8 md:p-10">
              <div>
                <h3 className="font-tajawal text-3xl font-bold text-white md:text-4xl">
                  {suggestion.title}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestion.genres.map((genre) => (
                    <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/70">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>

              {suggestion.shortDescription && (
                <p className="line-clamp-3 max-w-3xl text-base leading-loose text-white/60">
                  {suggestion.shortDescription}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to={`/game/${suggestion.id}`}
                  className="rounded-xl border border-base-border bg-base-elevated px-5 py-3 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
                >
                  عرض التفاصيل
                </Link>
                <button
                  type="button"
                  onClick={handleLaunchNow}
                  disabled={isLaunching || isTracking}
                  className="rounded-xl bg-accent px-7 py-3 text-base font-bold text-white shadow-glow transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isTracking
                    ? `▶ قيد اللعب الآن... ${session?.elapsedMinutes ?? 0} د`
                    : isLaunching
                      ? 'جارِ التشغيل...'
                      : '▶ تشغيل اللعبة فوراً'}
                </button>
                <button
                  type="button"
                  onClick={handleSuggestAnother}
                  className="rounded-xl border border-base-border bg-base-elevated px-5 py-3 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
                >
                  🎲 اقترح لعبة أخرى
                </button>
                <button
                  type="button"
                  onClick={handleRestart}
                  className="text-sm text-white/40 hover:text-white/70"
                >
                  🔄 البدء من جديد
                </button>
              </div>

              {launchMessage && <p className="text-sm text-red-400">{launchMessage}</p>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-base-border bg-base-surface/60 text-center">
            <p className="text-sm text-white/40">تعذّر إيجاد اقتراح مناسب.</p>
            <button
              type="button"
              onClick={handleRestart}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
            >
              إعادة المحاولة
            </button>
          </div>
        ))}
    </div>
  )
}
