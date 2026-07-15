// Standalone scraper service. Exposes the `Source` contract (search, listings,
// series detail, chapter pages) over HTTP so the main API can consume it as a
// remote source instead of scraping in-process. Stateless — no DB; the main
// API owns the cache.
//
// Every route except /health requires the shared secret in the `x-scraper-key`
// header (matched against SCRAPER_API_KEY).

import cors from "@fastify/cors";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { getSource, sources } from "./sources/index.js";
import type { SeriesSummary, StatusFilter } from "./sources/types.js";

const API_KEY = process.env.SCRAPER_API_KEY;
if (!API_KEY) {
  throw new Error("SCRAPER_API_KEY is required — set it in scraper/.env (and match it in the main API).");
}

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

await app.register(cors, { origin: false }); // server-to-server only; no browser origin

// Shared-secret gate. /health is public so uptime checks don't need the key.
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health" || req.url.startsWith("/health?")) return;
  if (req.headers["x-scraper-key"] !== API_KEY) {
    return reply.status(401).send({ message: "Unauthorized" });
  }
});

app.setErrorHandler((error, req, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ message: "Invalid request", issues: error.issues });
  }
  const err = error as Error & { status?: number; statusCode?: number };
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) req.log.error(error);
  return reply.status(status >= 400 ? status : 500).send({
    message: status >= 500 ? "Upstream fetch failed" : err.message,
  });
});

function requireSource(id: string) {
  const source = getSource(id);
  if (!source) throw Object.assign(new Error(`Unknown source: ${id}`), { status: 404 });
  return source;
}

app.get("/health", async () => ({ ok: true }));

// The source registry the main API mirrors into its own `sources` array.
app.get("/sources", async () =>
  sources.map((s) => ({ id: s.id, name: s.name, languages: s.languages })),
);

const listQuery = z.object({
  kind: z.enum(["popular", "search", "latest", "newest"]).default("popular"),
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().optional(),
  status: z.enum(["ongoing", "completed"]).optional(),
});

// One endpoint covers search + every listing feed. An unsupported optional
// listing (e.g. Asura has no "newest") returns an empty list so the source
// simply contributes nothing to that feed rather than erroring.
app.get<{ Params: { id: string } }>("/sources/:id/list", async (req) => {
  const source = requireSource(req.params.id);
  const { kind, page, q, status } = listQuery.parse(req.query);
  const statusFilter = status as StatusFilter | undefined;

  let result: SeriesSummary[];
  if (kind === "search") {
    if (q === undefined) throw Object.assign(new Error("search requires ?q="), { status: 400 });
    result = await source.search(q, page, statusFilter);
  } else if (kind === "latest") {
    result = source.getLatest ? await source.getLatest(page) : [];
  } else if (kind === "newest") {
    result = source.getNewest ? await source.getNewest(page) : [];
  } else {
    result = await source.getPopular(page);
  }
  return result;
});

app.get<{ Params: { id: string; seriesId: string } }>(
  "/sources/:id/series/:seriesId",
  async (req) => {
    const source = requireSource(req.params.id);
    return source.getSeries(req.params.seriesId);
  },
);

app.get<{ Params: { id: string; seriesId: string; chapterId: string } }>(
  "/sources/:id/series/:seriesId/chapters/:chapterId/pages",
  async (req) => {
    const source = requireSource(req.params.id);
    return source.getPages(req.params.seriesId, req.params.chapterId);
  },
);

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
