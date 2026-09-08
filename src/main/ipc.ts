import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import {
  getAllGamesWithSources,
  getDbFilePath,
  getGameWithSourcesById,
  getMeta,
  getSessionsForGame,
  removeGame,
  setFavorite,
  setMeta,
  updateGameDescription,
  updateGameNotes
} from './db'
import { runFullScan } from './scanners'
import { fetchArtworkForLibrary } from './services/artworkService'
import {
  getCoverOptions,
  getHeroOptions,
  setCoverFromLocalFile,
  setCoverFromUrl,
  setHeroFromLocalFile,
  setHeroFromUrl
} from './services/coverPickerService'
import { getHltbForGame } from './services/hltbService'
import { launchGame } from './services/sessionTracker'
import { getThemeAudioForGame, setCustomThemeAudioFile } from './services/themeAudioService'
import { translateToArabic } from './services/translationService'
import { checkForUpdates, installUpdate, startDownloadUpdate } from './services/updateService'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { GameDetail, TranslateDescriptionResult } from '../shared/models'

function getGameDetail(gameId: number): GameDetail | null {
  const game = getGameWithSourcesById(gameId)
  if (!game) return null
  return { ...game, sessions: getSessionsForGame(gameId) }
}

// Renderer-supplied URLs are never trusted for shell.openExternal, even
// though these two are currently hardcoded in the sidebar — an allowlist
// keeps that guarantee even if the renderer is ever compromised.
const ALLOWED_EXTERNAL_URLS = new Set([
  'https://x.com/ibusqui',
  'https://discord.gg/8435jMYK6k',
  'https://www.steamgriddb.com'
])

async function pickImageFile(
  event: Electron.IpcMainInvokeEvent,
  title: string
): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions: Electron.OpenDialogOptions = {
    title,
    properties: ['openFile'],
    filters: [{ name: 'صور', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  }
  const result = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.DB_GET_META, (_event, key: string) => {
    if (typeof key !== 'string') throw new Error('Invalid key')
    return getMeta(key)
  })

  ipcMain.handle(IPC_CHANNELS.DB_SET_META, (_event, key: string, value: string) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Invalid arguments')
    }
    setMeta(key, value)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.DB_GET_PATH, () => getDbFilePath())

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SCAN, () => runFullScan())

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_GAMES, () => getAllGamesWithSources())

  ipcMain.handle(IPC_CHANNELS.LIBRARY_REMOVE_GAME, (_event, gameId: number) => {
    removeGame(gameId)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.ARTWORK_FETCH_LIBRARY, (_event, forceRefresh: unknown) =>
    fetchArtworkForLibrary(forceRefresh === true)
  )

  ipcMain.handle(IPC_CHANNELS.GAME_GET_DETAIL, (_event, gameId: number) => getGameDetail(gameId))

  ipcMain.handle(IPC_CHANNELS.GAME_TOGGLE_FAVORITE, (_event, gameId: number, isFavorite: boolean) => {
    setFavorite(gameId, isFavorite)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.GAME_OPEN_INSTALL_FOLDER, (_event, gameId: number) => {
    const game = getGameWithSourcesById(gameId)
    const installDir = game?.sources.find((s) => s.installDir)?.installDir
    if (!installDir) return { ok: false, message: 'لا يوجد مسار تثبيت معروف لهذه اللعبة.' }
    shell.openPath(installDir)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.GAME_LAUNCH, async (_event, gameId: number) => {
    const game = getGameWithSourcesById(gameId)
    if (!game) return { ok: false, message: 'اللعبة غير موجودة.' }
    return launchGame(game)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_UPDATE_NOTES, (_event, gameId: number, notes: string) => {
    if (typeof notes !== 'string') throw new Error('Invalid notes')
    return updateGameNotes(gameId, notes)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_TRANSLATE_DESCRIPTION, async (_event, gameId: number) => {
    const game = getGameWithSourcesById(gameId)
    if (!game) {
      return { ok: false, shortDescription: null, detailedDescription: null, message: 'اللعبة غير موجودة.' }
    }

    const [translatedShort, translatedDetailed] = await Promise.all([
      game.shortDescription ? translateToArabic(game.shortDescription) : Promise.resolve(null),
      game.detailedDescription ? translateToArabic(game.detailedDescription) : Promise.resolve(null)
    ])

    if (!translatedShort && !translatedDetailed) {
      const result: TranslateDescriptionResult = {
        ok: false,
        shortDescription: null,
        detailedDescription: null,
        message: 'تعذّرت الترجمة حالياً. حاول مرة أخرى لاحقاً.'
      }
      return result
    }

    updateGameDescription(gameId, translatedShort, translatedDetailed)
    const result: TranslateDescriptionResult = {
      ok: true,
      shortDescription: translatedShort,
      detailedDescription: translatedDetailed
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.COVER_GET_OPTIONS, async (_event, appId: string) => getCoverOptions(appId))

  ipcMain.handle(IPC_CHANNELS.COVER_SET_FROM_URL, async (_event, gameId: number, url: string) =>
    setCoverFromUrl(gameId, url)
  )

  ipcMain.handle(IPC_CHANNELS.COVER_SET_FROM_FILE, async (event, gameId: number) => {
    const filePath = await pickImageFile(event, 'اختر صورة الغلاف')
    if (!filePath) return false
    return setCoverFromLocalFile(gameId, filePath)
  })

  ipcMain.handle(IPC_CHANNELS.HERO_GET_OPTIONS, async (_event, appId: string) => getHeroOptions(appId))

  ipcMain.handle(IPC_CHANNELS.HERO_SET_FROM_URL, async (_event, gameId: number, url: string) =>
    setHeroFromUrl(gameId, url)
  )

  ipcMain.handle(IPC_CHANNELS.HERO_SET_FROM_FILE, async (event, gameId: number) => {
    const filePath = await pickImageFile(event, 'اختر صورة البانوراما')
    if (!filePath) return false
    return setHeroFromLocalFile(gameId, filePath)
  })

  ipcMain.handle(IPC_CHANNELS.HLTB_GET_FOR_GAME, async (_event, gameId: number, title: string) =>
    getHltbForGame(gameId, title)
  )

  ipcMain.handle(IPC_CHANNELS.THEME_AUDIO_GET, async (_event, gameId: number, title: string) =>
    getThemeAudioForGame(gameId, title)
  )

  ipcMain.handle(IPC_CHANNELS.THEME_AUDIO_SET_FROM_FILE, async (event, gameId: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'اختر مقطعاً صوتياً',
      properties: ['openFile'],
      filters: [{ name: 'ملفات صوتية', extensions: ['mp3'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || result.filePaths.length === 0) return false
    return setCustomThemeAudioFile(gameId, result.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, url: string) => {
    if (typeof url !== 'string' || !ALLOWED_EXTERNAL_URLS.has(url)) return false
    shell.openExternal(url)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => checkForUpdates())

  ipcMain.handle(IPC_CHANNELS.UPDATE_START_DOWNLOAD, () => startDownloadUpdate())

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => installUpdate())
}
