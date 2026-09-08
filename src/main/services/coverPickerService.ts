import { copyFileSync } from 'fs'
import { extname, join } from 'path'
import type { CoverOption } from '../../shared/models'
import { getMeta, setGameCover, setGameHero } from '../db'
import { downloadImageToCache, getArtworkCacheDir } from './artworkCache'
import { fetchSteamStoreImages } from './steamMetadataApi'

// A shared, app-level SteamGridDB key so community cover/hero art works out
// of the box — SteamGridDB keys only grant read access to its public image
// database, never to any user account. Settings lets a user override it with
// their own free key if they prefer.
const DEFAULT_STEAMGRIDDB_KEY = '71a4cabf8966b9f3451670303186b228'

export function getEffectiveSteamGridDbKey(): string {
  const custom = getMeta('steamgriddb_api_key')
  return custom && custom.trim() ? custom.trim() : DEFAULT_STEAMGRIDDB_KEY
}

interface SteamGridDbImage {
  id: number
  url: string
  width: number
  height: number
  style?: string
}

interface SteamGridDbResponse {
  success: boolean
  data?: SteamGridDbImage[]
}

function isPortrait2to3(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  return Math.abs(width / height - 2 / 3) < 0.05
}

function isWideBanner(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  return width / height > 1.5
}

async function fetchSteamGridDbImages(
  endpoint: 'grids' | 'heroes',
  appId: string,
  apiKey: string,
  dimensions: string
): Promise<SteamGridDbImage[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(
      `https://www.steamgriddb.com/api/v2/${endpoint}/steam/${encodeURIComponent(appId)}?dimensions=${dimensions}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal }
    )
    if (!res.ok) return []

    const json = (await res.json()) as SteamGridDbResponse
    if (!json.success || !json.data) return []
    return json.data
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

export interface CoverOptionsResult {
  options: CoverOption[]
  steamGridDbConfigured: boolean
}

/**
 * Cover (poster) choices only — strictly the vertical 2:3 grid image, never
 * screenshots or wide banners, so nothing gets stretched or cropped into the
 * poster slot. The official Steam library grid always comes from Steam's own
 * CDN; genuine community design variety additionally comes from SteamGridDB
 * when the user has supplied their own free API key in Settings.
 */
export async function getCoverOptions(appId: string): Promise<CoverOptionsResult> {
  const options: CoverOption[] = [
    {
      id: 'steam-library',
      url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
      source: 'steam',
      width: 600,
      height: 900
    }
  ]

  const apiKey = getEffectiveSteamGridDbKey()
  const grids = await fetchSteamGridDbImages('grids', appId, apiKey, '600x900')
  options.push(
    ...grids
      .filter((g) => isPortrait2to3(g.width, g.height))
      .slice(0, 16)
      .map((g) => ({
        id: `sgdb-grid-${g.id}`,
        url: g.url,
        source: 'steamgriddb' as const,
        width: g.width,
        height: g.height
      }))
  )

  return { options, steamGridDbConfigured: true }
}

/**
 * Hero (wide banner) choices — kept entirely separate from cover options.
 * SteamGridDB's dedicated "heroes" artwork comes first: it's purpose-made
 * background art at 1920x620 up to 3840x1240, versus Steam's own
 * header.jpg/library_hero.jpg which look soft once stretched full-bleed
 * across a hero section. "alternate"-style heroes (textless art) are ranked
 * above "material" (which usually bakes in the game's logo), then by
 * resolution. Steam's own images and SteamGridDB's smaller wide "grids"
 * (920x430 / 460x215) remain afterward as the safe fallback chain when
 * SteamGridDB has nothing for an unrecognized/unlisted title — the download
 * step (fetchArtworkForGame) always walks this list in order and takes the
 * first URL that actually downloads, so nothing here can produce an empty
 * hero slot on its own. Gameplay screenshots are deliberately excluded from
 * this list — they're captures, not banner art.
 */
export async function getHeroOptions(appId: string): Promise<CoverOption[]> {
  const apiKey = getEffectiveSteamGridDbKey()

  const [heroesRaw, storeImages, wideGrids] = await Promise.all([
    fetchSteamGridDbImages('heroes', appId, apiKey, '1920x620,3840x1240'),
    fetchSteamStoreImages(appId),
    fetchSteamGridDbImages('grids', appId, apiKey, '920x430,460x215')
  ])

  const sgdbHeroes = heroesRaw
    .filter((h) => isWideBanner(h.width, h.height) && h.width >= 1920)
    .sort((a, b) => {
      const styleRank = (s?: string): number => (s === 'material' ? 1 : 0)
      const styleDiff = styleRank(a.style) - styleRank(b.style)
      if (styleDiff !== 0) return styleDiff
      return b.width * b.height - a.width * a.height
    })
    .slice(0, 20)
    .map((h) => ({
      id: `sgdb-hero-${h.id}`,
      url: h.url,
      source: 'steamgriddb' as const,
      width: h.width,
      height: h.height
    }))

  const options: CoverOption[] = [...sgdbHeroes]

  options.push({
    id: 'steam-hero',
    url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
    source: 'steam',
    width: 1920,
    height: 620
  })

  if (storeImages?.headerImage) {
    options.push({ id: 'steam-header', url: storeImages.headerImage, source: 'steam', width: null, height: null })
  }

  options.push(
    ...wideGrids
      .filter((g) => isWideBanner(g.width, g.height))
      .map((g) => ({
        id: `sgdb-widegrid-${g.id}`,
        url: g.url,
        source: 'steamgriddb' as const,
        width: g.width,
        height: g.height
      }))
  )

  return options
}

export async function setCoverFromUrl(gameId: number, url: string): Promise<boolean> {
  const fileName = `custom-cover-${gameId}-${Date.now()}.jpg`
  const ok = await downloadImageToCache(url, fileName)
  if (ok) setGameCover(gameId, fileName)
  return ok
}

export function setCoverFromLocalFile(gameId: number, sourcePath: string): boolean {
  try {
    const ext = extname(sourcePath) || '.jpg'
    const fileName = `custom-cover-${gameId}-${Date.now()}${ext}`
    copyFileSync(sourcePath, join(getArtworkCacheDir(), fileName))
    setGameCover(gameId, fileName)
    return true
  } catch {
    return false
  }
}

export async function setHeroFromUrl(gameId: number, url: string): Promise<boolean> {
  const fileName = `custom-hero-${gameId}-${Date.now()}.jpg`
  const ok = await downloadImageToCache(url, fileName)
  if (ok) setGameHero(gameId, fileName)
  return ok
}

export function setHeroFromLocalFile(gameId: number, sourcePath: string): boolean {
  try {
    const ext = extname(sourcePath) || '.jpg'
    const fileName = `custom-hero-${gameId}-${Date.now()}${ext}`
    copyFileSync(sourcePath, join(getArtworkCacheDir(), fileName))
    setGameHero(gameId, fileName)
    return true
  } catch {
    return false
  }
}
