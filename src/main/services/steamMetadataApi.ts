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
  timeoutMs = 10000
): Promise<SteamAppDetailsEntry['data'] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=${lang}`,
      { signal: controller.signal }
    )
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
