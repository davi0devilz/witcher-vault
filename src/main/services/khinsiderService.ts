const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const BASE_URL = 'https://downloads.khinsider.com'

async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT }
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function findAlbumUrl(title: string): Promise<string | null> {
  const html = await fetchHtml(`${BASE_URL}/search?search=${encodeURIComponent(title)}`)
  if (!html) return null

  const match = html.match(/href="(\/game-soundtracks\/album\/[^"]+)"/)
  if (!match) return null

  return `${BASE_URL}${decodeHtmlEntities(match[1])}`
}

async function findFirstTrackPageUrl(albumUrl: string): Promise<string | null> {
  const html = await fetchHtml(albumUrl)
  if (!html) return null

  // Track rows link to a per-track details page, not the raw audio file —
  // its URL happens to end in an audio extension even though it serves HTML.
  const matches = [...html.matchAll(/href="(\/game-soundtracks\/album\/[^"]+\.(?:mp3|flac))"/gi)]
  if (matches.length === 0) return null

  return `${BASE_URL}${decodeHtmlEntities(matches[0][1])}`
}

async function findDirectMp3Url(trackPageUrl: string): Promise<string | null> {
  const html = await fetchHtml(trackPageUrl)
  if (!html) return null

  const match = html.match(/https?:\/\/[^"'\s]+\.mp3/i)
  if (!match) return null

  return decodeHtmlEntities(match[0])
}

/**
 * Best-effort lookup of a game's soundtrack on KHInsider: search by title,
 * open the first matching album, and grab the direct MP3 URL of its first
 * track as a stand-in "theme" track. KHInsider's markup isn't a documented
 * API and can change without notice, so every step degrades to `null`
 * instead of throwing — callers treat "no track found" as a normal outcome.
 */
export async function findThemeTrackUrl(title: string): Promise<string | null> {
  try {
    const albumUrl = await findAlbumUrl(title)
    if (!albumUrl) return null

    const trackPageUrl = await findFirstTrackPageUrl(albumUrl)
    if (!trackPageUrl) return null

    return await findDirectMp3Url(trackPageUrl)
  } catch {
    return null
  }
}
