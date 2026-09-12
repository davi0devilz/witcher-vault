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
  return downloadMediaToCache(url, fileName, {
    timeoutMs,
    acceptedTypePrefixes: ['audio/', 'application/octet-stream'],
    minBytes: 20000
  })
}

/**
 * Downloads a video container (webm/mp4) to the audio cache so it can be
 * played back through an <audio> element for its soundtrack alone — used by
 * the Steam-trailer fallback tier. A trailer clip is inherently bigger than
 * a plain MP3, so the minimum size floor is raised accordingly to still
 * reject error pages / placeholder responses.
 */
export async function downloadVideoAudioToCache(url: string, fileName: string): Promise<boolean> {
  return downloadMediaToCache(url, fileName, {
    timeoutMs: 20000,
    acceptedTypePrefixes: ['video/', 'application/octet-stream'],
    minBytes: 100000
  })
}

/**
 * Writes an already-downloaded/assembled media buffer straight to the audio
 * cache — used by the DASH audio-extraction fallback, which has to fetch and
 * concatenate several segments itself before there's anything to save.
 */
export function saveBufferToCache(fileName: string, buffer: Buffer, minBytes = 20000): boolean {
  if (buffer.byteLength < minBytes) return false
  writeFileSync(join(getAudioCacheDir(), fileName), buffer)
  return true
}

async function downloadMediaToCache(
  url: string,
  fileName: string,
  options: { timeoutMs: number; acceptedTypePrefixes: string[]; minBytes: number }
): Promise<boolean> {
  const { timeoutMs, acceptedTypePrefixes, minBytes } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return false

    const contentType = res.headers.get('content-type') ?? ''
    const looksAccepted = acceptedTypePrefixes.some((prefix) => contentType.startsWith(prefix))
    if (!looksAccepted) return false

    const buffer = Buffer.from(await res.arrayBuffer())
    // Too small to be real media — likely an error page or placeholder.
    if (buffer.byteLength < minBytes) return false

    writeFileSync(join(getAudioCacheDir(), fileName), buffer)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
