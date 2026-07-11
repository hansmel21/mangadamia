// HTTP helper for approved APIs. Enforces a per-host request cadence.

const DEFAULT_DELAY_MS = 500;
const HOST_DELAY_MS: Record<string, number> = {
  "api.mangadex.org": 250,
};
const lastRequestAt = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

const USER_AGENT = process.env.APP_USER_AGENT ?? "MangaShelf/1.0 (MangaDex API client)";

async function throttle(host: string): Promise<void> {
  const prev = queues.get(host) ?? Promise.resolve();
  let release!: () => void;
  queues.set(host, new Promise<void>((r) => (release = r)));
  await prev;
  const wait =
    (lastRequestAt.get(host) ?? 0) + (HOST_DELAY_MS[host] ?? DEFAULT_DELAY_MS) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
  release();
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

export async function fetchWithPolicy(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  await throttle(new URL(url).host);
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res;
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithPolicy(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  return (await res.json()) as T;
}
