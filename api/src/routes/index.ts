import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPagesCached, getSeriesCached, type SeriesWithChapters } from "../catalog.js";
import { getSource, sources } from "../sources/index.js";
import type { Source } from "../sources/types.js";
import { getUser } from "../auth.js";
import { prisma } from "../db/client.js";
import { rankSources } from "../health.js";
import { discoverMissingSources, unifiedList } from "../unified.js";
import { registerSocialRoutes } from "./social.js";
import { registerAdminRoutes } from "./admin.js";
import { registerLegalRoutes } from "./legal.js";
import { registerGuildRoutes } from "./guilds.js";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
const searchQuery = listQuery.extend({
  q: z.string().min(1),
});

function requireSource(id: string): Source {
  const source = getSource(id);
  if (!source) throw Object.assign(new Error(`Unknown source: ${id}`), { statusCode: 404 });
  return source;
}

// Popular/search lists aren't cached in Postgres (only series and pages are),
// so this avoids unnecessary repeated API traffic on tab switches.
const listCache = new Map<string, { at: number; data: unknown }>();
const LIST_CACHE_TTL_MS = 10 * 60 * 1000;

async function cachedList<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < LIST_CACHE_TTL_MS) return hit.data as T;
  if (hit) {
    // Stale-while-revalidate: serve the old list instantly, refresh behind it
    void fn()
      .then((data) => listCache.set(key, { at: Date.now(), data }))
      .catch(() => {});
    return hit.data as T;
  }
  const data = await fn();
  if (listCache.size > 500) {
    const oldest = listCache.keys().next().value;
    if (oldest) listCache.delete(oldest);
  }
  listCache.set(key, { at: Date.now(), data });
  return data;
}

function serializeSeries(s: SeriesWithChapters) {
  return {
    source: s.source,
    sourceSeriesId: s.sourceSeriesId,
    canonicalId: s.canonicalId,
    title: s.title,
    altTitles: s.altTitles,
    coverUrl: s.coverUrl,
    description: s.description,
    status: s.status,
    tags: s.tags,
    chapters: s.chapters.map((c) => ({
      sourceChapterId: c.sourceChapterId,
      number: c.number,
      title: c.title,
      publishedAt: c.publishedAt,
    })),
  };
}

export function registerRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({ ok: true }));

  registerSocialRoutes(app);
  registerAdminRoutes(app);
  registerLegalRoutes(app);
  registerGuildRoutes(app);

  app.get("/sources", async () =>
    sources.map((s) => ({ id: s.id, name: s.name, languages: s.languages })),
  );

  // After a cold popular fetch, pre-warm the top series in the background so
  // tapping them shows info instantly. Staggered so these never queue ahead
  // of an interactive request on the source's polite per-host throttle.
  const warmSeries = (source: Source, ids: string[]) => {
    ids.forEach((id, i) => {
      setTimeout(() => void getSeriesCached(source, id).catch(() => {}), 2000 + i * 2500);
    });
  };

  app.get<{ Params: { src: string } }>("/sources/:src/popular", async (req) => {
    const { page } = listQuery.parse(req.query);
    const source = requireSource(req.params.src);
    return cachedList(`popular:${source.id}:${page}`, async () => {
      const list = await source.getPopular(page);
      if (page === 1) warmSeries(source, list.slice(0, 8).map((s) => s.sourceSeriesId));
      return list;
    });
  });

  // Unified catalog: one merged, deduplicated feed across all sources. Each
  // card carries its source candidates ("servers") in health order.
  app.get("/browse", async (req) => {
    const { page } = listQuery.parse(req.query);
    return cachedList(`browse:all:${page}`, async () => {
      const cards = await unifiedList("popular", page);
      // Warm the top of each source's list — also builds the alt-title glue
      // that improves merging on the next browse.
      if (page === 1) {
        for (const source of sources) {
          const ids = cards
            .flatMap((c) => c.sources.filter((s) => s.src === source.id))
            .slice(0, 4)
            .map((s) => s.sourceSeriesId);
          warmSeries(source, ids);
        }
        discoverMissingSources(cards, 12);
      }
      return cards;
    });
  });

  app.get("/search", async (req) => {
    const { q, page, status } = searchQuery
      .extend({ status: z.enum(["ongoing", "completed"]).optional() })
      .parse(req.query);
    return cachedList(`search:all:${q.toLowerCase()}:${status ?? "any"}:${page}`, async () => {
      const cards = await unifiedList("search", page, q, status);
      discoverMissingSources(cards, 4);
      return cards;
    });
  });

  // Home feed rails
  app.get("/browse/latest", async (req) => {
    const { page } = listQuery.parse(req.query);
    return cachedList(`latest:all:${page}`, () => unifiedList("latest", page));
  });

  app.get("/browse/new", async (req) => {
    const { page } = listQuery.parse(req.query);
    return cachedList(`newest:all:${page}`, () => unifiedList("newest", page));
  });

  // Most-read series ON THIS APP (from signed-in reading activity).
  app.get("/ranks", async () => {
    return cachedList("ranks:all", async () => {
      const grouped = await prisma.readChapter.groupBy({
        by: ["canonicalId"],
        _count: { canonicalId: true },
        orderBy: { _count: { canonicalId: "desc" } },
        take: 20,
      });
      if (grouped.length === 0) return [];
      const canonicalIds = grouped.map((g) => g.canonicalId);
      const seriesRows = await prisma.series.findMany({
        where: { canonicalId: { in: canonicalIds }, chapters: { some: {} } },
        select: {
          source: true,
          sourceSeriesId: true,
          canonicalId: true,
          canonical: { select: { title: true, coverUrl: true } },
        },
      });
      const ranked = rankSources([...new Set(seriesRows.map((r) => r.source))]);
      return grouped
        .map((g, i) => {
          const rows = seriesRows
            .filter((r) => r.canonicalId === g.canonicalId)
            .sort((a, b) => ranked.indexOf(a.source) - ranked.indexOf(b.source));
          if (rows.length === 0) return null;
          return {
            rank: i + 1,
            canonicalId: g.canonicalId,
            title: rows[0].canonical?.title ?? "",
            coverUrl: rows[0].canonical?.coverUrl,
            readCount: g._count.canonicalId,
            sources: rows.map((r) => ({ src: r.source, sourceSeriesId: r.sourceSeriesId })),
          };
        })
        .filter((r) => r !== null);
    });
  });

  // Simple v1 recommendations: series sharing tags with the user's cloud
  // library, excluding what they already follow.
  app.get("/recommended", async (req) => {
    const user = await getUser(req);
    if (!user) return [];
    return cachedList(`rec:${user.id}`, async () => {
      const library = await prisma.libraryEntry.findMany({
        where: { userId: user.id },
        select: { canonicalId: true },
      });
      if (library.length === 0) return [];
      const libIds = library.map((l) => l.canonicalId);
      const libSeries = await prisma.series.findMany({
        where: { canonicalId: { in: libIds } },
        select: { tags: true },
      });
      const tags = [...new Set(libSeries.flatMap((s) => s.tags))].slice(0, 40);
      if (tags.length === 0) return [];
      const candidates = await prisma.series.findMany({
        where: {
          tags: { hasSome: tags },
          canonicalId: { notIn: libIds, not: null },
          chapters: { some: {} },
        },
        select: {
          source: true,
          sourceSeriesId: true,
          canonicalId: true,
          tags: true,
          canonical: { select: { title: true, coverUrl: true } },
        },
        take: 80,
      });
      const tagSet = new Set(tags);
      const byCanonical = new Map<
        string,
        { score: number; title: string; coverUrl?: string | null; sources: { src: string; sourceSeriesId: string }[] }
      >();
      for (const c of candidates) {
        if (!c.canonicalId) continue;
        const overlap = c.tags.filter((t) => tagSet.has(t)).length;
        const entry = byCanonical.get(c.canonicalId) ?? {
          score: 0,
          title: c.canonical?.title ?? "",
          coverUrl: c.canonical?.coverUrl,
          sources: [],
        };
        entry.score = Math.max(entry.score, overlap);
        if (!entry.sources.some((s) => s.src === c.source)) {
          entry.sources.push({ src: c.source, sourceSeriesId: c.sourceSeriesId });
        }
        byCanonical.set(c.canonicalId, entry);
      }
      const ranked = rankSources(sources.map((s) => s.id));
      return [...byCanonical.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 16)
        .map(([canonicalId, e]) => ({
          canonicalId,
          title: e.title,
          coverUrl: e.coverUrl,
          sources: e.sources.sort(
            (a, b) => ranked.indexOf(a.src) - ranked.indexOf(b.src),
          ),
        }));
    });
  });

  // Every source known to carry this canonical series (with chapters),
  // health-ordered — the series screen unions this into its server chips.
  app.get<{ Params: { id: string } }>("/canonical/:id/sources", async (req) => {
    const rows = await prisma.series.findMany({
      where: { canonicalId: req.params.id, chapters: { some: {} } },
      select: {
        source: true,
        sourceSeriesId: true,
        _count: { select: { chapters: true } },
      },
    });
    const ranked = rankSources(rows.map((r) => r.source));
    return rows
      .map((r) => ({
        src: r.source,
        sourceSeriesId: r.sourceSeriesId,
        chapterCount: r._count.chapters,
      }))
      .sort((a, b) => ranked.indexOf(a.src) - ranked.indexOf(b.src));
  });

  app.get<{ Params: { src: string } }>("/sources/:src/search", async (req) => {
    const { q, page } = searchQuery.parse(req.query);
    const source = requireSource(req.params.src);
    return cachedList(`search:${source.id}:${q.toLowerCase()}:${page}`, () =>
      source.search(q, page),
    );
  });

  app.get<{ Params: { src: string; id: string } }>("/series/:src/:id", async (req) => {
    const source = requireSource(req.params.src);
    return serializeSeries(await getSeriesCached(source, req.params.id));
  });

  app.get<{ Params: { src: string; seriesId: string; chapterId: string } }>(
    "/chapters/:src/:seriesId/:chapterId/pages",
    async (req) => {
      const source = requireSource(req.params.src);
      return getPagesCached(source, req.params.seriesId, req.params.chapterId);
    },
  );
}
