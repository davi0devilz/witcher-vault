import type { SteamSearchResultItem } from '../../shared/models'

interface StoreSearchResponse {
  total: number
  items: Array<{
    type: string
    id: number
    name: string
    tiny_image?: string
    price?: { currency: string; initial: number; final: number }
  }>
}

/**
 * Steam's storesearch endpoint only distinguishes "app" from "bundle" — DLC,
 * soundtracks and tools all come back as type "app" too. The real product
 * type ("game" vs "dlc"/"music"/"tool"/"demo"/...) only lives on the
 * appdetails endpoint, so results are cross-checked against it below.
 * Cached in-memory since it's static for the life of the app and the same
 * AppIDs resurface across searches.
 */
const appTypeCache = new Map<string, string | null>()

async function fetchAppType(appId: string): Promise<string | null> {
  const cached = appTypeCache.get(appId)
  if (cached !== undefined) return cached

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic&l=english`,
      { signal: controller.signal }
    )
    if (!res.ok) {
      appTypeCache.set(appId, null)
      return null
    }

    const json = (await res.json()) as Record<string, { success: boolean; data?: { type?: string } }>
    const type = json[appId]?.success ? json[appId].data?.type ?? null : null
    appTypeCache.set(appId, type)
    return type
  } catch {
    appTypeCache.set(appId, null)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await fn(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Free-text search across the entire Steam store, via the same public,
 * keyless JSON endpoint the store's own search box calls. Results are
 * narrowed to full games only — bundles are dropped by the storesearch type,
 * while DLC/soundtracks/tools/demos are dropped by cross-checking appdetails.
 */
export async function searchSteamStore(term: string): Promise<SteamSearchResultItem[]> {
  const trimmed = term.trim()
  if (!trimmed) return []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(trimmed)}&l=english&cc=us`,
      { signal: controller.signal }
    )
    if (!res.ok) return []

    const json = (await res.json()) as StoreSearchResponse
    const items = Array.isArray(json.items) ? json.items : []
    const appItems = items.filter((item) => item.type === 'app').slice(0, 30)

    const types = await mapWithConcurrency(appItems, 8, (item) => fetchAppType(String(item.id)))

    return appItems
      .filter((_, index) => types[index] === 'game')
      .map((item) => ({
        appId: String(item.id),
        name: item.name,
        tinyImage: item.tiny_image ?? null,
        priceFinal: typeof item.price?.final === 'number' ? item.price.final / 100 : null,
        priceCurrency: item.price?.currency ?? null
      }))
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}
