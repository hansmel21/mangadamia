// Remote source adapter. Implements the `Source` contract by calling the
// external scraper service (see the `scraper/` workspace) over HTTP instead of
// scraping in-process. One remote adapter per source id, so `unifiedList`,
// `catalog`, and `health` treat them exactly like the old in-process sources.
//
// Throttling now lives in the scraper (per-host politeness); here we just fetch.
// Any non-2xx throws so `health.tracked()` records the failure like before.

import type {
  PageInfo,
  SeriesDetail,
  SeriesSummary,
  Source,
  StatusFilter,
} from "./types.js";

const BASE = (process.env.SCRAPER_URL ?? "http://localhost:4000").replace(/\/$/, "");
const KEY = process.env.SCRAPER_API_KEY ?? "";

export interface RemoteSourceMeta {
  id: string;
  name: string;
  languages: string[];
  // Which optional listing feeds the underlying adapter supports. Leaving one
  // out means this source simply sits out that feed (same as an in-process
  // adapter that doesn't implement the method).
  hasLatest?: boolean;
  hasNewest?: boolean;
}

class ScraperError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`Scraper ${status} from ${url}`);
  }
}

async function call<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "x-scraper-key": KEY, accept: "application/json" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new ScraperError(res.status, url);
  return (await res.json()) as T;
}

// publishedAt crosses the wire as an ISO string (or undefined); revive it to a
// Date so catalog.ts's change-detection (publishedAt.getTime()) keeps working.
function reviveSeries(detail: SeriesDetail): SeriesDetail {
  return {
    ...detail,
    chapters: detail.chapters.map((ch) => ({
      ...ch,
      publishedAt: ch.publishedAt ? new Date(ch.publishedAt) : undefined,
    })),
  };
}

function listPath(id: string, kind: string, page: number, extra = ""): string {
  return `/sources/${encodeURIComponent(id)}/list?kind=${kind}&page=${page}${extra}`;
}

export function remoteSource(meta: RemoteSourceMeta): Source {
  const { id, name, languages } = meta;

  const source: Source = {
    id,
    name,
    languages,

    search: (query, page, status?: StatusFilter) =>
      call<SeriesSummary[]>(
        listPath(id, "search", page, `&q=${encodeURIComponent(query)}${status ? `&status=${status}` : ""}`),
      ),

    getPopular: (page) => call<SeriesSummary[]>(listPath(id, "popular", page)),

    getSeries: async (sourceSeriesId) =>
      reviveSeries(
        await call<SeriesDetail>(
          `/sources/${encodeURIComponent(id)}/series/${encodeURIComponent(sourceSeriesId)}`,
        ),
      ),

    getPages: (sourceSeriesId, sourceChapterId) =>
      call<PageInfo[]>(
        `/sources/${encodeURIComponent(id)}/series/${encodeURIComponent(sourceSeriesId)}` +
          `/chapters/${encodeURIComponent(sourceChapterId)}/pages`,
      ),
  };

  if (meta.hasLatest) source.getLatest = (page) => call<SeriesSummary[]>(listPath(id, "latest", page));
  if (meta.hasNewest) source.getNewest = (page) => call<SeriesSummary[]>(listPath(id, "newest", page));

  return source;
}
