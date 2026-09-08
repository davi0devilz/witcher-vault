export type StoreType = 'steam' | 'epic' | 'manual'

export type InstallStatus = 'installed' | 'not_installed'

export interface LaunchSource {
  id: number
  gameId: number
  store: StoreType
  storeAppId: string | null
  rawTitle: string
  installDir: string | null
  executablePath: string | null
  launchCommand: string | null
  isPrimary: boolean
}

export type ArtworkStatus = 'pending' | 'fetched' | 'unavailable'

export type DescriptionLanguage = 'ar' | 'en'

export interface Game {
  id: number
  title: string
  normalizedTitle: string
  installStatus: InstallStatus
  coverPath: string | null
  heroPath: string | null
  genres: string[]
  shortDescription: string | null
  detailedDescription: string | null
  descriptionLanguage: DescriptionLanguage | null
  releaseDate: string | null
  developer: string | null
  publisher: string | null
  artworkStatus: ArtworkStatus
  playtimeMinutes: number
  lastPlayedAt: string | null
  isFavorite: boolean
  notes: string | null
  notesUpdatedAt: string | null
  hltbStatus: HltbStatus
  hltbMainSeconds: number | null
  hltbMainExtraSeconds: number | null
  hltbCompletionistSeconds: number | null
  themeAudioStatus: ThemeAudioStatus
  themeAudioPath: string | null
  themeAudioSource: ThemeAudioSource
  createdAt: string
  updatedAt: string
  sources: LaunchSource[]
}

export type HltbStatus = 'pending' | 'fetched' | 'unavailable'

export interface HltbResult {
  mainSeconds: number | null
  mainExtraSeconds: number | null
  completionistSeconds: number | null
}

export type ThemeAudioStatus = 'pending' | 'fetched' | 'unavailable'
export type ThemeAudioSource = 'khinsider' | 'custom' | null

export interface ThemeAudioResult {
  path: string | null
  source: ThemeAudioSource
}

export interface SteamLibrarySyncResult {
  ok: boolean
  message: string
  personaName?: string
  totalOwned?: number
  newGames?: number
  games?: Game[]
}

export interface SteamSearchResultItem {
  appId: string
  name: string
  tinyImage: string | null
  priceFinal: number | null
  priceCurrency: string | null
}

export type RegionalPricingRegion = 'sa' | 'ua' | 'tr'

export interface RegionalPrice {
  region: RegionalPricingRegion
  countryLabel: string
  flag: string
  currency: string
  isFree: boolean
  initial: number | null
  final: number | null
  discountPercent: number
  sarEquivalent: number | null
  approximate: boolean
}

export interface RegionalPricingResult {
  available: boolean
  isFree: boolean
  prices: RegionalPrice[]
}

export interface GameSession {
  id: number
  gameId: number
  startedAt: string
  endedAt: string | null
  durationMinutes: number
}

export interface GameDetail extends Game {
  sessions: GameSession[]
}

export interface SessionUpdate {
  gameId: number
  status: 'starting' | 'running' | 'ended' | 'timeout' | 'error'
  startedAt: string | null
  elapsedMinutes: number
  message?: string
}

export interface CoverOption {
  id: string
  url: string
  source: 'steam' | 'steamgriddb'
  width: number | null
  height: number | null
}

export interface ScanError {
  scanner: 'steam' | 'epic'
  message: string
}

export interface ScanReport {
  scannedAt: string
  steamFound: number
  epicFound: number
  newGames: number
  newSources: number
  errors: ScanError[]
  games: Game[]
}

export interface ArtworkOutcome {
  gameId: number
  title: string
  status: 'fetched' | 'unavailable' | 'skipped'
}

export interface ArtworkBatchResult {
  processed: number
  fetched: number
  unavailable: number
  skipped: number
  outcomes: ArtworkOutcome[]
  games: Game[]
}

export interface TranslateDescriptionResult {
  ok: boolean
  shortDescription: string | null
  detailedDescription: string | null
  message?: string
}

export type UpdateEvent =
  | { type: 'checking-for-update' }
  | { type: 'update-available'; version: string }
  | { type: 'update-not-available' }
  | { type: 'download-progress'; percent: number }
  | { type: 'update-downloaded'; version: string }
  | { type: 'error'; message: string }
