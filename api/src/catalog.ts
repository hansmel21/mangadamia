// The caching layer between the REST routes and the source adapters.
// Strategy: fetch from the source on demand, upsert into Postgres, and
// serve the cached copy until its TTL expires. The DB is a cache of the
// sources — losing it costs nothing but re-fetches.

import type { Chapter, Prisma, Series } from "@prisma/client";
import { prisma } from "./db/client.js";
import { tracked } from "./health.js";
import { normalizeTitle } from "./match.js";
import type { PageInfo, SeriesDetail, Source } from "./sources/types.js";

const SERIES_TTL_MS = 6 * 60 * 60 * 1000; // series details + chapter list: 6h
const PAGES_TTL_MS = 24 * 60 * 60 * 1000; // page image URLs: 24h

export type SeriesWithChapters = Series & { chapters: Chapter[] };

export async function getSeriesCached(
  source: Source,
  sourceSeriesId: string,
): Promise<SeriesWithChapters> {
  const cached = await prisma.series.findUnique({
    where: { source_sourceSeriesId: { source: source.id, sourceSeriesId } },
    include: { chapters: { orderBy: { number: "asc" } } },
  });
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < SERIES_TTL_MS;
  if (cached && fresh) return cached;

  if (cached) {
    // Stale-while-revalidate: serve the cached copy instantly and refresh it
    // in the background.
    void refreshSeries(source, sourceSeriesId).catch(() => {});
    return cached;
  }

  try {
    return await refreshSeries(source, sourceSeriesId);
  } catch (err) {
    // The API is down — serve stale data if we have any.
    if (cached) return cached;
    throw err;
  }
}

// Dedupe concurrent refreshes of the same series (e.g. SWR fires while a
// background warm-up for the same series is already in flight).
const inFlightRefreshes = new Map<string, Promise<SeriesWithChapters>>();

function refreshSeries(source: Source, sourceSeriesId: string): Promise<SeriesWithChapters> {
  const key = `${source.id}:${sourceSeriesId}`;
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;
  const promise = fetchAndStoreSeries(source, sourceSeriesId).finally(() =>
    inFlightRefreshes.delete(key),
  );
  inFlightRefreshes.set(key, promise);
  return promise;
}

const isMostlyAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

// Attach a source series to its canonical identity (creating one if this is
// the first source we've seen carry it). Canonicals are matched on the union
// of every normalized title/alt-title we've encountered.
async function linkCanonical(seriesRowId: string, detail: SeriesDetail): Promise<void> {
  const norms = [
    ...new Set([detail.title, ...detail.altTitles].map(normalizeTitle).filter(Boolean)),
  ];
  if (norms.length === 0) return;
  const existing = await prisma.canonicalSeries.findFirst({
    where: { normTitles: { hasSome: norms } },
  });
  let canonicalId: string;
  if (!existing) {
    canonicalId = (
      await prisma.canonicalSeries.create({
        data: { title: detail.title, coverUrl: detail.coverUrl, normTitles: norms },
      })
    ).id;
  } else {
    canonicalId = existing.id;
    // Prefer a readable (ASCII) display title over a romanization
    const title =
      !isMostlyAscii(existing.title) && isMostlyAscii(detail.title)
        ? detail.title
        : existing.title;
    await prisma.canonicalSeries.update({
      where: { id: existing.id },
      data: {
        title,
        coverUrl: existing.coverUrl ?? detail.coverUrl,
        normTitles: [...new Set([...existing.normTitles, ...norms])],
      },
    });
  }
  await prisma.series.update({ where: { id: seriesRowId }, data: { canonicalId } });
}

async function fetchAndStoreSeries(
  source: Source,
  sourceSeriesId: string,
): Promise<SeriesWithChapters> {
  const detail = await tracked(source.id, () => source.getSeries(sourceSeriesId));

  const data = {
    title: detail.title,
    altTitles: detail.altTitles,
    coverUrl: detail.coverUrl,
    description: detail.description,
    status: detail.status,
    tags: detail.tags,
    fetchedAt: new Date(),
  };
  const series = await prisma.series.upsert({
    where: { source_sourceSeriesId: { source: source.id, sourceSeriesId } },
    create: { source: source.id, sourceSeriesId, ...data },
    update: data,
  });
  await linkCanonical(series.id, detail);

  // Sync chapters in bulk: one read + one createMany, plus updates only for
  // rows that actually changed. Per-chapter upserts were ~300 sequential DB
  // round-trips for long series and dominated response time on cache misses.
  const existing = await prisma.chapter.findMany({
    where: { seriesId: series.id },
    select: { sourceChapterId: true, number: true, title: true, publishedAt: true },
  });
  const byId = new Map(existing.map((c) => [c.sourceChapterId, c]));
  const toCreate: Prisma.ChapterCreateManyInput[] = [];
  const toUpdate: typeof detail.chapters = [];
  for (const ch of detail.chapters) {
    const prev = byId.get(ch.sourceChapterId);
    if (!prev) {
      toCreate.push({
        seriesId: series.id,
        sourceChapterId: ch.sourceChapterId,
        number: ch.number,
        title: ch.title,
        publishedAt: ch.publishedAt,
      });
    } else if (
      prev.number !== ch.number ||
      (prev.title ?? undefined) !== ch.title ||
      (prev.publishedAt?.getTime() ?? -1) !== (ch.publishedAt?.getTime() ?? -1)
    ) {
      toUpdate.push(ch);
    }
  }
  if (toCreate.length > 0) {
    await prisma.chapter.createMany({ data: toCreate, skipDuplicates: true });
  }
  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((ch) =>
        prisma.chapter.update({
          where: {
            seriesId_sourceChapterId: { seriesId: series.id, sourceChapterId: ch.sourceChapterId },
          },
          data: { number: ch.number, title: ch.title, publishedAt: ch.publishedAt },
        }),
      ),
    );
  }

  return (await prisma.series.findUniqueOrThrow({
    where: { id: series.id },
    include: { chapters: { orderBy: { number: "asc" } } },
  }));
}

export async function getPagesCached(
  source: Source,
  sourceSeriesId: string,
  sourceChapterId: string,
): Promise<PageInfo[]> {
  const series = await getSeriesCached(source, sourceSeriesId);
  const chapter = series.chapters.find((c) => c.sourceChapterId === sourceChapterId);
  if (!chapter) throw Object.assign(new Error("Chapter not found"), { statusCode: 404 });

  if (chapter.pagesFetchedAt && Date.now() - chapter.pagesFetchedAt.getTime() < PAGES_TTL_MS) {
    const pages = await prisma.page.findMany({
      where: { chapterId: chapter.id },
      orderBy: { index: "asc" },
    });
    if (pages.length > 0) {
      return pages.map((p) => ({
        index: p.index,
        imageUrl: p.imageUrl,
      }));
    }
  }

  const pages = await tracked(source.id, () => source.getPages(sourceSeriesId, sourceChapterId));
  await prisma.$transaction([
    prisma.page.deleteMany({ where: { chapterId: chapter.id } }),
    prisma.page.createMany({
      data: pages.map((p) => ({
        chapterId: chapter.id,
        index: p.index,
        imageUrl: p.imageUrl,
      })),
    }),
    prisma.chapter.update({
      where: { id: chapter.id },
      data: { pagesFetchedAt: new Date() },
    }),
  ]);
  return pages;
}
