import { copyFileSync, statSync } from 'fs'
import { extname, join } from 'path'
import type { ThemeAudioResult } from '../../shared/models'
import { getGameWithSourcesById, setGameThemeAudio } from '../db'
import {
  audioFileExists,
  downloadAudioToCache,
  downloadVideoAudioToCache,
  getAudioCacheDir,
  saveBufferToCache
} from './audioCache'
import { extractDashAudioTrack } from './dashAudioExtractor'
import { findThemeTrackUrl } from './khinsiderService'
import { findLocalThemeAudioFile } from './localAudioScanner'
import { fetchSteamMovies, type SteamMovieEntry } from './steamMetadataApi'
import { searchSteamStore } from './steamStoreSearch'
import { findYoutubeThemeAudio } from './youtubeAudioService'

/**
 * Every step of the pipeline logs through here rather than staying silent —
 * this is a scraping-heavy, multi-tier best-effort lookup with several
 * external, undocumented dependencies (KHInsider's HTML, Steam's DASH
 * manifests, public Invidious instances), so when a specific game keeps
 * coming back empty the terminal running `npm run dev` needs to show
 * exactly which tier was tried, what it found, and why it gave up.
 */
function log(gameId: number, title: string, message: string): void {
  console.log(`[theme-audio] #${gameId} "${title}": ${message}`)
}

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
 * Tries a single trailer's direct progressive video links (lightest
 * rendition first) — only present on older store entries Steam hasn't
 * migrated off legacy hosting.
 */
async function tryDirectMovieAudio(
  movie: SteamMovieEntry,
  gameId: number,
  title: string
): Promise<ThemeAudioResult | null> {
  const candidates: Array<{ url: string; extension: 'webm' | 'mp4' }> = []
  if (movie.webm480) candidates.push({ url: movie.webm480, extension: 'webm' })
  if (movie.mp4480) candidates.push({ url: movie.mp4480, extension: 'mp4' })
  if (movie.webmMax) candidates.push({ url: movie.webmMax, extension: 'webm' })
  if (movie.mp4Max) candidates.push({ url: movie.mp4Max, extension: 'mp4' })

  if (candidates.length === 0) {
    log(gameId, title, 'trailer has no direct webm/mp4 links (expected — modern trailers are DASH-only)')
    return null
  }

  for (const candidate of candidates) {
    const fileName = `steam-movie-${gameId}.${candidate.extension}`
    if (await downloadVideoAudioToCache(candidate.url, fileName)) {
      log(gameId, title, `direct trailer download succeeded (${candidate.extension})`)
      return { path: fileName, source: 'steam-movie' }
    }
    log(gameId, title, `direct trailer download failed or rejected: ${candidate.url}`)
  }
  return null
}

/**
 * Last-resort fallback for games with no dedicated soundtrack on KHInsider —
 * mostly newer releases KHInsider hasn't indexed yet. Steam's own store
 * trailers are pulled instead and played back through an <audio> element for
 * their audio track alone, video frames simply never being decoded.
 *
 * Every current Steam trailer is served as a DASH manifest with no direct
 * video link at all, so the legacy webm/mp4 fields (tried first, for the
 * rare older catalog entry that still has them) are backed by a DASH
 * audio-track extraction that works for virtually everything else.
 */
async function tryFetchSteamMovieAudio(
  steamAppId: string,
  gameId: number,
  title: string
): Promise<ThemeAudioResult | null> {
  const movies = await fetchSteamMovies(steamAppId)
  log(gameId, title, `Steam appdetails (appid=${steamAppId}) returned ${movies.length} trailer(s)`)
  if (movies.length === 0) return null

  for (const [index, movie] of movies.entries()) {
    const direct = await tryDirectMovieAudio(movie, gameId, title)
    if (direct) return direct

    if (!movie.dashManifestUrl) {
      log(gameId, title, `trailer #${index + 1} has no DASH manifest URL either — skipping`)
      continue
    }

    log(gameId, title, `trailer #${index + 1}: extracting audio from DASH manifest ${movie.dashManifestUrl}`)
    const buffer = await extractDashAudioTrack(movie.dashManifestUrl, (msg) => log(gameId, title, `  dash: ${msg}`))
    if (buffer) {
      const fileName = `steam-movie-dash-${gameId}.mp4`
      if (saveBufferToCache(fileName, buffer, 100000)) {
        log(gameId, title, `DASH audio extraction succeeded (${buffer.byteLength} bytes)`)
        return { path: fileName, source: 'steam-movie' }
      }
      log(gameId, title, 'DASH audio buffer was produced but too small/failed to save — discarding')
    }
  }
  return null
}

/**
 * Resolves an AppID to look up trailers for: the game's own linked Steam
 * source when it has one, otherwise a best-effort storefront search by
 * title. This is what lets manually-added or Epic-only library entries
 * (which never got a Steam source from a library sync) still reach the
 * Steam-trailer fallback tier — nothing is written back to the game record,
 * this AppID is only ever used for this one audio lookup.
 */
async function resolveSteamAppIdForAudio(
  game: { title: string; sources: Array<{ store: string; storeAppId: string | null }> },
  gameId: number
): Promise<string | null> {
  const linked = game.sources.find((s) => s.store === 'steam')?.storeAppId
  if (linked) {
    log(gameId, game.title, `using linked Steam source, appid=${linked}`)
    return linked
  }

  log(gameId, game.title, 'no linked Steam source — searching the Steam store by title')
  const results = await searchSteamStore(game.title)
  const appId = results[0]?.appId ?? null
  log(
    gameId,
    game.title,
    appId
      ? `store search resolved appid=${appId} (${results[0].name})`
      : 'store search found no matching game'
  )
  return appId
}

async function tryFetchYoutubeThemeAudio(title: string, gameId: number): Promise<ThemeAudioResult | null> {
  const match = await findYoutubeThemeAudio(title, (msg) => log(gameId, title, `  youtube: ${msg}`))
  if (!match) return null

  const fileName = `youtube-${gameId}.${match.extension}`
  if (await downloadAudioToCache(match.url, fileName)) {
    return { path: fileName, source: 'youtube' }
  }
  log(gameId, title, 'youtube audio stream URL found but download failed/rejected')
  return null
}

/**
 * Copies whatever menu-theme-looking audio file was found in the game's own
 * install folder into the audio cache. Only ever attempted for installed
 * games — a cloud-owned/not-installed entry has no local folder to scan.
 */
function tryLocalInstallAudio(
  game: { sources: Array<{ installDir: string | null }> },
  gameId: number,
  title: string
): ThemeAudioResult | null {
  const installDir = game.sources.find((s) => s.installDir)?.installDir
  if (!installDir) {
    log(gameId, title, 'no local install folder known — skipping local-file scan')
    return null
  }

  log(gameId, title, `scanning install folder for audio files: ${installDir}`)
  const filePath = findLocalThemeAudioFile(installDir)
  if (!filePath) {
    log(gameId, title, 'no qualifying .mp3/.ogg file found in install folder')
    return null
  }

  try {
    if (statSync(filePath).size < 1) return null
    const ext = extname(filePath) || '.mp3'
    const fileName = `local-audio-${gameId}${ext}`
    copyFileSync(filePath, join(getAudioCacheDir(), fileName))
    log(gameId, title, `using local file: ${filePath}`)
    return { path: fileName, source: 'local-install' }
  } catch (err) {
    log(gameId, title, `failed to copy local file: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Resolves the ambient theme track for a game, caching the outcome (found or
 * not) so the same title is never re-scraped. A previously fetched/custom
 * track that's since disappeared from disk is treated as if never fetched,
 * so the next visit retries automatically instead of pointing at a dead file.
 * Pass `forceRefresh` to bypass both the cached-file and cached-"unavailable"
 * checks and run every tier again from scratch (the manual retry button).
 *
 * Fallback tiers, in order: (1) KHInsider soundtrack by exact title, then by
 * a simplified title; (2) a Steam store trailer's audio track, resolving an
 * AppID by title search first when the game has no linked Steam source;
 * (3) a YouTube "official theme/OST" search via public Invidious instances
 * (best-effort — most public instances sit behind a CAPTCHA wall today, so
 * this tier is the least reliable of the four and often comes back empty);
 * (4) for games actually installed locally, an .mp3/.ogg file scanned out of
 * the install folder itself.
 */
export async function getThemeAudioForGame(
  gameId: number,
  title: string,
  forceRefresh = false
): Promise<ThemeAudioResult | null> {
  const game = getGameWithSourcesById(gameId)
  if (!game) return null

  if (
    !forceRefresh &&
    (game.themeAudioStatus === 'fetched' || game.themeAudioSource === 'custom') &&
    game.themeAudioPath &&
    audioFileExists(game.themeAudioPath)
  ) {
    return { path: game.themeAudioPath, source: game.themeAudioSource }
  }

  if (!forceRefresh && game.themeAudioStatus === 'unavailable') {
    return null
  }

  log(gameId, title, forceRefresh ? 'manual retry requested — running full pipeline' : 'no cached track — running pipeline')

  try {
    const fileName = `khinsider-${gameId}.mp3`

    // First attempt: the exact title, unchanged — this is the path that
    // already succeeds ~90% of the time and must not be touched. Only when
    // it fails (no match, or the match's link doesn't download) is a second,
    // silent attempt made against a simplified title with the subtitle and
    // special characters stripped. No UI is involved in either attempt.
    let ok = await tryFetchTrack(title, fileName)
    if (!ok) {
      log(gameId, title, 'KHInsider: no match for exact title')
      const simplified = simplifyGameTitle(title)
      if (simplified) {
        ok = await tryFetchTrack(simplified, fileName)
        if (!ok) log(gameId, title, `KHInsider: no match for simplified title "${simplified}" either`)
      }
    }

    if (ok) {
      log(gameId, title, 'KHInsider match found — using it')
      setGameThemeAudio(gameId, fileName, 'khinsider')
      return { path: fileName, source: 'khinsider' }
    }

    const steamAppId = await resolveSteamAppIdForAudio(game, gameId)
    if (steamAppId) {
      const movieResult = await tryFetchSteamMovieAudio(steamAppId, gameId, title)
      if (movieResult) {
        setGameThemeAudio(gameId, movieResult.path, 'steam-movie')
        return movieResult
      }
      log(gameId, title, 'Steam trailer tier exhausted with no usable audio')
    }

    const youtubeResult = await tryFetchYoutubeThemeAudio(title, gameId)
    if (youtubeResult) {
      log(gameId, title, 'YouTube/Invidious match found — using it')
      setGameThemeAudio(gameId, youtubeResult.path, 'youtube')
      return youtubeResult
    }

    const localResult = tryLocalInstallAudio(game, gameId, title)
    if (localResult) {
      setGameThemeAudio(gameId, localResult.path, 'local-install')
      return localResult
    }

    log(gameId, title, 'all tiers exhausted — marking unavailable')
    setGameThemeAudio(gameId, null, null)
    return null
  } catch (err) {
    log(gameId, title, `pipeline threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`)
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
