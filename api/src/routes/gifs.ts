// GIF search proxy for the composer's picker. Keeps the provider API key
// server-side, normalizes Giphy/Tenor into one shape, and pins the content
// rating (Play compliance). Configure GIPHY_API_KEY or TENOR_API_KEY; with
// neither set the route reports { configured: false } and the client shows
// a setup hint instead of a picker grid.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth.js";

interface GifResult {
  id: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

const PAGE_SIZE = 24;

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

async function searchGiphy(
  key: string,
  q: string,
  cursor: string | null,
): Promise<{ results: GifResult[]; next: string | null }> {
  const offset = cursor ? Number(cursor) || 0 : 0;
  const params = new URLSearchParams({
    api_key: key,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    rating: "pg-13",
    bundle: "messaging_non_clips",
  });
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?${params}&q=${encodeURIComponent(q)}`
    : `https://api.giphy.com/v1/gifs/trending?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw httpError(502, "GIF search is unavailable right now");
  const data = (await res.json()) as {
    data?: {
      id: string;
      images?: Record<string, { url?: string; width?: string; height?: string }>;
    }[];
    pagination?: { total_count?: number };
  };
  const results = (data.data ?? [])
    .map((g) => {
      // downsized keeps files reasonable on mobile; fixed_width_small for grid.
      const full = g.images?.downsized ?? g.images?.fixed_width ?? g.images?.original;
      const preview = g.images?.fixed_width_small ?? g.images?.fixed_width ?? full;
      if (!full?.url || !preview?.url) return null;
      return {
        id: g.id,
        previewUrl: preview.url,
        url: full.url,
        width: Number(full.width ?? 200),
        height: Number(full.height ?? 200),
      };
    })
    .filter((r): r is GifResult => r !== null);
  const total = data.pagination?.total_count ?? 0;
  const nextOffset = offset + PAGE_SIZE;
  return { results, next: results.length === PAGE_SIZE && nextOffset < total ? String(nextOffset) : null };
}

async function searchTenor(
  key: string,
  q: string,
  cursor: string | null,
): Promise<{ results: GifResult[]; next: string | null }> {
  const params = new URLSearchParams({
    key,
    limit: String(PAGE_SIZE),
    contentfilter: "medium",
    media_filter: "gif,tinygif,mediumgif",
  });
  if (cursor) params.set("pos", cursor);
  const url = q
    ? `https://tenor.googleapis.com/v2/search?${params}&q=${encodeURIComponent(q)}`
    : `https://tenor.googleapis.com/v2/featured?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw httpError(502, "GIF search is unavailable right now");
  const data = (await res.json()) as {
    results?: {
      id: string;
      media_formats?: Record<string, { url?: string; dims?: number[] }>;
    }[];
    next?: string;
  };
  const results = (data.results ?? [])
    .map((g) => {
      const full = g.media_formats?.mediumgif ?? g.media_formats?.gif;
      const preview = g.media_formats?.tinygif ?? full;
      if (!full?.url || !preview?.url) return null;
      return {
        id: g.id,
        previewUrl: preview.url,
        url: full.url,
        width: full.dims?.[0] ?? 200,
        height: full.dims?.[1] ?? 200,
      };
    })
    .filter((r): r is GifResult => r !== null);
  return { results, next: data.next && results.length > 0 ? data.next : null };
}

export function registerGifRoutes(app: FastifyInstance): void {
  app.get(
    "/gifs/search",
    { config: { rateLimit: { max: 90, timeWindow: "1 minute" } } },
    async (req) => {
      await requireUser(req);
      const { q, cursor } = z
        .object({
          q: z.string().trim().max(80).default(""),
          cursor: z.string().max(120).optional(),
        })
        .parse(req.query);
      const giphyKey = process.env.GIPHY_API_KEY;
      const tenorKey = process.env.TENOR_API_KEY;
      if (giphyKey) {
        const page = await searchGiphy(giphyKey, q, cursor ?? null);
        return { configured: true, provider: "giphy", ...page };
      }
      if (tenorKey) {
        const page = await searchTenor(tenorKey, q, cursor ?? null);
        return { configured: true, provider: "tenor", ...page };
      }
      return { configured: false, provider: null, results: [], next: null };
    },
  );
}
