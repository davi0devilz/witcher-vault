import { copyFileSync } from 'fs'
import { extname, join } from 'path'
import type { ThemeAudioResult } from '../../shared/models'
import { getGameWithSourcesById, setGameThemeAudio } from '../db'
import { audioFileExists, downloadAudioToCache, getAudioCacheDir } from './audioCache'
import { findThemeTrackUrl } from './khinsiderService'

/**
 * Strips a subtitle and decoration off a game title so a failed lookup can be
 * retried with a plainer name — e.g. "The Witcher 3: Wild Hunt" -> "The
 * Witcher 3". Only splits on a colon or a space-padded dash (a genuine
 * subtitle separator), never a bare hyphen inside a word like "Spider-Man"
 * or "Half-Life", so compound titles aren't mangled. Returns null when
 * there's nothing to simplify, so callers know not to bother retrying.
 */
function simplifyGameTitle(title: string): string | null {
  const cleaned = title.replace(/[™®©]/g, '').trim()
  const base = cleaned.split(/:\s*|\s[-–—]\s/)[0].trim()
  if (!base || base.toLowerCase() === cleaned.toLowerCase()) return null
  return base
}

async function tryFetchTrack(searchTitle: string, fileName: string): Promise<boolean> {
  const trackUrl = await findThemeTrackUrl(searchTitle)
  if (!trackUrl) return false
  return downloadAudioToCache(trackUrl, fileName)
}

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
    const fileName = `khinsider-${gameId}.mp3`

    // First attempt: the exact title, unchanged — this is the path that
    // already succeeds ~90% of the time and must not be touched. Only when
    // it fails (no match, or the match's link doesn't download) is a second,
    // silent attempt made against a simplified title with the subtitle and
    // special characters stripped. No UI is involved in either attempt.
    let ok = await tryFetchTrack(title, fileName)
    if (!ok) {
      const simplified = simplifyGameTitle(title)
      if (simplified) {
        ok = await tryFetchTrack(simplified, fileName)
      }
    }

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
