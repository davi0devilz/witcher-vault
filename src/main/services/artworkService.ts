import type { ArtworkBatchResult, ArtworkOutcome, Game } from '../../shared/models'
import { getAllGamesWithSources, updateGameArtwork } from '../db'
import { artworkFileExists, downloadImageToCache } from './artworkCache'
import { getCoverOptions, getHeroOptions } from './coverPickerService'
import { fetchSteamAppMetadata, fetchSteamStoreImages } from './steamMetadataApi'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function downloadFirstAvailable(candidates: string[], fileName: string): Promise<boolean> {
  for (const url of candidates) {
    if (await downloadImageToCache(url, fileName)) return true
  }
  return false
}

export async function fetchArtworkForGame(game: Game, forceRefresh = false): Promise<ArtworkOutcome> {
  const steamSource = game.sources.find((s) => s.store === 'steam' && s.storeAppId)
  if (!steamSource?.storeAppId) {
    return { gameId: game.id, title: game.title, status: 'unavailable' }
  }

  const appId = steamSource.storeAppId
  const coverFileName = `steam-${appId}-cover.jpg`
  const heroFileName = `steam-${appId}-hero.jpg`

  const alreadyCached =
    !forceRefresh && game.artworkStatus === 'fetched' && artworkFileExists(coverFileName)
  if (alreadyCached) {
    return { gameId: game.id, title: game.title, status: 'skipped' }
  }

  // Sourced from the same options the manual cover/hero picker offers (Steam's
  // legacy CDN guesses, the real header_image from appdetails, and SteamGridDB)
  // plus screenshots as a last resort — very recently released games often
  // have nothing at all on Steam's legacy flat-file CDN paths, so relying on
  // those alone left new titles with a broken/missing background.
  const [coverOptions, heroOptions, storeImages, metadata] = await Promise.all([
    getCoverOptions(appId),
    getHeroOptions(appId),
    fetchSteamStoreImages(appId),
    fetchSteamAppMetadata(appId)
  ])

  const coverCandidates = coverOptions.options.map((o) => o.url)
  const heroCandidates = [...heroOptions.map((o) => o.url), ...(storeImages?.screenshots ?? [])]

  const [coverOk, heroOk] = await Promise.all([
    downloadFirstAvailable(coverCandidates, coverFileName),
    downloadFirstAvailable(heroCandidates, heroFileName)
  ])

  updateGameArtwork(game.id, {
    coverPath: coverOk ? coverFileName : null,
    heroPath: heroOk ? heroFileName : null,
    genres: metadata?.genres ?? [],
    shortDescription: metadata?.shortDescription ?? null,
    detailedDescription: metadata?.detailedDescription ?? null,
    descriptionLanguage: metadata?.descriptionLanguage ?? null,
    releaseDate: metadata?.releaseDate ?? null,
    developer: metadata?.developer ?? null,
    publisher: metadata?.publisher ?? null
  })

  return { gameId: game.id, title: game.title, status: coverOk ? 'fetched' : 'unavailable' }
}

export async function fetchArtworkForLibrary(forceRefresh = false): Promise<ArtworkBatchResult> {
  const games = getAllGamesWithSources()
  const outcomes: ArtworkOutcome[] = []
  let fetched = 0
  let unavailable = 0
  let skipped = 0

  for (const game of games) {
    const outcome = await fetchArtworkForGame(game, forceRefresh)
    outcomes.push(outcome)
    if (outcome.status === 'fetched') fetched++
    else if (outcome.status === 'unavailable') unavailable++
    else skipped++

    if (outcome.status !== 'skipped') {
      // Be a polite citizen of Steam's storefront API between real network calls.
      await delay(200)
    }
  }

  return {
    processed: games.length,
    fetched,
    unavailable,
    skipped,
    outcomes,
    games: getAllGamesWithSources()
  }
}
