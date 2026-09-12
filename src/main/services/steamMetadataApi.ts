export interface SteamAppMetadata {
  shortDescription: string | null
  detailedDescription: string | null
  descriptionLanguage: 'ar' | 'en'
  genres: string[]
  releaseDate: string | null
  developer: string | null
  publisher: string | null
}

interface SteamAppDetailsEntry {
  success: boolean
  data?: {
    short_description?: string
    about_the_game?: string
    genres?: Array<{ id: string; description: string }>
    release_date?: { coming_soon: boolean; date: string }
    developers?: string[]
    publishers?: string[]
    header_image?: string
    screenshots?: Array<{ path_full?: string }>
    is_free?: boolean
    price_overview?: { currency: string; final: number }
    movies?: Array<{
      webm?: { '480'?: string; max?: string }
      mp4?: { '480'?: string; max?: string }
      dash_h264?: string
      dash_av1?: string
    }>
  }
}

type SteamAppDetailsResponse = Record<string, SteamAppDetailsEntry>

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function requestAppDetails(
  appId: string,
  lang: string,
  options: { timeoutMs?: number; cc?: string; filters?: string } = {}
): Promise<SteamAppDetailsEntry['data'] | null> {
  const { timeoutMs = 10000, cc, filters } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const params = new URLSearchParams({ appids: appId, l: lang })
    if (cc) params.set('cc', cc)
    if (filters) params.set('filters', filters)

    const res = await fetch(`https://store.steampowered.com/api/appdetails?${params.toString()}`, {
      signal: controller.signal
    })
    if (!res.ok) return null

    const json = (await res.json()) as SteamAppDetailsResponse
    const entry = json[appId]
    if (!entry?.success || !entry.data) return null
    return entry.data
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetches official Steam storefront metadata for an AppID. Tries Arabic first
 * to serve localized descriptions when available, falling back to English —
 * never fabricates a description when Steam has none.
 */
export async function fetchSteamAppMetadata(appId: string): Promise<SteamAppMetadata | null> {
  for (const lang of ['arabic', 'english'] as const) {
    const data = await requestAppDetails(appId, lang)
    if (!data) continue
    if (lang === 'arabic' && !data.short_description) continue

    return {
      shortDescription: data.short_description?.trim() || null,
      detailedDescription: data.about_the_game ? stripHtml(data.about_the_game) || null : null,
      descriptionLanguage: lang === 'arabic' ? 'ar' : 'en',
      genres: (data.genres ?? []).map((g) => g.description),
      releaseDate: data.release_date?.date || null,
      developer: data.developers?.[0] ?? null,
      publisher: data.publishers?.[0] ?? null
    }
  }
  return null
}

export interface SteamStoreImages {
  headerImage: string | null
  screenshots: string[]
}

/**
 * Fetches the official header image Steam ships for an AppID — used as a
 * hero/banner fallback alongside library_hero.jpg. `screenshots` is
 * deliberately never offered as a choice in the manual cover/hero picker
 * (they're gameplay captures, not banner artwork) — it exists only so the
 * automatic background-fetch pipeline has a last-resort fallback for very
 * new games whose official banner assets aren't on Steam's legacy CDN yet.
 */
export async function fetchSteamStoreImages(appId: string): Promise<SteamStoreImages | null> {
  const data = await requestAppDetails(appId, 'english')
  if (!data) return null

  return {
    headerImage: data.header_image ?? null,
    screenshots: (data.screenshots ?? []).map((s) => s.path_full).filter((url): url is string => Boolean(url))
  }
}

export interface SteamMovieEntry {
  /** Direct progressive video URLs — present only on older store trailers. */
  webm480: string | null
  mp4480: string | null
  webmMax: string | null
  mp4Max: string | null
  /** DASH manifest URL — how virtually every current Steam trailer is served. */
  dashManifestUrl: string | null
}

/**
 * Lists a Steam AppID's store trailers, in the order Steam returns them
 * (first is the storefront's featured/highlight trailer). Each entry
 * surfaces whatever the store actually gives for it: legacy direct
 * webm/mp4 links on older catalog entries, or — for essentially every
 * current trailer — only a DASH manifest URL, which callers extracting
 * just the audio track need to resolve via `extractDashAudioTrack`.
 */
export async function fetchSteamMovies(appId: string): Promise<SteamMovieEntry[]> {
  const data = await requestAppDetails(appId, 'english', { filters: 'basic,movies' })
  if (!data?.movies?.length) return []

  return data.movies.map((movie) => ({
    webm480: movie.webm?.['480'] ?? null,
    mp4480: movie.mp4?.['480'] ?? null,
    webmMax: movie.webm?.max ?? null,
    mp4Max: movie.mp4?.max ?? null,
    dashManifestUrl: movie.dash_h264 ?? movie.dash_av1 ?? null
  }))
}

export interface SimplePrice {
  isFree: boolean
  final: number | null
  currency: string | null
}

/**
 * Lightweight US-region price lookup for an AppID — used by the Favorites
 * grid to show a current price next to games the user is only tracking (not
 * owned). Uses a narrow `filters` value to keep the response small since it
 * only needs is_free/price_overview, not the full app details payload.
 */
export async function fetchSimplePrice(appId: string): Promise<SimplePrice | null> {
  const data = await requestAppDetails(appId, 'english', { cc: 'us', filters: 'basic,price_overview' })
  if (!data) return null

  if (data.is_free) return { isFree: true, final: null, currency: null }
  if (!data.price_overview) return null

  return {
    isFree: false,
    final: data.price_overview.final / 100,
    currency: data.price_overview.currency
  }
}
