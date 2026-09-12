// Every current Steam store trailer is served as a DASH manifest with no
// direct progressive-video fallback at all, so a background-audio pipeline
// that only reads the legacy `webm`/`mp4` fields never finds anything for
// recently-added games. This module resolves the manifest's audio-only
// track and reassembles it into a standalone playable file, without ever
// touching (or downloading) the video track.

const FETCH_TIMEOUT_MS = 10000
// A trailer rarely runs past a couple of minutes; at Steam's typical 3s
// segment length that is well under 60 segments — a generous, still-cheap
// safety cap against a manifest that (for whatever reason) never 404s.
const MAX_SEGMENTS = 60

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

interface AudioSegmentPlan {
  initUrl: string
  mediaTemplate: string
  startNumber: number
  numberWidth: number
}

/**
 * Parses the single audio AdaptationSet out of an MPEG-DASH manifest via
 * plain regex rather than a full XML parser — Steam/Akamai's manifests are
 * machine-generated with a small, stable shape, matching how the rest of
 * this codebase treats other undocumented third-party markup (see
 * khinsiderService). Anything unexpected simply yields `null` so the caller
 * can move on to the next fallback tier.
 */
function parseAudioSegmentPlan(mpdXml: string, mpdUrl: string): AudioSegmentPlan | null {
  const audioSetMatch = mpdXml.match(
    /<AdaptationSet\b[^>]*\bcontentType="audio"[^>]*>[\s\S]*?<\/AdaptationSet>/
  )
  if (!audioSetMatch) return null
  const block = audioSetMatch[0]

  const repIdMatch = block.match(/<Representation\b[^>]*\bid="([^"]+)"/)
  const initMatch = block.match(/\binitialization="([^"]+)"/)
  const mediaMatch = block.match(/\bmedia="([^"]+)"/)
  if (!repIdMatch || !initMatch || !mediaMatch) return null

  const repId = repIdMatch[1]
  const startNumberMatch = block.match(/\bstartNumber="(\d+)"/)
  const widthMatch = mediaMatch[1].match(/\$Number%0?(\d+)d\$/)

  const initTemplate = initMatch[1].replace(/\$RepresentationID\$/g, repId)
  const mediaTemplate = mediaMatch[1].replace(/\$RepresentationID\$/g, repId)

  return {
    initUrl: new URL(initTemplate, mpdUrl).toString(),
    mediaTemplate,
    startNumber: startNumberMatch ? Number(startNumberMatch[1]) : 1,
    numberWidth: widthMatch ? Number(widthMatch[1]) : 1
  }
}

function buildMediaSegmentUrl(plan: AudioSegmentPlan, segmentNumber: number, mpdUrl: string): string {
  const numberStr = String(segmentNumber).padStart(plan.numberWidth, '0')
  const path = plan.mediaTemplate.replace(/\$Number%0?\d+d\$/, numberStr)
  return new URL(path, mpdUrl).toString()
}

/**
 * Downloads just the audio track referenced by a Steam trailer's DASH
 * manifest and reassembles it into one standalone file. DASH's fragmented-
 * MP4 (CMAF) segments are, by construction, playable back-to-back — an
 * init segment (moov) followed by consecutive media segments (moof/mdat) —
 * so concatenating them in order produces a valid, directly playable
 * audio/mp4 file with no muxing or re-encoding needed. Segments are fetched
 * sequentially and stop at the first miss, since the manifest doesn't
 * always advertise a reliable total segment count.
 */
export async function extractDashAudioTrack(
  mpdUrl: string,
  onProgress?: (message: string) => void
): Promise<Buffer | null> {
  const report = onProgress ?? (() => {})
  try {
    const mpdXml = await fetchText(mpdUrl)
    if (!mpdXml) {
      report('failed to fetch the manifest itself (network error or non-2xx response)')
      return null
    }

    const plan = parseAudioSegmentPlan(mpdXml, mpdUrl)
    if (!plan) {
      report('manifest fetched but no audio AdaptationSet/SegmentTemplate matched the expected shape')
      return null
    }

    const initBuffer = await fetchBuffer(plan.initUrl)
    if (!initBuffer) {
      report(`failed to fetch init segment: ${plan.initUrl}`)
      return null
    }

    const chunks: Buffer[] = [initBuffer]
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const url = buildMediaSegmentUrl(plan, plan.startNumber + i, mpdUrl)
      const chunk = await fetchBuffer(url)
      if (!chunk) break
      chunks.push(chunk)
    }

    // Only the init segment with no actual audio media isn't a usable track.
    if (chunks.length < 2) {
      report('init segment fetched but zero media segments came back')
      return null
    }

    report(`fetched ${chunks.length - 1} media segment(s), ${chunks.reduce((n, c) => n + c.byteLength, 0)} bytes total`)
    return Buffer.concat(chunks)
  } catch (err) {
    report(`threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
