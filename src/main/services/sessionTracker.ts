import { execFile } from 'child_process'
import { shell } from 'electron'
import { basename } from 'path'
import { promisify } from 'util'
import type { Game, SessionUpdate } from '../../shared/models'
import { recordSession } from '../db'
import { resolveExecutableForSource } from './executableResolver'

const execFileAsync = promisify(execFile)

type UpdateListener = (update: SessionUpdate) => void
let listener: UpdateListener | null = null

export function setSessionUpdateListener(fn: UpdateListener | null): void {
  listener = fn
}

function emit(update: SessionUpdate): void {
  listener?.(update)
}

const activeTrackers = new Set<number>()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isProcessRunning(exeName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI',
      `IMAGENAME eq ${exeName}`,
      '/FO',
      'CSV',
      '/NH'
    ])
    return stdout.toLowerCase().includes(exeName.toLowerCase())
  } catch {
    return false
  }
}

export function isGameBeingTracked(gameId: number): boolean {
  return activeTrackers.has(gameId)
}

/**
 * Polls `tasklist` for the given process name until it appears (session
 * start) and then until it disappears again (session end), persisting the
 * resulting session to SQLite. Exported separately from launchGame() so the
 * polling/recording mechanism can be exercised against any process name.
 */
export async function trackSession(gameId: number, exeName: string): Promise<void> {
  const startTimeoutMs = 60_000
  const pollIntervalMs = 5_000

  emit({ gameId, status: 'starting', startedAt: null, elapsedMinutes: 0 })

  let waited = 0
  let running = await isProcessRunning(exeName)
  while (!running && waited < startTimeoutMs) {
    await delay(pollIntervalMs)
    waited += pollIntervalMs
    running = await isProcessRunning(exeName)
  }

  if (!running) {
    emit({
      gameId,
      status: 'timeout',
      startedAt: null,
      elapsedMinutes: 0,
      message: 'لم يتم رصد بدء تشغيل اللعبة خلال المهلة المحددة.'
    })
    return
  }

  const startedAt = new Date()
  emit({ gameId, status: 'running', startedAt: startedAt.toISOString(), elapsedMinutes: 0 })

  do {
    await delay(pollIntervalMs)
    running = await isProcessRunning(exeName)
    const elapsedMinutes = Math.floor((Date.now() - startedAt.getTime()) / 60000)
    if (running) {
      emit({ gameId, status: 'running', startedAt: startedAt.toISOString(), elapsedMinutes })
    }
  } while (running)

  const endedAt = new Date()
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)

  recordSession(gameId, startedAt.toISOString(), endedAt.toISOString(), durationMinutes)
  emit({ gameId, status: 'ended', startedAt: startedAt.toISOString(), elapsedMinutes: durationMinutes })
}

export interface LaunchResult {
  ok: boolean
  message?: string
}

export async function launchGame(game: Game): Promise<LaunchResult> {
  if (activeTrackers.has(game.id)) {
    return { ok: false, message: 'اللعبة قيد التتبع بالفعل — لا يمكن إطلاقها مرتين.' }
  }

  const source = game.sources.find((s) => s.isPrimary) ?? game.sources[0]
  if (!source || !source.launchCommand) {
    return { ok: false, message: 'لا يوجد أمر تشغيل متاح لهذه اللعبة.' }
  }

  let exeName: string | null = null

  if (source.store === 'steam') {
    const resolved = resolveExecutableForSource(source)
    exeName = resolved ? basename(resolved) : null
    await shell.openExternal(source.launchCommand)
  } else {
    const resolved = resolveExecutableForSource(source) ?? source.executablePath
    if (!resolved) {
      return { ok: false, message: 'تعذّر تحديد الملف التنفيذي لهذه اللعبة.' }
    }
    exeName = basename(resolved)
    const openError = await shell.openPath(resolved)
    if (openError) {
      return { ok: false, message: `تعذّر تشغيل اللعبة: ${openError}` }
    }
  }

  if (!exeName) {
    return {
      ok: true,
      message: 'تم إطلاق اللعبة، لكن تعذّر تحديد اسم العملية لتتبع الجلسة تلقائياً.'
    }
  }

  activeTrackers.add(game.id)
  trackSession(game.id, exeName)
    .catch((err) => {
      emit({
        gameId: game.id,
        status: 'error',
        startedAt: null,
        elapsedMinutes: 0,
        message: err instanceof Error ? err.message : String(err)
      })
    })
    .finally(() => activeTrackers.delete(game.id))

  return { ok: true }
}
