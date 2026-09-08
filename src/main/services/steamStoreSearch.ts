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
 * Free-text search across the entire Steam store, via the same public,
 * keyless JSON endpoint the store's own search box calls.
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

    return items
      .filter((item) => item.type === 'app')
      .slice(0, 30)
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
