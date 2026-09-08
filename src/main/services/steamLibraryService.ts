import {
  getMeta,
  getOwnedGamesWithSources,
  setMeta,
  upsertOwnedSteamGames,
  type OwnedSteamGame
} from '../db'
import type { SteamLibrarySyncResult } from '../../shared/models'
import { fetchOwnedGames, fetchPersonaName, resolveSteamId64 } from './steamWebApi'

const STEAM_PROFILE_INPUT_META_KEY = 'steam_profile_input'

export async function syncSteamLibrary(rawInput: string): Promise<SteamLibrarySyncResult> {
  const resolved = await resolveSteamId64(rawInput)
  if (!resolved.ok) return { ok: false, message: resolved.message }

  const [ownedResult, personaName] = await Promise.all([
    fetchOwnedGames(resolved.steamId64),
    fetchPersonaName(resolved.steamId64)
  ])

  if (!ownedResult.ok) {
    return { ok: false, message: ownedResult.message, personaName: personaName ?? undefined }
  }

  const owned: OwnedSteamGame[] = ownedResult.games.map((g) => ({
    appId: String(g.appid),
    title: g.name,
    playtimeMinutes: g.playtime_forever ?? 0,
    lastPlayedAt: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null
  }))

  const { newGames } = upsertOwnedSteamGames(owned)
  setMeta(STEAM_PROFILE_INPUT_META_KEY, rawInput.trim())

  return {
    ok: true,
    message: `تمت المزامنة${personaName ? ' لحساب ' + personaName : ''} — ${owned.length} لعبة مملوكة (${newGames} لعبة جديدة أُضيفت للمكتبة).`,
    personaName: personaName ?? undefined,
    totalOwned: owned.length,
    newGames,
    games: getOwnedGamesWithSources()
  }
}

/**
 * Silent startup sync: re-runs the exact same sync against whichever Steam
 * profile the user last saved in Settings, with no dialogs and no UI —
 * called once on every app launch so playtime (including hours racked up by
 * playing straight from the Steam client, outside this app) never goes
 * stale without the user having to remember to hit "sync" manually. A
 * user who has never configured a profile gets a no-op (null), never a
 * prompt.
 */
export async function runSilentBackgroundSync(): Promise<SteamLibrarySyncResult | null> {
  const storedProfile = getMeta(STEAM_PROFILE_INPUT_META_KEY)
  if (!storedProfile) return null
  return syncSteamLibrary(storedProfile)
}
