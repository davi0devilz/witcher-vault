import { getAllGamesWithSources, setMeta, upsertOwnedSteamGames, type OwnedSteamGame } from '../db'
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
    games: getAllGamesWithSources()
  }
}
