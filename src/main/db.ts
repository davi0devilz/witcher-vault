import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import initSqlJs, { type Database } from 'sql.js'
import type { Game, GameSession, LaunchSource, StoreType } from '../shared/models'
import { normalizeTitle } from './scanners/titleNormalizer'
import type { ScannedGame } from './scanners/types'

let db: Database | null = null
let dbFilePath = ''

const SCHEMA_VERSION = 6

function getSqlJsWasmPath(): string {
  // sql.js ships its .wasm binary alongside the CJS build in node_modules.
  return join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'db')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  dbFilePath = join(dbDir, 'gamevault.sqlite')

  const SQL = await initSqlJs({
    locateFile: () => getSqlJsWasmPath()
  })

  if (existsSync(dbFilePath)) {
    const fileBuffer = readFileSync(dbFilePath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_title TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      install_status TEXT NOT NULL DEFAULT 'installed',
      cover_path TEXT,
      playtime_minutes INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS launch_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      store TEXT NOT NULL,
      store_app_id TEXT,
      raw_title TEXT NOT NULL,
      install_dir TEXT,
      executable_path TEXT,
      launch_command TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(store, store_app_id)
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `)

  ensureGamesArtworkColumns()

  db.run(
    `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [String(SCHEMA_VERSION)]
  )

  persist()
}

function ensureGamesArtworkColumns(): void {
  if (!db) return

  const existingColumns = new Set<string>()
  const info = db.exec('PRAGMA table_info(games)')
  if (info.length > 0) {
    for (const row of info[0].values) {
      existingColumns.add(row[1] as string)
    }
  }

  const columnsToAdd: Array<[string, string]> = [
    ['hero_path', 'TEXT'],
    ['genres', 'TEXT'],
    ['short_description', 'TEXT'],
    ['detailed_description', 'TEXT'],
    ['description_language', 'TEXT'],
    ['release_date', 'TEXT'],
    ['developer', 'TEXT'],
    ['publisher', 'TEXT'],
    ['artwork_status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['notes', 'TEXT'],
    ['notes_updated_at', 'TEXT'],
    ['hltb_status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['hltb_main_seconds', 'INTEGER'],
    ['hltb_main_extra_seconds', 'INTEGER'],
    ['hltb_completionist_seconds', 'INTEGER'],
    ['hltb_checked_at', 'TEXT'],
    ['theme_audio_status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['theme_audio_path', 'TEXT'],
    ['theme_audio_source', 'TEXT'],
    ['theme_audio_checked_at', 'TEXT']
  ]

  for (const [name, definition] of columnsToAdd) {
    if (!existingColumns.has(name)) {
      db.run(`ALTER TABLE games ADD COLUMN ${name} ${definition}`)
    }
  }
}

export function persist(): void {
  if (!db || !dbFilePath) return
  const data = db.export()
  const dir = dirname(dbFilePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(dbFilePath, Buffer.from(data))
}

export function getMeta(key: string): string | null {
  if (!db) throw new Error('Database not initialized')
  const stmt = db.prepare('SELECT value FROM meta WHERE key = :key')
  stmt.bind({ ':key': key })
  const value = stmt.step() ? (stmt.getAsObject().value as string) : null
  stmt.free()
  return value
}

export function setMeta(key: string, value: string): void {
  if (!db) throw new Error('Database not initialized')
  db.run(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  )
  persist()
}

export function getDbFilePath(): string {
  return dbFilePath
}

export interface UpsertResult {
  newGames: number
  newSources: number
}

export function upsertScannedGames(scanned: ScannedGame[]): UpsertResult {
  if (!db) throw new Error('Database not initialized')
  let newGames = 0
  let newSources = 0
  const now = new Date().toISOString()

  for (const item of scanned) {
    const normalized = normalizeTitle(item.title)
    if (!normalized) continue

    let gameId: number | null = null
    const findGameStmt = db.prepare('SELECT id FROM games WHERE normalized_title = :n')
    findGameStmt.bind({ ':n': normalized })
    if (findGameStmt.step()) {
      gameId = findGameStmt.getAsObject().id as number
    }
    findGameStmt.free()

    if (gameId === null) {
      db.run(
        `INSERT INTO games
          (normalized_title, title, install_status, playtime_minutes, is_favorite, created_at, updated_at)
         VALUES (?, ?, 'installed', 0, 0, ?, ?)`,
        [normalized, item.title, now, now]
      )
      const idStmt = db.prepare('SELECT last_insert_rowid() AS id')
      idStmt.step()
      gameId = idStmt.getAsObject().id as number
      idStmt.free()
      newGames++
    } else {
      db.run('UPDATE games SET updated_at = ? WHERE id = ?', [now, gameId])
    }

    const findSourceStmt = db.prepare(
      'SELECT id FROM launch_sources WHERE store = :store AND store_app_id = :appId'
    )
    findSourceStmt.bind({ ':store': item.store, ':appId': item.storeAppId })
    const sourceFound = findSourceStmt.step()
    const existingSourceId = sourceFound ? (findSourceStmt.getAsObject().id as number) : null
    findSourceStmt.free()

    if (existingSourceId === null) {
      const countStmt = db.prepare('SELECT COUNT(*) AS c FROM launch_sources WHERE game_id = :gid')
      countStmt.bind({ ':gid': gameId })
      countStmt.step()
      const isFirstSource = (countStmt.getAsObject().c as number) === 0
      countStmt.free()

      db.run(
        `INSERT INTO launch_sources
          (game_id, store, store_app_id, raw_title, install_dir, executable_path, launch_command, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          gameId,
          item.store,
          item.storeAppId,
          item.title,
          item.installDir,
          item.executablePath,
          item.launchCommand,
          isFirstSource ? 1 : 0,
          now,
          now
        ]
      )
      newSources++
    } else {
      db.run(
        `UPDATE launch_sources
         SET raw_title = ?, install_dir = ?, executable_path = ?, launch_command = ?, updated_at = ?
         WHERE id = ?`,
        [item.title, item.installDir, item.executablePath, item.launchCommand, now, existingSourceId]
      )
    }
  }

  persist()
  return { newGames, newSources }
}

function mapGameRow(row: Record<string, unknown>): Game {
  return {
    id: row.id as number,
    title: row.title as string,
    normalizedTitle: row.normalized_title as string,
    installStatus: row.install_status as Game['installStatus'],
    coverPath: (row.cover_path as string | null) ?? null,
    heroPath: (row.hero_path as string | null) ?? null,
    genres: row.genres ? (JSON.parse(row.genres as string) as string[]) : [],
    shortDescription: (row.short_description as string | null) ?? null,
    detailedDescription: (row.detailed_description as string | null) ?? null,
    descriptionLanguage: (row.description_language as Game['descriptionLanguage']) ?? null,
    releaseDate: (row.release_date as string | null) ?? null,
    developer: (row.developer as string | null) ?? null,
    publisher: (row.publisher as string | null) ?? null,
    artworkStatus: (row.artwork_status as Game['artworkStatus']) ?? 'pending',
    playtimeMinutes: row.playtime_minutes as number,
    lastPlayedAt: (row.last_played_at as string | null) ?? null,
    isFavorite: Boolean(row.is_favorite),
    notes: (row.notes as string | null) ?? null,
    notesUpdatedAt: (row.notes_updated_at as string | null) ?? null,
    hltbStatus: (row.hltb_status as Game['hltbStatus']) ?? 'pending',
    hltbMainSeconds: (row.hltb_main_seconds as number | null) ?? null,
    hltbMainExtraSeconds: (row.hltb_main_extra_seconds as number | null) ?? null,
    hltbCompletionistSeconds: (row.hltb_completionist_seconds as number | null) ?? null,
    themeAudioStatus: (row.theme_audio_status as Game['themeAudioStatus']) ?? 'pending',
    themeAudioPath: (row.theme_audio_path as string | null) ?? null,
    themeAudioSource: (row.theme_audio_source as Game['themeAudioSource']) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    sources: []
  }
}

function mapSourceRow(row: Record<string, unknown>): LaunchSource {
  return {
    id: row.id as number,
    gameId: row.game_id as number,
    store: row.store as StoreType,
    storeAppId: (row.store_app_id as string | null) ?? null,
    rawTitle: row.raw_title as string,
    installDir: (row.install_dir as string | null) ?? null,
    executablePath: (row.executable_path as string | null) ?? null,
    launchCommand: (row.launch_command as string | null) ?? null,
    isPrimary: Boolean(row.is_primary)
  }
}

export function getAllGamesWithSources(): Game[] {
  if (!db) throw new Error('Database not initialized')

  const games: Game[] = []
  const gameMap = new Map<number, Game>()

  const gameStmt = db.prepare('SELECT * FROM games ORDER BY title COLLATE NOCASE ASC')
  while (gameStmt.step()) {
    const game = mapGameRow(gameStmt.getAsObject())
    games.push(game)
    gameMap.set(game.id, game)
  }
  gameStmt.free()

  const sourceStmt = db.prepare('SELECT * FROM launch_sources ORDER BY is_primary DESC, id ASC')
  while (sourceStmt.step()) {
    const row = sourceStmt.getAsObject()
    const game = gameMap.get(row.game_id as number)
    if (!game) continue
    game.sources.push(mapSourceRow(row))
  }
  sourceStmt.free()

  return games
}

export function getGameWithSourcesById(gameId: number): Game | null {
  if (!db) throw new Error('Database not initialized')

  const gameStmt = db.prepare('SELECT * FROM games WHERE id = :id')
  gameStmt.bind({ ':id': gameId })
  if (!gameStmt.step()) {
    gameStmt.free()
    return null
  }
  const game = mapGameRow(gameStmt.getAsObject())
  gameStmt.free()

  const sourceStmt = db.prepare(
    'SELECT * FROM launch_sources WHERE game_id = :id ORDER BY is_primary DESC, id ASC'
  )
  sourceStmt.bind({ ':id': gameId })
  while (sourceStmt.step()) {
    game.sources.push(mapSourceRow(sourceStmt.getAsObject()))
  }
  sourceStmt.free()

  return game
}

export function getSessionsForGame(gameId: number): GameSession[] {
  if (!db) throw new Error('Database not initialized')

  const sessions: GameSession[] = []
  const stmt = db.prepare(
    'SELECT * FROM sessions WHERE game_id = :id ORDER BY started_at DESC'
  )
  stmt.bind({ ':id': gameId })
  while (stmt.step()) {
    const row = stmt.getAsObject()
    sessions.push({
      id: row.id as number,
      gameId: row.game_id as number,
      startedAt: row.started_at as string,
      endedAt: (row.ended_at as string | null) ?? null,
      durationMinutes: row.duration_minutes as number
    })
  }
  stmt.free()
  return sessions
}

export function recordSession(
  gameId: number,
  startedAt: string,
  endedAt: string,
  durationMinutes: number
): void {
  if (!db) throw new Error('Database not initialized')
  const now = new Date().toISOString()

  db.run(
    `INSERT INTO sessions (game_id, started_at, ended_at, duration_minutes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [gameId, startedAt, endedAt, durationMinutes, now]
  )

  db.run(
    `UPDATE games SET
       playtime_minutes = playtime_minutes + ?,
       last_played_at = ?,
       updated_at = ?
     WHERE id = ?`,
    [durationMinutes, endedAt, now, gameId]
  )

  persist()
}

export function setFavorite(gameId: number, isFavorite: boolean): void {
  if (!db) throw new Error('Database not initialized')
  db.run('UPDATE games SET is_favorite = ?, updated_at = ? WHERE id = ?', [
    isFavorite ? 1 : 0,
    new Date().toISOString(),
    gameId
  ])
  persist()
}

export function removeGame(gameId: number): void {
  if (!db) throw new Error('Database not initialized')
  // sql.js's bundled SQLite build doesn't enforce declared FK constraints, so
  // ON DELETE CASCADE in the schema is inert — clean up dependents explicitly.
  db.run('DELETE FROM sessions WHERE game_id = ?', [gameId])
  db.run('DELETE FROM launch_sources WHERE game_id = ?', [gameId])
  db.run('DELETE FROM games WHERE id = ?', [gameId])
  persist()
}

export function setGameCover(gameId: number, coverFileName: string): void {
  if (!db) throw new Error('Database not initialized')
  db.run(
    `UPDATE games SET cover_path = ?, artwork_status = 'fetched', updated_at = ? WHERE id = ?`,
    [coverFileName, new Date().toISOString(), gameId]
  )
  persist()
}

export function setGameHero(gameId: number, heroFileName: string): void {
  if (!db) throw new Error('Database not initialized')
  db.run(`UPDATE games SET hero_path = ?, updated_at = ? WHERE id = ?`, [
    heroFileName,
    new Date().toISOString(),
    gameId
  ])
  persist()
}

export function updateGameNotes(gameId: number, notes: string): string {
  if (!db) throw new Error('Database not initialized')
  const now = new Date().toISOString()
  db.run('UPDATE games SET notes = ?, notes_updated_at = ?, updated_at = ? WHERE id = ?', [
    notes,
    now,
    now,
    gameId
  ])
  persist()
  return now
}

export function updateGameDescription(
  gameId: number,
  shortDescription: string | null,
  detailedDescription: string | null
): void {
  if (!db) throw new Error('Database not initialized')
  db.run(
    `UPDATE games SET
       short_description = COALESCE(?, short_description),
       detailed_description = COALESCE(?, detailed_description),
       description_language = 'ar',
       updated_at = ?
     WHERE id = ?`,
    [shortDescription, detailedDescription, new Date().toISOString(), gameId]
  )
  persist()
}

export function updateSourceExecutablePath(sourceId: number, executablePath: string): void {
  if (!db) throw new Error('Database not initialized')
  db.run('UPDATE launch_sources SET executable_path = ?, updated_at = ? WHERE id = ?', [
    executablePath,
    new Date().toISOString(),
    sourceId
  ])
  persist()
}

export interface ArtworkUpdate {
  coverPath: string | null
  heroPath: string | null
  genres: string[]
  shortDescription: string | null
  detailedDescription: string | null
  descriptionLanguage: 'ar' | 'en' | null
  releaseDate: string | null
  developer: string | null
  publisher: string | null
}

export function updateGameArtwork(gameId: number, update: ArtworkUpdate): void {
  if (!db) throw new Error('Database not initialized')
  const now = new Date().toISOString()

  db.run(
    `UPDATE games SET
       cover_path = COALESCE(?, cover_path),
       hero_path = COALESCE(?, hero_path),
       genres = ?,
       short_description = ?,
       detailed_description = ?,
       description_language = ?,
       release_date = ?,
       developer = ?,
       publisher = ?,
       artwork_status = CASE WHEN COALESCE(?, cover_path) IS NOT NULL THEN 'fetched' ELSE 'unavailable' END,
       updated_at = ?
     WHERE id = ?`,
    [
      update.coverPath,
      update.heroPath,
      JSON.stringify(update.genres),
      update.shortDescription,
      update.detailedDescription,
      update.descriptionLanguage,
      update.releaseDate,
      update.developer,
      update.publisher,
      update.coverPath,
      now,
      gameId
    ]
  )

  persist()
}

export interface HltbUpdate {
  mainSeconds: number | null
  mainExtraSeconds: number | null
  completionistSeconds: number | null
}

export function updateGameHltb(gameId: number, update: HltbUpdate | null): void {
  if (!db) throw new Error('Database not initialized')
  const now = new Date().toISOString()
  const found = update !== null && (update.mainSeconds !== null || update.mainExtraSeconds !== null || update.completionistSeconds !== null)

  db.run(
    `UPDATE games SET
       hltb_status = ?,
       hltb_main_seconds = ?,
       hltb_main_extra_seconds = ?,
       hltb_completionist_seconds = ?,
       hltb_checked_at = ?
     WHERE id = ?`,
    [
      found ? 'fetched' : 'unavailable',
      update?.mainSeconds ?? null,
      update?.mainExtraSeconds ?? null,
      update?.completionistSeconds ?? null,
      now,
      gameId
    ]
  )

  persist()
}

export function setGameThemeAudio(
  gameId: number,
  fileName: string | null,
  source: 'khinsider' | 'custom' | null
): void {
  if (!db) throw new Error('Database not initialized')
  db.run(
    `UPDATE games SET
       theme_audio_status = ?,
       theme_audio_path = ?,
       theme_audio_source = ?,
       theme_audio_checked_at = ?
     WHERE id = ?`,
    [fileName ? 'fetched' : 'unavailable', fileName, source, new Date().toISOString(), gameId]
  )
  persist()
}
