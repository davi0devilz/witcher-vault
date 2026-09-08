import { HowLongToBeatService } from 'howlongtobeat-ts'
import type { HltbResult } from '../../shared/models'
import { getGameWithSourcesById, updateGameHltb } from '../db'

const hltb = new HowLongToBeatService({ timeout: 12000, retries: 1 })

/**
 * Looks up HowLongToBeat completion times for a game, caching the outcome
 * (found or not) on the games row so the same title is never searched twice.
 * Any lookup failure — network, parsing, HowLongToBeat blocking the request —
 * degrades to "unavailable" rather than throwing, since this data is a nice-
 * to-have and must never break the game detail page.
 */
export async function getHltbForGame(gameId: number, title: string): Promise<HltbResult | null> {
  const game = getGameWithSourcesById(gameId)
  if (!game) return null

  if (game.hltbStatus === 'fetched') {
    return {
      mainSeconds: game.hltbMainSeconds,
      mainExtraSeconds: game.hltbMainExtraSeconds,
      completionistSeconds: game.hltbCompletionistSeconds
    }
  }
  if (game.hltbStatus === 'unavailable') {
    return null
  }

  try {
    const result = await hltb.searchOne(title)
    if (!result.success || !result.data) {
      updateGameHltb(gameId, null)
      return null
    }

    const entry = result.data
    const update = {
      mainSeconds: entry.mainTime ?? null,
      mainExtraSeconds: entry.mainExtraTime ?? null,
      completionistSeconds: entry.completionistTime ?? null
    }
    updateGameHltb(gameId, update)
    return update
  } catch {
    updateGameHltb(gameId, null)
    return null
  }
}
