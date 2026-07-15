// Small HTTP helper shared by all source adapters.
// Enforces per-host politeness: at most one request per host at a time,
// with a minimum delay between requests, so we never hammer a source site.

// Scraped sites get a conservative delay; MangaDex's official API allows
// ~5 req/s per IP, so it can be polled faster (matters for long chapter feeds).
const DEFAULT_DELAY_MS = 500;
const HOST_DELAY_MS: Record<string, number> = {
  "api.mangadex.org": 250,
};
const lastRequestAt = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

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

export async function fetchHtml(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetchWithPolicy(url, init);
  return await res.text();
}
