import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { LaunchSource } from '../../shared/models'
import { updateSourceExecutablePath } from '../db'

const EXCLUDE_PATTERNS = [
  /^unins/i,
  /vc_?redist/i,
  /directx/i,
  /dxwebsetup/i,
  /dxsetup/i,
  /dotnet/i,
  /crashhandler/i,
  /crashpad/i,
  /crash_?reporter/i,
  /easyanticheat/i,
  /^eac/i,
  /^beservice/i,
  /battleye/i,
  /redistributable/i,
  /vcruntime/i,
  /\bhelper\b/i,
  /^setup/i
]

function isLikelyGameExecutable(fileName: string): boolean {
  return !EXCLUDE_PATTERNS.some((pattern) => pattern.test(fileName))
}

function findCandidateExecutables(rootDir: string, maxDepth = 4): string[] {
  const candidates: string[] = []
  const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]

  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        if (depth < maxDepth) stack.push({ dir: fullPath, depth: depth + 1 })
      } else if (entry.toLowerCase().endsWith('.exe') && isLikelyGameExecutable(entry)) {
        candidates.push(fullPath)
      }
    }
  }

  return candidates
}

/**
 * Best-effort resolution of the game's main executable when the scanner
 * couldn't determine it directly (Steam's appmanifest only exposes an
 * install directory, not the launch executable). Picks the largest
 * non-utility .exe in the install tree — a reasonable heuristic since the
 * main game binary is almost always the largest executable shipped.
 */
export function resolveExecutableForSource(source: LaunchSource): string | null {
  if (source.executablePath && existsSync(source.executablePath)) {
    return source.executablePath
  }

  if (!source.installDir || !existsSync(source.installDir)) {
    return null
  }

  const candidates = findCandidateExecutables(source.installDir)
  if (candidates.length === 0) return null

  let best = candidates[0]
  let bestSize = -1
  for (const candidate of candidates) {
    try {
      const size = statSync(candidate).size
      if (size > bestSize) {
        bestSize = size
        best = candidate
      }
    } catch {
      continue
    }
  }

  updateSourceExecutablePath(source.id, best)
  return best
}
