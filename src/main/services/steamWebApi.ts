import { getMeta } from '../db'

// A shared, app-level Steam Web API key (not tied to any individual user's
// account) so library sync works out of the box. It only grants access to
// public Steam Web API endpoints (profile lookups, owned-games lists for
// profiles the account owner has made public) — never account access.
// Settings lets a user override it with their own free key if they prefer.
const DEFAULT_STEAM_API_KEY = '472D9DCCCA750EF0DAA86FB9D8C9AE11'
const STEAM_API_KEY_META_KEY = 'steam_api_key'

export function getEffectiveSteamApiKey(): string {
  const custom = getMeta(STEAM_API_KEY_META_KEY)
  return custom && custom.trim() ? custom.trim() : DEFAULT_STEAM_API_KEY
}

async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function extractFromProfileUrl(input: string): { kind: 'id64' | 'vanity'; value: string } | null {
  try {
    const url = new URL(input)
    if (!url.hostname.toLowerCase().includes('steamcommunity.com')) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'profiles' && parts[1]) return { kind: 'id64', value: parts[1] }
    if (parts[0] === 'id' && parts[1]) return { kind: 'vanity', value: parts[1] }
    return null
  } catch {
    return null
  }
}

export type ResolveIdResult = { ok: true; steamId64: string } | { ok: false; message: string }

/**
 * Accepts a SteamID64, a vanity name, or a full profile URL (either form)
 * and resolves it to a canonical SteamID64. Vanity names are resolved via
 * the official (keyless-for-the-target) ResolveVanityURL endpoint — this
 * never needs the target account's own credentials.
 */
export async function resolveSteamId64(rawInput: string): Promise<ResolveIdResult> {
  const trimmed = rawInput.trim()
  if (!trimmed) return { ok: false, message: 'الرجاء إدخال معرّف أو رابط بروفايل Steam.' }

  const fromUrl = extractFromProfileUrl(trimmed)
  const candidate = fromUrl ?? (/^\d{17}$/.test(trimmed)
    ? { kind: 'id64' as const, value: trimmed }
    : { kind: 'vanity' as const, value: trimmed.replace(/^@/, '') })

  if (candidate.kind === 'id64') return { ok: true, steamId64: candidate.value }

  const apiKey = getEffectiveSteamApiKey()
  const json = await fetchJson<{ response?: { success?: number; steamid?: string } }>(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(candidate.value)}&format=json`
  )

  if (json?.response?.success === 1 && json.response.steamid) {
    return { ok: true, steamId64: json.response.steamid }
  }
  if (json === null) {
    return { ok: false, message: 'تعذّر الاتصال بخوادم Steam حالياً — حاول لاحقاً.' }
  }
  return { ok: false, message: 'تعذّر العثور على حساب Steam بهذا الاسم — تأكد من كتابته بشكل صحيح.' }
}

export interface RawOwnedGame {
  appid: number
  name: string
  playtime_forever: number
  rtime_last_played?: number
}

export type OwnedGamesResult =
  | { ok: true; games: RawOwnedGame[] }
  | { ok: false; message: string }

export async function fetchOwnedGames(steamId64: string): Promise<OwnedGamesResult> {
  const apiKey = getEffectiveSteamApiKey()
  const json = await fetchJson<{ response?: { game_count?: number; games?: RawOwnedGame[] } }>(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${encodeURIComponent(steamId64)}&include_appinfo=1&include_played_free_games=1&format=json`
  )

  if (json === null) {
    return { ok: false, message: 'تعذّر الاتصال بخوادم Steam حالياً — حاول لاحقاً.' }
  }

  const response = json.response
  if (!response || typeof response.game_count !== 'number') {
    return {
      ok: false,
      message:
        'تعذّر جلب قائمة الألعاب — تأكد أن خصوصية ملفك الشخصي و"تفاصيل الألعاب" في إعدادات Steam محددة على "عام" (Public).'
    }
  }

  return { ok: true, games: response.games ?? [] }
}

export async function fetchPersonaName(steamId64: string): Promise<string | null> {
  const apiKey = getEffectiveSteamApiKey()
  const json = await fetchJson<{ response?: { players?: Array<{ personaname?: string }> } }>(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${encodeURIComponent(steamId64)}&format=json`
  )
  return json?.response?.players?.[0]?.personaname ?? null
}
