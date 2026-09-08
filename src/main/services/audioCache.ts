import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

let cacheDir = ''

export function getAudioCacheDir(): string {
  if (!cacheDir) {
    cacheDir = join(app.getPath('userData'), 'audio-cache')
  }
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

export function audioFileExists(fileName: string): boolean {
  return existsSync(join(getAudioCacheDir(), fileName))
}

export async function downloadAudioToCache(
  url: string,
  fileName: string,
  timeoutMs = 15000
): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return false

    const contentType = res.headers.get('content-type') ?? ''
    const looksLikeAudio =
      contentType.startsWith('audio/') || contentType === 'application/octet-stream'
    if (!looksLikeAudio) return false

    const buffer = Buffer.from(await res.arrayBuffer())
    // Too small to be a real audio track — likely an error page or placeholder.
    if (buffer.byteLength < 20000) return false

    writeFileSync(join(getAudioCacheDir(), fileName), buffer)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
