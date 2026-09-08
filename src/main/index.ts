import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { basename, join } from 'path'
import { pathToFileURL } from 'url'
import { initDatabase, persist } from './db'
import { registerIpcHandlers } from './ipc'
import { getArtworkCacheDir } from './services/artworkCache'
import { getAudioCacheDir } from './services/audioCache'
import { setSessionUpdateListener } from './services/sessionTracker'
import { runSilentBackgroundSync } from './services/steamLibraryService'
import { setUpdateEventListener } from './services/updateService'
import { IPC_CHANNELS } from '../shared/ipc-channels'

// Electron derives the userData storage folder from the app name by default.
// Pinning it explicitly to the original "game-vault" folder means cosmetic
// rebrands (e.g. to "Witcher Vault") never orphan the user's existing
// library, sessions, and settings by silently pointing at a new, empty
// folder. This must run before anything calls app.getPath('userData').
app.setPath('userData', join(app.getPath('appData'), 'game-vault'))
app.setName('Witcher Vault')

const ARTWORK_PROTOCOL = 'app-artwork'
const AUDIO_PROTOCOL = 'app-audio'

protocol.registerSchemesAsPrivileged([
  {
    scheme: ARTWORK_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: AUDIO_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null

function registerArtworkProtocol(): void {
  protocol.handle(ARTWORK_PROTOCOL, (request) => {
    const url = new URL(request.url)
    // basename() strips any ".." segments, so requests can only ever resolve
    // to a file directly inside the artwork cache directory.
    const fileName = basename(decodeURIComponent(url.pathname))
    const filePath = join(getArtworkCacheDir(), fileName)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function registerAudioProtocol(): void {
  protocol.handle(AUDIO_PROTOCOL, (request) => {
    const url = new URL(request.url)
    const fileName = basename(decodeURIComponent(url.pathname))
    const filePath = join(getAudioCacheDir(), fileName)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Witcher Vault',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await initDatabase()
  registerIpcHandlers()
  registerArtworkProtocol()
  registerAudioProtocol()

  createWindow()

  setSessionUpdateListener((update) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GAME_SESSION_UPDATE, update)
  })

  setUpdateEventListener((update) => {
    mainWindow?.webContents.send(IPC_CHANNELS.UPDATE_EVENT, update)
  })

  // Fire-and-forget: never blocks window creation, never surfaces an error
  // dialog. A no-op when no Steam profile has been configured yet.
  runSilentBackgroundSync()
    .then((result) => {
      if (result?.ok) {
        mainWindow?.webContents.send(IPC_CHANNELS.STEAM_BACKGROUND_SYNC_EVENT, result)
      }
    })
    .catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  persist()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  persist()
})
