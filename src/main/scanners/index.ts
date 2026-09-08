import { getAllGamesWithSources, upsertScannedGames } from '../db'
import type { ScanReport } from '../../shared/models'
import { scanEpicGames } from './epicScanner'
import { scanSteamGames } from './steamScanner'

export async function runFullScan(): Promise<ScanReport> {
  const [steamResult, epicResult] = await Promise.all([scanSteamGames(), scanEpicGames()])

  const errors = [...steamResult.errors, ...epicResult.errors]
  const combined = [...steamResult.games, ...epicResult.games]
  const { newGames, newSources } = upsertScannedGames(combined)
  const games = getAllGamesWithSources()

  return {
    scannedAt: new Date().toISOString(),
    steamFound: steamResult.games.length,
    epicFound: epicResult.games.length,
    newGames,
    newSources,
    errors,
    games
  }
}
