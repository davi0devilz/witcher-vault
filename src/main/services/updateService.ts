import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateEvent } from '../../shared/models'

// Matches package.json's build.publish config — kept as a constant here
// (rather than reading package.json at runtime) since it's only ever used
// to build the one release-page URL below.
const GITHUB_OWNER = 'davi0devilz'
const GITHUB_REPO = 'witcher-vault'

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

// electron-builder's portable NSIS launcher sets this env var at runtime for
// the portable .exe specifically — it's how a portable build is told where
// to keep its unpacked files, and its presence is the standard way to tell
// "running as portable" apart from "running as the installed app" at
// runtime. The portable target has no installer to hand a downloaded update
// to, so it can never go through downloadUpdate()/quitAndInstall() the way
// the NSIS-installed build does — it's routed to a plain browser download of
// the new portable .exe from the GitHub release page instead.
function isRunningPortable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
}

let initialized = false

function ensureInitialized(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  // If the user downloads an update but just closes the app instead of
  // clicking "restart & install", the update still gets installed silently
  // on that quit rather than being lost — matches the installed build's
  // expected "it just stays current" behavior. Irrelevant to the portable
  // build, which never calls downloadUpdate() in the first place.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ type: 'checking-for-update' }))
  autoUpdater.on('update-available', (info) =>
    emit({ type: 'update-available', version: info.version, isPortable: isRunningPortable() })
  )
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

/**
 * Silent variant for the automatic startup check — skips the dev-mode
 * "only available in the packaged app" notice entirely (that's only useful
 * feedback for someone deliberately clicking a "check for updates" button,
 * not something to surface unprompted on every `npm run dev` launch) and
 * never throws, so a launch never stalls or shows an error banner over a
 * transient network hiccup.
 */
export async function checkForUpdatesSilently(): Promise<void> {
  if (!app.isPackaged) return
  ensureInitialized()
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // Best-effort only — the user can still check manually from Settings.
  }
}

/**
 * Opens the GitHub release page for a given version in the system browser —
 * used by the portable build's "download the new version" action, since it
 * has no installer for electron-updater to hand a download to. The URL is
 * built entirely from constants known to the main process (never from
 * renderer input), so there's nothing here for a compromised renderer to
 * redirect.
 */
export function openReleasePage(version: string): void {
  shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`)
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
