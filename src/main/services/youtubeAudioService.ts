// Last-resort audio fallback for games with no KHInsider soundtrack and no
// usable Steam trailer either. Goes through public Invidious instances
// (a keyless, ToS-friendlier front end to YouTube's own data) rather than
// scraping YouTube directly or bundling a signature-cipher extractor like
// yt-dlp — but in practice most public instances now sit behind an
// interactive CAPTCHA wall to fight abuse, so this tier is inherently the
// least reliable of the pipeline and is expected to often come back empty.
// It degrades to `null` exactly like every other best-effort lookup here.

interface InvidiousSearchItem {
  type?: string
  videoId?: string
}

interface InvidiousFormat {
  url?: string
  type?: string
  bitrate?: string
}

interface InvidiousVideoDetail {
  adaptiveFormats?: InvidiousFormat[]
}

const INVIDIOUS_INSTANCES = ['https://yewtu.be', 'https://invidious.protokolla.fi', 'https://inv.nadeko.net']

const SEARCH_QUERY_SUFFIXES = ['Official Main Theme Soundtrack', 'OST']

export interface YoutubeAudioMatch {
  url: string
  extension: 'm4a' | 'webm'
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    // An instance under CAPTCHA/anti-bot protection answers with an HTML
    // challenge page instead of JSON — treated the same as any other miss.
    if (!contentType.includes('application/json')) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function searchFirstVideoId(instance: string, query: string): Promise<string | null> {
  const results = await fetchJson<InvidiousSearchItem[]>(
    `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`
  )
  if (!Array.isArray(results)) return null
  const first = results.find((item) => item.type === 'video' && typeof item.videoId === 'string')
  return first?.videoId ?? null
}

function extensionForFormatType(type: string): 'm4a' | 'webm' {
  return type.includes('webm') ? 'webm' : 'm4a'
}

async function fetchAudioOnlyFormat(instance: string, videoId: string): Promise<YoutubeAudioMatch | null> {
  const detail = await fetchJson<InvidiousVideoDetail>(`${instance}/api/v1/videos/${videoId}`)
  const formats = (detail?.adaptiveFormats ?? []).filter(
    (f): f is Required<Pick<InvidiousFormat, 'url' | 'type'>> & InvidiousFormat =>
      typeof f.url === 'string' && typeof f.type === 'string' && f.type.startsWith('audio/')
  )
  if (formats.length === 0) return null

  // A moderate bitrate is plenty for background ambience and keeps the
  // download small — pick the middle of the available range rather than
  // the highest.
  formats.sort((a, b) => Number(a.bitrate ?? 0) - Number(b.bitrate ?? 0))
  const chosen = formats[Math.floor(formats.length / 2)]
  return { url: chosen.url, extension: extensionForFormatType(chosen.type) }
}

/**
 * Searches a short list of public Invidious instances for a game's main
 * theme/OST video and resolves a direct, audio-only stream URL for it.
 * Every instance × query combination is tried before giving up, since a
 * single instance being CAPTCHA-walled (common) or a query returning no
 * hits shouldn't sink the whole tier.
 */
export async function findYoutubeThemeAudio(
  gameTitle: string,
  onProgress?: (message: string) => void
): Promise<YoutubeAudioMatch | null> {
  const report = onProgress ?? (() => {})
  for (const instance of INVIDIOUS_INSTANCES) {
    for (const suffix of SEARCH_QUERY_SUFFIXES) {
      const query = `${gameTitle} ${suffix}`
      try {
        const videoId = await searchFirstVideoId(instance, query)
        if (!videoId) {
          report(`${instance}: no JSON result for "${query}" (likely CAPTCHA/anti-bot page, or genuinely no hits)`)
          continue
        }

        const match = await fetchAudioOnlyFormat(instance, videoId)
        if (match) {
          report(`${instance}: resolved audio stream for video ${videoId}`)
          return match
        }
        report(`${instance}: found video ${videoId} but it has no audio-only adaptive format`)
      } catch (err) {
        report(`${instance}: threw — ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return null
}
