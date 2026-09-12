import { existsSync, readdirSync, statSync } from 'fs'
import { extname, join } from 'path'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg'])

// Filenames suggesting this is the game's main-menu/title theme rather than
// a random combat cue, ambience loop, or voice line.
const THEME_NAME_HINTS = [/main.?theme/i, /main.?menu/i, /title.?theme/i, /title.?screen/i, /^menu\b/i, /\btheme\b/i]

// Rules out short UI blips/stingers while still catching genuine music tracks.
const MIN_BYTES = 300000
// Safety cap so scanning a huge install tree (100+ GB AAA titles) can't
// stall a fetch — most games keep their audio assets within a few thousand
// files of the root anyway.
const MAX_ENTRIES_VISITED = 4000
const MAX_DEPTH = 4

interface AudioCandidate {
  path: string
  size: number
  hinted: boolean
}

function scanForAudioFiles(rootDir: string): AudioCandidate[] {
  const found: AudioCandidate[] = []
  const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  let visited = 0

  while (stack.length > 0 && visited < MAX_ENTRIES_VISITED) {
    const { dir, depth } = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (visited >= MAX_ENTRIES_VISITED) break
      visited++

      const fullPath = join(dir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        if (depth < MAX_DEPTH) stack.push({ dir: fullPath, depth: depth + 1 })
        continue
      }

      const ext = extname(entry).toLowerCase()
      if (!AUDIO_EXTENSIONS.has(ext) || stat.size < MIN_BYTES) continue

      found.push({
        path: fullPath,
        size: stat.size,
        hinted: THEME_NAME_HINTS.some((pattern) => pattern.test(entry))
      })
    }
  }

  return found
}

/**
 * Absolute last-resort fallback: for a game that's actually installed
 * locally, scan its own install folder for an .mp3/.ogg file that looks
 * like its main menu theme. Files whose name hints at "theme"/"menu"/
 * "title" are preferred; if none match, the largest qualifying audio file
 * is used as a reasonable guess. Only ever reached for installed games —
 * cloud-owned/not-installed entries have no folder on disk to scan.
 */
export function findLocalThemeAudioFile(installDir: string): string | null {
  if (!installDir || !existsSync(installDir)) return null

  const candidates = scanForAudioFiles(installDir)
  if (candidates.length === 0) return null

  const hinted = candidates.filter((c) => c.hinted)
  const pool = hinted.length > 0 ? hinted : candidates

  let best = pool[0]
  for (const candidate of pool) {
    if (candidate.size > best.size) best = candidate
  }
  return best.path
}
