// Cloud sync between the on-device SQLite state and the signed-in account.
// Pull-merge runs at app start and after sign-in; pushes happen live as the
// user reads and edits their library. Everything is best-effort — offline or
// signed-out just means local-only, same as before accounts existed.
import { api } from "./api";
import {
  getCanonicalProgress,
  getCanonicalReadNumbers,
  getLibraryCanonicalIds,
  listAllCanonicalProgress,
  markCanonicalReadMany,
  setCanonicalProgress,
  upsertLibraryFromCloud,
} from "./library";
import { getSessionUser } from "./session";

/** Pull cloud library + progress and reconcile with local (both directions). */
export async function pullCloud(): Promise<void> {
  if (!getSessionUser()) return;
  try {
    const [cloudLib, cloudProgress] = await Promise.all([
      api.syncLibrary(),
      api.syncProgress(),
    ]);

    // Library: cloud rows appear locally; local-only rows go up
    upsertLibraryFromCloud(cloudLib);
    const cloudIds = new Set(cloudLib.map((e) => e.canonicalId));
    for (const local of getLibraryCanonicalIds()) {
      if (!cloudIds.has(local.canonicalId)) {
        void api.putLibrary(local.canonicalId, local.src, local.seriesId).catch(() => {});
      }
    }

    // Progress: last write wins per series
    const cloudByCanonical = new Map(cloudProgress.map((p) => [p.canonicalId, p]));
    for (const p of cloudProgress) {
      const local = getCanonicalProgress(p.canonicalId);
      const serverTime = new Date(p.updatedAt).getTime();
      if (!local || local.updatedAt < serverTime) {
        setCanonicalProgress(
          p.canonicalId,
          p.chapterNumber,
          p.pageIndex,
          p.pageCount ?? undefined,
          serverTime,
        );
      } else if (local.updatedAt > serverTime) {
        void api
          .putProgress(p.canonicalId, local.chapterNumber, local.pageIndex, local.pageCount)
          .catch(() => {});
      }
    }
    for (const local of listAllCanonicalProgress()) {
      if (!cloudByCanonical.has(local.canonicalId)) {
        void api
          .putProgress(local.canonicalId, local.chapterNumber, local.pageIndex, local.pageCount)
          .catch(() => {});
      }
    }
  } catch {
    // offline / server unreachable — stay local
  }
}

// Progress pushes are throttled per series so page turns don't spam the API
const lastProgressPush = new Map<string, number>();
const PUSH_INTERVAL_MS = 8000;

export function pushProgress(
  canonicalId: string,
  chapterNumber: number,
  pageIndex: number,
  pageCount?: number,
): void {
  if (!getSessionUser()) return;
  const now = Date.now();
  if (now - (lastProgressPush.get(canonicalId) ?? 0) < PUSH_INTERVAL_MS) return;
  lastProgressPush.set(canonicalId, now);
  void api.putProgress(canonicalId, chapterNumber, pageIndex, pageCount).catch(() => {});
}

/**
 * Merge read-marks for one series with the cloud (both directions).
 * Returns true when new marks arrived locally (caller may refresh UI).
 */
export async function syncReads(canonicalId: string): Promise<boolean> {
  if (!getSessionUser()) return false;
  try {
    const server = await api.syncReads(canonicalId);
    const local = getCanonicalReadNumbers(canonicalId);
    const serverSet = new Set(server);
    const newLocal = server.filter((n) => !local.has(n));
    if (newLocal.length > 0) markCanonicalReadMany(canonicalId, newLocal);
    const missing = [...local].filter((n) => !serverSet.has(n));
    if (missing.length > 0) void api.pushReads(canonicalId, missing).catch(() => {});
    return newLocal.length > 0;
  } catch {
    return false;
  }
}
