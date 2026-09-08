import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import type { ScanResult, ScannedGame } from './types'

const execFileAsync = promisify(execFile)

const DEFAULT_STEAM_PATHS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam'
]

const REGISTRY_LOOKUPS: Array<{ key: string; value: string }> = [
  { key: 'HKCU\\Software\\Valve\\Steam', value: 'SteamPath' },
  { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', value: 'InstallPath' },
  { key: 'HKLM\\SOFTWARE\\Valve\\Steam', value: 'InstallPath' }
]

const NON_GAME_NAME_PATTERN = /^(steamworks common redistributables|steam linux runtime.*|proton.*|steamvr)$/i

async function getSteamPathFromRegistry(): Promise<string | null> {
  for (const { key, value } of REGISTRY_LOOKUPS) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/v', value])
      const match = stdout.match(new RegExp(`${value}\\s+REG_SZ\\s+(.+)`))
      if (match) {
        const path = match[1].trim()
        if (path) return path
      }
    } catch {
      // Key not present on this system — try the next lookup.
    }
  }
  return null
}

async function resolveSteamPath(): Promise<string | null> {
  const fromRegistry = await getSteamPathFromRegistry()
  if (fromRegistry && existsSync(fromRegistry)) return fromRegistry

  for (const candidate of DEFAULT_STEAM_PATHS) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function collectLibraryFolders(steamPath: string): string[] {
  // Steam's registry path and libraryfolders.vdf entries can disagree on casing
  // and slash direction (e.g. "c:/program files (x86)/steam" vs
  // "C:\Program Files (x86)\Steam") while pointing at the same directory on
  // Windows' case-insensitive filesystem — dedupe by a lowercased key.
  const dirsByKey = new Map<string, string>()
  const addDir = (rawPath: string): void => {
    const dir = join(rawPath, 'steamapps')
    dirsByKey.set(dir.toLowerCase(), dir)
  }

  addDir(steamPath)

  const libraryFoldersVdf = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (existsSync(libraryFoldersVdf)) {
    const content = readFileSync(libraryFoldersVdf, 'utf-8')
    const matches = content.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)
    for (const match of matches) {
      const rawPath = match[1].replace(/\\\\/g, '\\')
      addDir(rawPath)
    }
  }

  return Array.from(dirsByKey.values())
}

function parseAppManifest(filePath: string): ScannedGame | null {
  const content = readFileSync(filePath, 'utf-8')
  const appIdMatch = content.match(/"appid"\s+"(\d+)"/i)
  const nameMatch = content.match(/"name"\s+"([^"]+)"/i)
  const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/i)
  const stateFlagsMatch = content.match(/"StateFlags"\s+"(\d+)"/i)

  if (!appIdMatch || !nameMatch || !installDirMatch) return null

  const name = nameMatch[1]
  if (NON_GAME_NAME_PATTERN.test(name.trim())) return null

  // StateFlags bit 4 means "fully installed" in Steam's appmanifest format.
  const stateFlags = stateFlagsMatch ? parseInt(stateFlagsMatch[1], 10) : 4
  if ((stateFlags & 4) !== 4) return null

  const appId = appIdMatch[1]
  const steamappsDir = join(filePath, '..')
  const installDir = join(steamappsDir, 'common', installDirMatch[1])

  return {
    title: name,
    store: 'steam',
    storeAppId: appId,
    installDir,
    executablePath: null,
    launchCommand: `steam://run/${appId}`
  }
}

export async function scanSteamGames(): Promise<ScanResult> {
  const games: ScannedGame[] = []
  const errors: ScanResult['errors'] = []

  const steamPath = await resolveSteamPath()
  if (!steamPath) {
    errors.push({ scanner: 'steam', message: 'تعذّر العثور على مسار تثبيت Steam على هذا الجهاز.' })
    return { games, errors }
  }

  const steamappsDirs = collectLibraryFolders(steamPath)

  for (const steamappsDir of steamappsDirs) {
    if (!existsSync(steamappsDir)) continue

    let manifestFiles: string[]
    try {
      manifestFiles = readdirSync(steamappsDir).filter((file) =>
        /^appmanifest_\d+\.acf$/i.test(file)
      )
    } catch (err) {
      errors.push({
        scanner: 'steam',
        message: `تعذّرت قراءة مجلد المكتبة: ${steamappsDir} (${(err as Error).message})`
      })
      continue
    }

    for (const file of manifestFiles) {
      try {
        const parsed = parseAppManifest(join(steamappsDir, file))
        if (parsed) games.push(parsed)
      } catch (err) {
        errors.push({
          scanner: 'steam',
          message: `تعذّر تحليل الملف ${file}: ${(err as Error).message}`
        })
      }
    }
  }

  return { games, errors }
}
