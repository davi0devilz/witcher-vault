import type { ArtworkBatchResult, ArtworkOutcome, Game } from '../../shared/models'
import { getAllGamesWithSources, updateGameArtwork } from '../db'
import { artworkFileExists, downloadImageToCache } from './artworkCache'
import { fetchSteamAppMetadata } from './steamMetadataApi'

const coverCandidates = (appId: string): string[] => [
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`
]

const heroCandidates = (appId: string): string[] => [
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`
]

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

  const [coverOk, heroOk, metadata] = await Promise.all([
    downloadFirstAvailable(coverCandidates(appId), coverFileName),
    downloadFirstAvailable(heroCandidates(appId), heroFileName),
    fetchSteamAppMetadata(appId)
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
