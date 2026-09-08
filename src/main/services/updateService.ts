import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateEvent } from '../../shared/models'

type UpdateEventListener = (event: UpdateEvent) => void
let listener: UpdateEventListener | null = null

export function setUpdateEventListener(fn: UpdateEventListener | null): void {
  listener = fn
}

function emit(event: UpdateEvent): void {
  listener?.(event)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء التحديث.'
}

let initialized = false

function ensureInitialized(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => emit({ type: 'checking-for-update' }))
  autoUpdater.on('update-available', (info) => emit({ type: 'update-available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ type: 'update-not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    emit({ type: 'download-progress', percent: progress.percent })
  )
  autoUpdater.on('update-downloaded', (info) => emit({ type: 'update-downloaded', version: info.version }))
  autoUpdater.on('error', (err) => emit({ type: 'error', message: errorMessage(err) }))
}

export async function checkForUpdates(): Promise<void> {
  ensureInitialized()

  if (!app.isPackaged) {
    emit({ type: 'error', message: 'التحقق من التحديثات متاح فقط في النسخة المثبّتة من التطبيق.' })
    return
  }

  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ type: 'error', message: errorMessage(err) })
  }
}

export async function startDownloadUpdate(): Promise<void> {
  ensureInitialized()
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    emit({ type: 'error', message: errorMessage(err) })
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
