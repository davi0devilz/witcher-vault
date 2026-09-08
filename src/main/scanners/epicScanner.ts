import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ScanResult, ScannedGame } from './types'

const EPIC_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

interface EpicManifestItem {
  DisplayName?: string
  InstallLocation?: string
  LaunchExecutable?: string
  AppName?: string
  CatalogItemId?: string
  bIsIncompleteInstall?: boolean
}

function parseManifestFile(filePath: string, fileName: string): ScannedGame | null {
  const raw = readFileSync(filePath, 'utf-8')
  const item = JSON.parse(raw) as EpicManifestItem

  if (item.bIsIncompleteInstall) return null
  if (!item.DisplayName || !item.InstallLocation) return null
  if (!existsSync(item.InstallLocation)) return null

  const executablePath = item.LaunchExecutable
    ? join(item.InstallLocation, item.LaunchExecutable)
    : null

  return {
    title: item.DisplayName,
    store: 'epic',
    storeAppId: item.AppName ?? item.CatalogItemId ?? fileName,
    installDir: item.InstallLocation,
    executablePath,
    launchCommand: executablePath ?? item.InstallLocation
  }
}

export async function scanEpicGames(): Promise<ScanResult> {
  const games: ScannedGame[] = []
  const errors: ScanResult['errors'] = []

  if (!existsSync(EPIC_MANIFESTS_DIR)) {
    errors.push({ scanner: 'epic', message: 'لم يتم العثور على بيانات Epic Games Launcher على هذا الجهاز.' })
    return { games, errors }
  }

  let manifestFiles: string[]
  try {
    manifestFiles = readdirSync(EPIC_MANIFESTS_DIR).filter((file) =>
      file.toLowerCase().endsWith('.item')
    )
  } catch (err) {
    errors.push({
      scanner: 'epic',
      message: `تعذّرت قراءة مجلد Manifests: ${(err as Error).message}`
    })
    return { games, errors }
  }

  for (const file of manifestFiles) {
    try {
      const parsed = parseManifestFile(join(EPIC_MANIFESTS_DIR, file), file)
      if (parsed) games.push(parsed)
    } catch (err) {
      errors.push({
        scanner: 'epic',
        message: `تعذّر تحليل الملف ${file}: ${(err as Error).message}`
      })
    }
  }

  return { games, errors }
}
