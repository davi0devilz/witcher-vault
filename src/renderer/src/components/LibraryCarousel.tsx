import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Game, HltbResult } from '../../../shared/models'
import FallbackPoster from './FallbackPoster'
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from './icons'

function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return 'لم تُلعب بعد'
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes} دقيقة`
  return `${hours} ساعة لعب`
}

function formatHltbHours(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const hours = seconds / 3600
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)} ساعة لإنهاء القصة`
}

// Gamepad face-button/dpad indices follow the standard mapping — button 0
// is the primary "confirm" action (A / Cross), 14/15 are dpad left/right.
const GAMEPAD_CONFIRM_BUTTON = 0
const GAMEPAD_DPAD_LEFT = 14
const GAMEPAD_DPAD_RIGHT = 15
const GAMEPAD_AXIS_DEADZONE = 0.5

export default function LibraryCarousel({ games }: { games: Game[] }): JSX.Element {
  const navigate = useNavigate()
  const [activeIndex, setActiveIndex] = useState(0)
  const [hltb, setHltb] = useState<HltbResult | null>(null)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(games.length - 1, 0)))
  }, [games.length])

  const activeGame = games[activeIndex] ?? null
  const activeGameRef = useRef(activeGame)
  useEffect(() => {
    activeGameRef.current = activeGame
  }, [activeGame])

  useEffect(() => {
    if (!activeGame) {
      setHltb(null)
      return undefined
    }
    let cancelled = false
    setHltb(null)
    // A short debounce keeps rapid arrow-key/gamepad browsing from firing an
    // HLTB lookup for every card flicked past — only the one the user
    // actually settles on gets queried.
    const timer = setTimeout(() => {
      window.api.hltb
        .getForGame(activeGame.id, activeGame.title)
        .then((result) => {
          if (!cancelled) setHltb(result)
        })
        .catch(() => {
          // How-long-to-beat data is a nice-to-have — never surfaced as an error.
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeGame?.id, activeGame?.title])

  useEffect(() => {
    cardRefs.current[activeIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    })
  }, [activeIndex])

  const moveBy = useCallback(
    (delta: number) => {
      setActiveIndex((i) => {
        if (games.length === 0) return i
        return Math.min(Math.max(i + delta, 0), games.length - 1)
      })
    },
    [games.length]
  )

  const openActive = useCallback(() => {
    const game = activeGameRef.current
    if (game) navigate(`/game/${game.id}`)
  }, [navigate])

  // The UI is RTL: index 0 renders at the rightmost position and increasing
  // index moves left, so the arrow keys are mapped to spatial direction
  // rather than array order.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        moveBy(1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        moveBy(-1)
      } else if (e.key === 'Enter') {
        openActive()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [moveBy, openActive])

  // Polls the first connected gamepad every animation frame — the Gamepad API
  // has no event for button/axis changes, so state has to be diffed manually
  // against the previous frame to fire moveBy/openActive only on press edges.
  useEffect(() => {
    let rafId = 0
    const prev = { left: false, right: false, confirm: false }

    function poll(): void {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const pad = pads[0]
      if (pad) {
        const axisX = pad.axes[0] ?? 0
        const left = Boolean(pad.buttons[GAMEPAD_DPAD_LEFT]?.pressed) || axisX < -GAMEPAD_AXIS_DEADZONE
        const right = Boolean(pad.buttons[GAMEPAD_DPAD_RIGHT]?.pressed) || axisX > GAMEPAD_AXIS_DEADZONE
        const confirm = Boolean(pad.buttons[GAMEPAD_CONFIRM_BUTTON]?.pressed)

        if (left && !prev.left) moveBy(1)
        if (right && !prev.right) moveBy(-1)
        if (confirm && !prev.confirm) openActive()

        prev.left = left
        prev.right = right
        prev.confirm = confirm
      }
      rafId = requestAnimationFrame(poll)
    }

    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [moveBy, openActive])

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>): void {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.currentTarget.scrollLeft += e.deltaY
  }

  function scrollTrackBy(direction: 1 | -1): void {
    const el = trackRef.current
    if (!el) return
    const amount = Math.max(el.clientWidth * 0.8, 320) * direction
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

  if (games.length === 0) return <></>

  const hltbLabel = formatHltbHours(hltb?.mainSeconds)

  return (
    <div className="-mx-8 flex flex-col gap-6 lg:-mx-10">
      <section className="relative h-[58vh] min-h-[380px] w-full overflow-hidden">
        {games.map((game, i) => (
          <div
            key={game.id}
            className={[
              'absolute inset-0 transition-opacity duration-700 ease-out',
              i === activeIndex ? 'opacity-100' : 'opacity-0'
            ].join(' ')}
          >
            {game.heroPath ? (
              <img
                src={`app-artwork://local/${game.heroPath}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-accent/20 via-base-elevated to-black" />
            )}
          </div>
        ))}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

        {activeGame && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-8 pb-6 lg:px-10">
            <div>
              <h2 className="font-tajawal text-3xl font-bold text-white drop-shadow">
                {activeGame.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70">
                {activeGame.genres.slice(0, 3).map((genre) => (
                  <span key={genre} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                    {genre}
                  </span>
                ))}
                <span>⏱ {formatPlaytime(activeGame.playtimeMinutes)}</span>
                {hltbLabel && <span>⏳ {hltbLabel}</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to={`/game/${activeGame.id}`}
                className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white shadow-glow transition-colors duration-200 hover:bg-accent-soft"
              >
                <PlayIcon className="h-4 w-4" /> عرض التفاصيل
              </Link>
            </div>
          </div>
        )}
      </section>

      <div className="relative">
        <button
          type="button"
          onClick={() => scrollTrackBy(-1)}
          title="السابق"
          className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-base-border bg-black/60 text-white backdrop-blur transition-colors duration-200 hover:bg-black/80 hover:border-accent/40 lg:left-4"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollTrackBy(1)}
          title="التالي"
          className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-base-border bg-black/60 text-white backdrop-blur transition-colors duration-200 hover:bg-black/80 hover:border-accent/40 lg:right-4"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>

        {/*
          Cards scale up from their bottom edge (origin-bottom) so only their
          top grows — but `overflow-x: auto` here forces the browser to also
          compute `overflow-y` as non-visible (per the CSS Overflow spec, a
          scrolling axis can't be paired with a truly "visible" other axis),
          so anything a card grows past this element's own box still gets
          clipped. The generous pt-20 reserves enough headroom *inside* this
          element's own padding box for the largest scaled card to grow into
          without ever crossing that boundary — that's what actually
          prevents the clipping, not overflow-y-visible below (kept for
          intent/documentation, but the browser downgrades it to 'auto'
          anyway once overflow-x is non-visible).
        */}
        <div
          ref={trackRef}
          onWheel={handleWheel}
          className="no-scrollbar flex items-end gap-4 overflow-x-auto overflow-y-visible px-8 pb-8 pt-20 lg:px-10"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {games.map((game, i) => (
            <CarouselCard
              key={game.id}
              ref={(el) => {
                cardRefs.current[i] = el
              }}
              game={game}
              active={i === activeIndex}
              onSelect={() => setActiveIndex(i)}
              onOpen={() => navigate(`/game/${game.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const CarouselCard = forwardRef<
  HTMLDivElement,
  { game: Game; active: boolean; onSelect: () => void; onOpen: () => void }
>(function CarouselCard({ game, active, onSelect, onOpen }, ref) {
  const [coverFailed, setCoverFailed] = useState(false)
  const isNotInstalled = game.installStatus === 'not_installed'

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={game.title}
      style={{ scrollSnapAlign: 'center' }}
      className={[
        // origin-bottom anchors the scale to the card's base rather than its
        // center, so a scaled-up card only grows upward into the track's
        // pt-20 headroom instead of also pushing downward out of the row.
        'group relative aspect-[2/3] w-32 shrink-0 origin-bottom cursor-pointer overflow-hidden rounded-xl border bg-base-surface transition-all duration-200 ease-out sm:w-36 md:w-40',
        active
          ? 'z-10 scale-125 border-accent shadow-glow'
          : 'scale-100 border-base-border opacity-50 hover:scale-105 hover:opacity-90 hover:shadow-glow'
      ].join(' ')}
    >
      <div
        className={
          isNotInstalled
            ? [
                'h-full w-full transition-all duration-300',
                active ? 'opacity-90 grayscale-[0.4]' : 'opacity-75 grayscale'
              ].join(' ')
            : 'h-full w-full'
        }
      >
        {game.coverPath && !coverFailed ? (
          <img
            src={`app-artwork://local/${game.coverPath}`}
            alt={game.title}
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <FallbackPoster title={game.title} />
        )}
      </div>

      {isNotInstalled && (
        <span
          title="مملوكة على Steam — غير مثبتة على هذا الجهاز"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] backdrop-blur"
        >
          ☁️
        </span>
      )}
    </div>
  )
})
