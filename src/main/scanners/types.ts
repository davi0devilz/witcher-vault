import type { StoreType, ScanError } from '../../shared/models'

export interface ScannedGame {
  title: string
  store: StoreType
  storeAppId: string
  installDir: string | null
  executablePath: string | null
  launchCommand: string | null
}

export interface ScanResult {
  games: ScannedGame[]
  errors: ScanError[]
}
