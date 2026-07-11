// Rolling health stats per source. Used to order "servers" (best first) and
// to decide which source answers when several carry the same series.
// In-memory only — resets on restart, warms up within a few requests.

interface SourceHealth {
  ewmaMs: number; // smoothed response time
  lastFailureAt: number; // epoch ms of the most recent failure
  failures: number;
  successes: number;
}

const stats = new Map<string, SourceHealth>();

const EWMA_ALPHA = 0.3; // weight of the newest sample
const FAILURE_PENALTY_MS = 10_000; // a recent failure ranks a source last
const FAILURE_MEMORY_MS = 5 * 60 * 1000;

function get(sourceId: string): SourceHealth {
  let s = stats.get(sourceId);
  if (!s) {
    s = { ewmaMs: 1000, lastFailureAt: 0, failures: 0, successes: 0 };
    stats.set(sourceId, s);
  }
  return s;
}

/** Run a source call, recording its latency or failure. */
export async function tracked<T>(sourceId: string, fn: () => Promise<T>): Promise<T> {
  const s = get(sourceId);
  const started = Date.now();
  try {
    const result = await fn();
    s.ewmaMs = EWMA_ALPHA * (Date.now() - started) + (1 - EWMA_ALPHA) * s.ewmaMs;
    s.successes++;
    return result;
  } catch (err) {
    s.lastFailureAt = Date.now();
    s.failures++;
    throw err;
  }
}

function score(sourceId: string): number {
  const s = get(sourceId);
  const recentFailure = Date.now() - s.lastFailureAt < FAILURE_MEMORY_MS;
  return s.ewmaMs + (recentFailure ? FAILURE_PENALTY_MS : 0);
}

/** Order source ids best-first (fastest, no recent failures). */
export function rankSources(ids: string[]): string[] {
  return [...ids].sort((a, b) => score(a) - score(b));
}
