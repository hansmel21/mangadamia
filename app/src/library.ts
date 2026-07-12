// Local library + reading progress, stored on-device in SQLite.
// V1 keeps everything local (no accounts); v2 can sync this to the backend.

import * as SQLite from "expo-sqlite";
import { Directory, Paths } from "expo-file-system";

export const db = SQLite.openDatabaseSync("mangashelf.db");

db.execSync(`
  CREATE TABLE IF NOT EXISTS library (
    src TEXT NOT NULL,
    series_id TEXT NOT NULL,
    title TEXT NOT NULL,
    cover_url TEXT,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (src, series_id)
  );
  CREATE TABLE IF NOT EXISTS read_chapters (
    src TEXT NOT NULL,
    series_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (src, series_id, chapter_id)
  );
  CREATE TABLE IF NOT EXISTS last_read (
    src TEXT NOT NULL,
    series_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    chapter_number REAL NOT NULL,
    page_index INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (src, series_id)
  );
`);

// Canonical-keyed progress: server-independent. The canonical id comes from
// the backend and is the same no matter which "server" a chapter is read on,
// so switching servers keeps read-marks and the continue point (by chapter
// number, which is how the sources line up).
db.execSync(`
  CREATE TABLE IF NOT EXISTS canonical_progress (
    canonical_id TEXT PRIMARY KEY,
    chapter_number REAL NOT NULL,
    page_index INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS canonical_read (
    canonical_id TEXT NOT NULL,
    chapter_number REAL NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (canonical_id, chapter_number)
  );
`);

// Column migrations for installs created before these columns existed.
// ALTER TABLE throws if the column is already there — that's fine.
for (const col of ["title TEXT", "cover_url TEXT", "page_count INTEGER"]) {
  try {
    db.execSync(`ALTER TABLE last_read ADD COLUMN ${col}`);
  } catch {
    // column already exists
  }
}
for (const col of ["last_seen_chapter REAL", "canonical_id TEXT"]) {
  try {
    // last_seen_chapter: highest chapter number seen on the series screen
    // (anything above it counts as "new"). canonical_id: cloud-sync anchor.
    db.execSync(`ALTER TABLE library ADD COLUMN ${col}`);
  } catch {
    // column already exists
  }
}
try {
  db.execSync(`ALTER TABLE canonical_progress ADD COLUMN page_count INTEGER`);
} catch {
  // column already exists
}

export interface LibraryEntry {
  src: string;
  seriesId: string;
  title: string;
  coverUrl?: string;
  lastReadChapterId?: string;
  lastReadChapterNumber?: number;
  lastSeenChapter?: number;
}

export function listLibrary(): LibraryEntry[] {
  const rows = db.getAllSync<{
    src: string;
    series_id: string;
    title: string;
    cover_url: string | null;
    chapter_id: string | null;
    chapter_number: number | null;
    last_seen_chapter: number | null;
  }>(`
    SELECT l.src, l.series_id, l.title, l.cover_url, l.last_seen_chapter, r.chapter_id, r.chapter_number
    FROM library l
    LEFT JOIN last_read r ON r.src = l.src AND r.series_id = l.series_id
    ORDER BY COALESCE(r.updated_at, l.added_at) DESC
  `);
  return rows.map((r) => ({
    src: r.src,
    seriesId: r.series_id,
    lastSeenChapter: r.last_seen_chapter ?? undefined,
    title: r.title,
    coverUrl: r.cover_url ?? undefined,
    lastReadChapterId: r.chapter_id ?? undefined,
    lastReadChapterNumber: r.chapter_number ?? undefined,
  }));
}

export function isInLibrary(src: string, seriesId: string): boolean {
  return (
    db.getFirstSync(`SELECT 1 FROM library WHERE src = ? AND series_id = ?`, [src, seriesId]) !=
    null
  );
}

export function addToLibrary(src: string, seriesId: string, title: string, coverUrl?: string) {
  db.runSync(
    `INSERT OR REPLACE INTO library (src, series_id, title, cover_url, added_at) VALUES (?, ?, ?, ?, ?)`,
    [src, seriesId, title, coverUrl ?? null, Date.now()],
  );
}

export function removeFromLibrary(src: string, seriesId: string) {
  db.runSync(`DELETE FROM library WHERE src = ? AND series_id = ?`, [src, seriesId]);
}

/** Record the newest chapter number the user has seen on the series screen. */
export function setLastSeenChapter(src: string, seriesId: string, chapterNumber: number) {
  db.runSync(
    `UPDATE library SET last_seen_chapter = ?
     WHERE src = ? AND series_id = ? AND COALESCE(last_seen_chapter, -1) < ?`,
    [chapterNumber, src, seriesId, chapterNumber],
  );
}

/** Backfill the cloud-sync anchor on a library row once we learn it. */
export function setLibraryCanonical(src: string, seriesId: string, canonicalId: string) {
  db.runSync(
    `UPDATE library SET canonical_id = ? WHERE src = ? AND series_id = ? AND canonical_id IS NULL`,
    [canonicalId, src, seriesId],
  );
}

export function getLibraryCanonicalIds(): { src: string; seriesId: string; canonicalId: string }[] {
  return db
    .getAllSync<{ src: string; series_id: string; canonical_id: string }>(
      `SELECT src, series_id, canonical_id FROM library WHERE canonical_id IS NOT NULL`,
    )
    .map((r) => ({ src: r.src, seriesId: r.series_id, canonicalId: r.canonical_id }));
}

/** Insert library rows pulled from the cloud (never overwrites local rows). */
export function upsertLibraryFromCloud(
  entries: {
    canonicalId: string;
    source: string;
    sourceSeriesId: string;
    title: string;
    coverUrl?: string | null;
    addedAt: string;
  }[],
) {
  for (const e of entries) {
    db.runSync(
      `INSERT OR IGNORE INTO library (src, series_id, title, cover_url, added_at, canonical_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        e.source,
        e.sourceSeriesId,
        e.title,
        e.coverUrl ?? null,
        new Date(e.addedAt).getTime(),
        e.canonicalId,
      ],
    );
    db.runSync(
      `UPDATE library SET canonical_id = COALESCE(canonical_id, ?) WHERE src = ? AND series_id = ?`,
      [e.canonicalId, e.source, e.sourceSeriesId],
    );
  }
}

export function markCanonicalReadMany(canonicalId: string, numbers: number[]) {
  for (const n of numbers) {
    db.runSync(
      `INSERT OR IGNORE INTO canonical_read (canonical_id, chapter_number, read_at) VALUES (?, ?, ?)`,
      [canonicalId, n, Date.now()],
    );
  }
}

export function listAllCanonicalProgress(): {
  canonicalId: string;
  chapterNumber: number;
  pageIndex: number;
  pageCount?: number;
  updatedAt: number;
}[] {
  return db
    .getAllSync<{
      canonical_id: string;
      chapter_number: number;
      page_index: number;
      page_count: number | null;
      updated_at: number;
    }>(`SELECT canonical_id, chapter_number, page_index, page_count, updated_at FROM canonical_progress`)
    .map((r) => ({
      canonicalId: r.canonical_id,
      chapterNumber: r.chapter_number,
      pageIndex: r.page_index,
      pageCount: r.page_count ?? undefined,
      updatedAt: r.updated_at,
    }));
}

export function markChapterRead(src: string, seriesId: string, chapterId: string) {
  db.runSync(
    `INSERT OR REPLACE INTO read_chapters (src, series_id, chapter_id, read_at) VALUES (?, ?, ?, ?)`,
    [src, seriesId, chapterId, Date.now()],
  );
}

export function getReadChapterIds(src: string, seriesId: string): Set<string> {
  const rows = db.getAllSync<{ chapter_id: string }>(
    `SELECT chapter_id FROM read_chapters WHERE src = ? AND series_id = ?`,
    [src, seriesId],
  );
  return new Set(rows.map((r) => r.chapter_id));
}

export function setLastRead(
  src: string,
  seriesId: string,
  chapterId: string,
  chapterNumber: number,
  pageIndex = 0,
  title?: string,
  coverUrl?: string,
  pageCount?: number,
) {
  db.runSync(
    `INSERT OR REPLACE INTO last_read (src, series_id, chapter_id, chapter_number, page_index, updated_at, title, cover_url, page_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      src,
      seriesId,
      chapterId,
      chapterNumber,
      pageIndex,
      Date.now(),
      title ?? null,
      coverUrl ?? null,
      pageCount ?? null,
    ],
  );
}

export function setCanonicalProgress(
  canonicalId: string,
  chapterNumber: number,
  pageIndex = 0,
  pageCount?: number,
  updatedAtMs = Date.now(), // cloud pulls pass the server's timestamp
) {
  db.runSync(
    `INSERT OR REPLACE INTO canonical_progress (canonical_id, chapter_number, page_index, updated_at, page_count)
     VALUES (?, ?, ?, ?, ?)`,
    [canonicalId, chapterNumber, pageIndex, updatedAtMs, pageCount ?? null],
  );
}

export function getCanonicalProgress(
  canonicalId: string,
): { chapterNumber: number; pageIndex: number; pageCount?: number; updatedAt: number } | undefined {
  const row = db.getFirstSync<{
    chapter_number: number;
    page_index: number;
    page_count: number | null;
    updated_at: number;
  }>(
    `SELECT chapter_number, page_index, page_count, updated_at FROM canonical_progress WHERE canonical_id = ?`,
    [canonicalId],
  );
  return row
    ? {
        chapterNumber: row.chapter_number,
        pageIndex: row.page_index,
        pageCount: row.page_count ?? undefined,
        updatedAt: row.updated_at,
      }
    : undefined;
}

export function markCanonicalRead(canonicalId: string, chapterNumber: number) {
  db.runSync(
    `INSERT OR REPLACE INTO canonical_read (canonical_id, chapter_number, read_at) VALUES (?, ?, ?)`,
    [canonicalId, chapterNumber, Date.now()],
  );
}

export function getCanonicalReadNumbers(canonicalId: string): Set<number> {
  const rows = db.getAllSync<{ chapter_number: number }>(
    `SELECT chapter_number FROM canonical_read WHERE canonical_id = ?`,
    [canonicalId],
  );
  return new Set(rows.map((r) => r.chapter_number));
}

// ── Recent searches ─────────────────────────────────────────────────────────
db.execSync(
  `CREATE TABLE IF NOT EXISTS recent_searches (query TEXT PRIMARY KEY, at INTEGER NOT NULL)`,
);

export function addRecentSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  db.runSync(`INSERT OR REPLACE INTO recent_searches (query, at) VALUES (?, ?)`, [q, Date.now()]);
  // keep only the freshest 12
  db.runSync(
    `DELETE FROM recent_searches WHERE query NOT IN
     (SELECT query FROM recent_searches ORDER BY at DESC LIMIT 12)`,
  );
}

export function listRecentSearches(limit = 8): string[] {
  return db
    .getAllSync<{ query: string }>(
      `SELECT query FROM recent_searches ORDER BY at DESC LIMIT ?`,
      [limit],
    )
    .map((r) => r.query);
}

export function clearRecentSearches() {
  db.runSync(`DELETE FROM recent_searches`);
}

export function clearAllLocalData() {
  db.execSync(`
    DELETE FROM library;
    DELETE FROM read_chapters;
    DELETE FROM last_read;
    DELETE FROM canonical_progress;
    DELETE FROM canonical_read;
    DELETE FROM recent_searches;
    DELETE FROM kv;
  `);
  // Remove files created by pre-compliance builds that supported downloads.
  try {
    const legacyDownloads = new Directory(Paths.document, "downloads");
    if (legacyDownloads.exists) legacyDownloads.delete();
  } catch {
    // Best effort; uninstalling the app also removes its private directory.
  }
}

export interface HistoryEntry {
  src: string;
  seriesId: string;
  chapterId: string;
  chapterNumber: number;
  pageIndex: number;
  pageCount?: number;
  updatedAt: number;
  title: string;
  coverUrl?: string;
}

export function listHistory(limit = 100): HistoryEntry[] {
  const rows = db.getAllSync<{
    src: string;
    series_id: string;
    chapter_id: string;
    chapter_number: number;
    page_index: number;
    page_count: number | null;
    updated_at: number;
    t: string | null;
    c: string | null;
  }>(
    `SELECT r.src, r.series_id, r.chapter_id, r.chapter_number, r.page_index, r.page_count, r.updated_at,
            COALESCE(r.title, l.title) AS t, COALESCE(r.cover_url, l.cover_url) AS c
     FROM last_read r
     LEFT JOIN library l ON l.src = r.src AND l.series_id = r.series_id
     WHERE COALESCE(r.title, l.title) IS NOT NULL
     ORDER BY r.updated_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    src: r.src,
    seriesId: r.series_id,
    chapterId: r.chapter_id,
    chapterNumber: r.chapter_number,
    pageIndex: r.page_index,
    pageCount: r.page_count ?? undefined,
    updatedAt: r.updated_at,
    title: r.t ?? "",
    coverUrl: r.c ?? undefined,
  }));
}

/**
 * The reader's most recent read position joined to a cloud-known series —
 * used by the composer to auto-tag a new record ("CH. n — auto-tagged from
 * your last read"). Only rows with a canonical_id qualify, since post tags
 * anchor on canonicalId.
 */
export function getLastReadTag():
  | { canonicalId: string; title: string; chapterNumber: number }
  | undefined {
  const row = db.getFirstSync<{
    canonical_id: string;
    t: string | null;
    chapter_number: number;
  }>(
    `SELECT l.canonical_id, COALESCE(r.title, l.title) AS t, r.chapter_number
     FROM last_read r
     JOIN library l ON l.src = r.src AND l.series_id = r.series_id
     WHERE l.canonical_id IS NOT NULL
     ORDER BY r.updated_at DESC
     LIMIT 1`,
  );
  return row && row.t
    ? { canonicalId: row.canonical_id, title: row.t, chapterNumber: row.chapter_number }
    : undefined;
}

export function getLastRead(
  src: string,
  seriesId: string,
):
  | { chapterId: string; chapterNumber: number; pageIndex: number; pageCount?: number }
  | undefined {
  const row = db.getFirstSync<{
    chapter_id: string;
    chapter_number: number;
    page_index: number;
    page_count: number | null;
  }>(
    `SELECT chapter_id, chapter_number, page_index, page_count FROM last_read WHERE src = ? AND series_id = ?`,
    [src, seriesId],
  );
  return row
    ? {
        chapterId: row.chapter_id,
        chapterNumber: row.chapter_number,
        pageIndex: row.page_index,
        pageCount: row.page_count ?? undefined,
      }
    : undefined;
}
