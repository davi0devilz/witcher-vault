import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ArtworkBatchResult,
  CoverOption,
  FavoriteGameItem,
  Game,
  GameDetail,
  HltbResult,
  RegionalPricingResult,
  ScanReport,
  SessionUpdate,
  SteamLibrarySyncResult,
  SteamSearchResultItem,
  ThemeAudioResult,
  TranslateDescriptionResult,
  UpdateEvent
} from '../shared/models'

interface LaunchResult {
  ok: boolean
  message?: string
}

const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  db: {
    getMeta: (key: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_GET_META, key),
    setMeta: (key: string, value: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_SET_META, key, value),
    getPath: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_PATH)
  },
  library: {
    scanInstalledGames: (): Promise<ScanReport> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SCAN),
    getGames: (): Promise<Game[]> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET_GAMES),
    removeGame: (gameId: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_REMOVE_GAME, gameId),
    fetchArtwork: (forceRefresh = false): Promise<ArtworkBatchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.ARTWORK_FETCH_LIBRARY, forceRefresh)
  },
  favorites: {
    getGames: (): Promise<FavoriteGameItem[]> => ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_GET_GAMES)
  },
  game: {
    getDetail: (gameId: number): Promise<GameDetail | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_GET_DETAIL, gameId),
    toggleFavorite: (gameId: number, isFavorite: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_TOGGLE_FAVORITE, gameId, isFavorite),
    openInstallFolder: (gameId: number): Promise<LaunchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_OPEN_INSTALL_FOLDER, gameId),
    launch: (gameId: number): Promise<LaunchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LAUNCH, gameId),
    onSessionUpdate: (callback: (update: SessionUpdate) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: SessionUpdate): void =>
        callback(update)
      ipcRenderer.on(IPC_CHANNELS.GAME_SESSION_UPDATE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.GAME_SESSION_UPDATE, listener)
    },
    updateNotes: (gameId: number, notes: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_UPDATE_NOTES, gameId, notes),
    translateDescription: (gameId: number): Promise<TranslateDescriptionResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_TRANSLATE_DESCRIPTION, gameId),
    fetchArtwork: (gameId: number): Promise<GameDetail | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.ARTWORK_FETCH_FOR_GAME, gameId)
  },
  cover: {
    getOptions: (appId: string): Promise<{ options: CoverOption[]; steamGridDbConfigured: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.COVER_GET_OPTIONS, appId),
    setFromUrl: (gameId: number, url: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.COVER_SET_FROM_URL, gameId, url),
    setFromFile: (gameId: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.COVER_SET_FROM_FILE, gameId)
  },
  hero: {
    getOptions: (appId: string): Promise<CoverOption[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.HERO_GET_OPTIONS, appId),
    setFromUrl: (gameId: number, url: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.HERO_SET_FROM_URL, gameId, url),
    setFromFile: (gameId: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.HERO_SET_FROM_FILE, gameId)
  },
  hltb: {
    getForGame: (gameId: number, title: string): Promise<HltbResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.HLTB_GET_FOR_GAME, gameId, title)
  },
  themeAudio: {
    get: (gameId: number, title: string, forceRefresh = false): Promise<ThemeAudioResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.THEME_AUDIO_GET, gameId, title, forceRefresh),
    setFromFile: (gameId: number): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.THEME_AUDIO_SET_FROM_FILE, gameId)
  },
  steam: {
    syncLibrary: (rawInput: string): Promise<SteamLibrarySyncResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAM_LIBRARY_SYNC, rawInput),
    onBackgroundSync: (callback: (result: SteamLibrarySyncResult) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: SteamLibrarySyncResult): void =>
        callback(result)
      ipcRenderer.on(IPC_CHANNELS.STEAM_BACKGROUND_SYNC_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.STEAM_BACKGROUND_SYNC_EVENT, listener)
    },
    search: (term: string): Promise<SteamSearchResultItem[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAM_STORE_SEARCH, term),
    ensureGameForApp: (appId: string, title: string): Promise<number> =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAM_ENSURE_GAME_FOR_APP, appId, title),
    installGame: (appId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAM_INSTALL_GAME, appId),
    viewInStore: (appId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAM_VIEW_IN_STORE, appId)
  },
  pricing: {
    getRegional: (appId: string): Promise<RegionalPricingResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRICING_GET_REGIONAL, appId)
  },
  shell: {
    openExternal: (url: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url)
  },
  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    startDownload: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_START_DOWNLOAD),
    installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    openReleasePage: (version: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_OPEN_RELEASE_PAGE, version),
    onUpdateEvent: (callback: (event: UpdateEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, update: UpdateEvent): void =>
        callback(update)
      ipcRenderer.on(IPC_CHANNELS.UPDATE_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_EVENT, listener)
    }
  }
}

export type GameVaultApi = typeof api

contextBridge.exposeInMainWorld('api', api)
