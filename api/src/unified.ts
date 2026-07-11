// Unified catalog: fan a browse/search out to every source in parallel and
// merge the results into one deduplicated card list. Two entries merge when
// any of their normalized titles/alt-titles match — alt-titles come from our
// own Series cache, so merging gets smarter as series get visited/warmed
// (that's what links MangaDex's "Na Honjaman Level-Up" to "Solo Leveling").

import { getSeriesCached } from "./catalog.js";
import { prisma } from "./db/client.js";
import { rankSources, tracked } from "./health.js";
import { normalizeTitle } from "./match.js";
import { sources } from "./sources/index.js";
import type { SeriesSummary, Source, StatusFilter } from "./sources/types.js";

export interface UnifiedCard {
  title: string;
  coverUrl?: string;
  canonicalId?: string;
  // Enrichment from our own cache (present once a series has been visited)
  description?: string | null;
  tags?: string[];
  status?: string | null;
  // Health-ordered: first entry is the source the app should try first
  sources: { src: string; sourceSeriesId: string }[];
}


export type ListKind = "popular" | "search" | "latest" | "newest";

function listCall(
  source: Source,
  kind: ListKind,
  page: number,
  query?: string,
  status?: StatusFilter,
): (() => Promise<SeriesSummary[]>) | null {
  switch (kind) {
    case "search":
      return query !== undefined ? () => source.search(query, page, status) : null;
    case "latest":
      return source.getLatest ? () => source.getLatest!(page) : null;
    case "newest":
      return source.getNewest ? () => source.getNewest!(page) : null;
    default:
      return () => source.getPopular(page);
  }
}

export async function unifiedList(
  kind: ListKind,
  page: number,
  query?: string,
  status?: StatusFilter,
): Promise<UnifiedCard[]> {
  const ranked = rankSources(sources.map((s) => s.id));
  const rankIndex = new Map(ranked.map((id, i) => [id, i]));
  const bySrc = new Map(sources.map((s) => [s.id, s]));

  const settled = await Promise.allSettled(
    ranked
      .map((id) => {
        const source = bySrc.get(id);
        if (!source) return null;
        const call = listCall(source, kind, page, query, status);
        if (!call) return null; // source sits out feeds it doesn't support
        return tracked(id, call).then((list) => ({ src: id, list }));
      })
      .filter((p): p is Promise<{ src: string; list: SeriesSummary[] }> => p !== null),
  );
  // A failing source silently drops out of the merged list
  const lists = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ src: string; list: SeriesSummary[] }> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);

  // Alt-title glue from our own cache, for exactly the series on screen
  const pairs = lists.flatMap(({ src, list }) =>
    list.map((s) => ({ source: src, sourceSeriesId: s.sourceSeriesId })),
  );
  const cachedRows = pairs.length
    ? await prisma.series.findMany({
        where: { OR: pairs },
        select: {
          source: true,
          sourceSeriesId: true,
          title: true,
          altTitles: true,
          description: true,
          tags: true,
          status: true,
          canonicalId: true,
          canonical: { select: { title: true } },
          _count: { select: { chapters: true } },
          fetchedAt: true,
        },
      })
    : [];
  const cachedMap = new Map(cachedRows.map((r) => [`${r.source}:${r.sourceSeriesId}`, r]));

  // Zip the ranked lists together position by position, merging as we go,
  // so the merged feed interleaves every source's ranking. Cards sharing a
  // canonical id always merge; otherwise any shared normalized title does it.
  const cards: UnifiedCard[] = [];
  const byKey = new Map<string, UnifiedCard>();
  const maxLen = Math.max(0, ...lists.map((l) => l.list.length));
  for (let i = 0; i < maxLen; i++) {
    for (const { src, list } of lists) {
      const item = list[i];
      if (!item) continue;
      const cached = cachedMap.get(`${src}:${item.sourceSeriesId}`);
      const keys: string[] = [];
      if (cached?.canonicalId) keys.push(`c:${cached.canonicalId}`);
      keys.push(
        ...[item.title, ...(cached ? [cached.title, ...cached.altTitles] : [])]
          .map(normalizeTitle)
          .filter(Boolean)
          .map((n) => `t:${n}`),
      );
      let card: UnifiedCard | undefined;
      for (const k of keys) {
        card = byKey.get(k);
        if (card) break;
      }
      if (!card) {
        card = { title: item.title, coverUrl: item.coverUrl, sources: [] };
        cards.push(card);
      }
      if (!card.sources.some((s) => s.src === src)) {
        card.sources.push({ src, sourceSeriesId: item.sourceSeriesId });
      }
      card.coverUrl ??= item.coverUrl;
      if (cached) {
        card.description ??= cached.description;
        if (!card.tags?.length && cached.tags.length > 0) card.tags = cached.tags;
        card.status ??= cached.status;
      }
      if (cached?.canonicalId) {
        card.canonicalId = cached.canonicalId;
        // The canonical title is the curated display title (prefers English)
        if (cached.canonical?.title) card.title = cached.canonical.title;
      }
      for (const k of keys) byKey.set(k, card);
    }
  }

  // A canonical link means we KNOW other sources carry this series, even if
  // they didn't list it on this page — attach those servers too (only ones
  // with actual chapters in our cache).
  const canonicalIds = [...new Set(cards.map((c) => c.canonicalId).filter(Boolean))] as string[];
  const linked = canonicalIds.length
    ? await prisma.series.findMany({
        where: { canonicalId: { in: canonicalIds } },
        select: {
          source: true,
          sourceSeriesId: true,
          canonicalId: true,
          _count: { select: { chapters: true } },
          fetchedAt: true,
        },
      })
    : [];
  const byCanonical = new Map<string, typeof linked>();
  for (const row of linked) {
    if (!row.canonicalId) continue;
    const group = byCanonical.get(row.canonicalId) ?? [];
    group.push(row);
    byCanonical.set(row.canonicalId, group);
  }
  for (const card of cards) {
    if (!card.canonicalId) continue;
    for (const row of byCanonical.get(card.canonicalId) ?? []) {
      if (row._count.chapters > 0 && !card.sources.some((s) => s.src === row.source)) {
        card.sources.push({ src: row.source, sourceSeriesId: row.sourceSeriesId });
      }
    }
  }

  // Self-heal: a cached-empty row older than the TTL gets a background
  // re-check so transient API failures do not hide content forever.
  const STALE_MS = 6 * 60 * 60 * 1000;
  const bySrcId = new Map(sources.map((s) => [s.id, s]));
  for (const row of [...cachedRows, ...linked]) {
    if (row._count.chapters === 0 && Date.now() - row.fetchedAt.getTime() > STALE_MS) {
      const source = bySrcId.get(row.source);
      if (source) void getSeriesCached(source, row.sourceSeriesId).catch(() => {});
    }
  }

  // Drop cards with nothing to read: every source is cached and every one of
  // them has zero chapters (licensed/delisted titles). A source we haven't
  // cached yet counts as "unknown", which keeps the card — it disappears
  // only once the cache has confirmed there's nothing anywhere.
  const isKnownEmpty = (src: string, sourceSeriesId: string): boolean => {
    const cached =
      cachedMap.get(`${src}:${sourceSeriesId}`) ??
      linked.find((r) => r.source === src && r.sourceSeriesId === sourceSeriesId);
    return cached !== undefined && cached._count.chapters === 0;
  };
  const readable = cards.filter((card) =>
    card.sources.some((s) => !isKnownEmpty(s.src, s.sourceSeriesId)),
  );

  for (const card of readable) {
    // Also drop known-empty source entries from the card itself.
    card.sources = card.sources.filter((s) => !isKnownEmpty(s.src, s.sourceSeriesId));
    card.sources.sort(
      (a, b) => (rankIndex.get(a.src) ?? 99) - (rankIndex.get(b.src) ?? 99),
    );
  }

  // Warm card sources we've never cached (we know their exact ids) — this is
  // what completes server lists and lets the empty-filter judge them later.
  let warmDelay = 3000;
  for (const card of readable.slice(0, 12)) {
    for (const s of card.sources) {
      const known =
        cachedMap.has(`${s.src}:${s.sourceSeriesId}`) ||
        linked.some((r) => r.source === s.src && r.sourceSeriesId === s.sourceSeriesId);
      if (known) continue;
      const source = bySrcId.get(s.src);
      if (!source) continue;
      const { sourceSeriesId } = s;
      setTimeout(() => void getSeriesCached(source, sourceSeriesId).catch(() => {}), warmDelay);
      warmDelay += 2500;
    }
  }

  return readable;
}

// ── Cross-source discovery ─────────────────────────────────────────────────
// A card missing a source doesn't mean the source lacks the series — it may
// just not appear on the same page of results. Search the missing sources by
// title in the background, verify the hit against the canonical's known
// titles, and cache it — the card gains the server on the next request.

const discoveryAttempts = new Map<string, number>(); // canonicalId:src → ts
const DISCOVERY_RETRY_MS = 6 * 60 * 60 * 1000;

async function tryDiscover(source: Source, canonicalId: string, title: string): Promise<void> {
  const canonical = await prisma.canonicalSeries.findUnique({ where: { id: canonicalId } });
  if (!canonical) return;
  const results = await tracked(source.id, () => source.search(title, 1));
  // Exact normalized-title match only — spin-offs must not attach
  const match = results.find((r) => canonical.normTitles.includes(normalizeTitle(r.title)));
  if (match) await getSeriesCached(source, match.sourceSeriesId);
}

export function discoverMissingSources(cards: UnifiedCard[], limit: number): void {
  let delay = 5000;
  for (const card of cards.slice(0, limit)) {
    if (!card.canonicalId) continue;
    const have = new Set(card.sources.map((s) => s.src));
    for (const source of sources) {
      if (have.has(source.id)) continue;
      const key = `${card.canonicalId}:${source.id}`;
      if (Date.now() - (discoveryAttempts.get(key) ?? 0) < DISCOVERY_RETRY_MS) continue;
      discoveryAttempts.set(key, Date.now());
      const { canonicalId, title } = card;
      setTimeout(() => void tryDiscover(source, canonicalId, title).catch(() => {}), delay);
      delay += 3000; // trickle, so interactive requests always win
    }
  }
}
