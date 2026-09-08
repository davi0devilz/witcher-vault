import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

let cacheDir = ''

export function getArtworkCacheDir(): string {
  if (!cacheDir) {
    // Deliberately not "cache/artwork": Electron/Chromium reserve a "Cache"
    // directory directly under userData for their own HTTP disk cache, and
    // Windows' case-insensitive filesystem would collide with it, causing
    // Chromium to wipe our files on the next launch.
    cacheDir = join(app.getPath('userData'), 'artwork-cache')
  }
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

export function artworkFileExists(fileName: string): boolean {
  return existsSync(join(getArtworkCacheDir(), fileName))
}

export async function downloadImageToCache(
  url: string,
  fileName: string,
  timeoutMs = 10000
): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return false

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return false

    const buffer = Buffer.from(await res.arrayBuffer())
    // Steam serves a tiny placeholder gif instead of a 404 for missing artwork.
    if (buffer.byteLength < 1024) return false

    writeFileSync(join(getArtworkCacheDir(), fileName), buffer)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
