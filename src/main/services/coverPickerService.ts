import { copyFileSync } from 'fs'
import { extname, join } from 'path'
import type { CoverOption } from '../../shared/models'
import { getMeta, setGameCover, setGameHero } from '../db'
import { downloadImageToCache, getArtworkCacheDir } from './artworkCache'
import { fetchSteamStoreImages } from './steamMetadataApi'

interface SteamGridDbImage {
  id: number
  url: string
  width: number
  height: number
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

  const apiKey = getMeta('steamgriddb_api_key')
  const steamGridDbConfigured = Boolean(apiKey)
  if (apiKey) {
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
  }

  return { options, steamGridDbConfigured }
}

/**
 * Hero (wide banner) choices — kept entirely separate from cover options.
 * Only genuine banner artwork is offered here: Steam's own library_hero.jpg
 * and header.jpg, plus SteamGridDB's dedicated "heroes" (1920x620) and wide
 * "grids" (920x430 / 460x215) endpoints. Gameplay screenshots are
 * deliberately excluded — they're captures, not banner art.
 */
export async function getHeroOptions(appId: string): Promise<CoverOption[]> {
  const options: CoverOption[] = [
    {
      id: 'steam-hero',
      url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
      source: 'steam',
      width: 1920,
      height: 620
    }
  ]

  const storeImages = await fetchSteamStoreImages(appId)
  if (storeImages?.headerImage) {
    options.push({ id: 'steam-header', url: storeImages.headerImage, source: 'steam', width: null, height: null })
  }

  const apiKey = getMeta('steamgriddb_api_key')
  if (apiKey) {
    const [heroes, wideGrids] = await Promise.all([
      fetchSteamGridDbImages('heroes', appId, apiKey, '1920x620'),
      fetchSteamGridDbImages('grids', appId, apiKey, '920x430,460x215')
    ])

    options.push(
      ...heroes
        .filter((h) => isWideBanner(h.width, h.height))
        .map((h) => ({
          id: `sgdb-hero-${h.id}`,
          url: h.url,
          source: 'steamgriddb' as const,
          width: h.width,
          height: h.height
        })),
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
  }

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
