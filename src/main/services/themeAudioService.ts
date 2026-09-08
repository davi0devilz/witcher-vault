import { copyFileSync } from 'fs'
import { extname, join } from 'path'
import type { ThemeAudioResult } from '../../shared/models'
import { getGameWithSourcesById, setGameThemeAudio } from '../db'
import { audioFileExists, downloadAudioToCache, getAudioCacheDir } from './audioCache'
import { findThemeTrackUrl } from './khinsiderService'

/**
 * Resolves the ambient theme track for a game, caching the outcome (found or
 * not) so the same title is never re-scraped. A previously fetched/custom
 * track that's since disappeared from disk is treated as if never fetched,
 * so the next visit retries automatically instead of pointing at a dead file.
 */
export async function getThemeAudioForGame(
  gameId: number,
  title: string
): Promise<ThemeAudioResult | null> {
  const game = getGameWithSourcesById(gameId)
  if (!game) return null

  if (
    (game.themeAudioStatus === 'fetched' || game.themeAudioSource === 'custom') &&
    game.themeAudioPath &&
    audioFileExists(game.themeAudioPath)
  ) {
    return { path: game.themeAudioPath, source: game.themeAudioSource }
  }

  if (game.themeAudioStatus === 'unavailable') {
    return null
  }

  try {
    const trackUrl = await findThemeTrackUrl(title)
    if (!trackUrl) {
      setGameThemeAudio(gameId, null, null)
      return null
    }

    const fileName = `khinsider-${gameId}.mp3`
    const ok = await downloadAudioToCache(trackUrl, fileName)
    if (!ok) {
      setGameThemeAudio(gameId, null, null)
      return null
    }

    setGameThemeAudio(gameId, fileName, 'khinsider')
    return { path: fileName, source: 'khinsider' }
  } catch {
    setGameThemeAudio(gameId, null, null)
    return null
  }
}

export function setCustomThemeAudioFile(gameId: number, sourcePath: string): boolean {
  try {
    const ext = extname(sourcePath) || '.mp3'
    const fileName = `custom-audio-${gameId}-${Date.now()}${ext}`
    copyFileSync(sourcePath, join(getAudioCacheDir(), fileName))
    setGameThemeAudio(gameId, fileName, 'custom')
    return true
  } catch {
    return false
  }
}
