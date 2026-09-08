/**
 * Translates text to Arabic using Google Translate's public web endpoint (no
 * API key required — the same one translate.google.com's page itself
 * calls). Source language is auto-detected rather than assumed to be
 * English, so re-running this on text that's already Arabic ("إعادة
 * الترجمة") is a safe no-op instead of a mistranslation. Used only when a
 * user explicitly clicks the translate button; never used to fabricate
 * content, only to translate real Steam text on demand.
 */
export async function translateToArabic(text: string): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(trimmed)}`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null

    const json = (await res.json()) as unknown
    if (!Array.isArray(json) || !Array.isArray(json[0])) return null

    const translated = (json[0] as unknown[])
      .map((segment) => (Array.isArray(segment) ? String(segment[0] ?? '') : ''))
      .join('')

    return translated.trim() || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
