import type { FavoriteGameItem } from '../../shared/models'
import { getFavoriteGamesWithSources } from '../db'
import { mapWithConcurrency } from './concurrency'
import { fetchSimplePrice } from './steamMetadataApi'

/**
 * Favorites can hold both owned library games and Steam Explorer picks the
 * user is only watching — the latter get a live US price attached so the
 * grid doubles as a lightweight price-tracking wishlist. Owned games never
 * had pricing stored locally, so their price is left null rather than
 * spending a network call on something the user already owns.
 */
export async function getFavoritesWithPricing(): Promise<FavoriteGameItem[]> {
  const games = getFavoriteGamesWithSources()

  return mapWithConcurrency(games, 5, async (game) => {
    const steamAppId = game.sources.find((s) => s.store === 'steam' && s.storeAppId)?.storeAppId ?? null

    let isFree = false
    let priceFinal: number | null = null
    let priceCurrency: string | null = null

    if (steamAppId && !game.isOwned) {
      const price = await fetchSimplePrice(steamAppId)
      if (price) {
        isFree = price.isFree
        priceFinal = price.final
        priceCurrency = price.currency
      }
    }

    return {
      gameId: game.id,
      title: game.title,
      coverPath: game.coverPath,
      isOwned: game.isOwned,
      steamAppId,
      isFree,
      priceFinal,
      priceCurrency
    }
  })
}
