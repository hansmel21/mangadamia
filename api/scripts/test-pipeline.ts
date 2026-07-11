// Offline test of the caching pipeline (catalog.ts) using a mock source.
// Proves DB upserts, TTL reuse, and stale-serving work without touching
// any real site. Usage: tsx --env-file-if-exists=.env scripts/test-pipeline.ts

import { getPagesCached, getSeriesCached } from "../src/catalog.js";
import { prisma } from "../src/db/client.js";
import type { Source } from "../src/sources/types.js";

let seriesFetches = 0;
let pageFetches = 0;
let failNext = false;

const mock: Source = {
  id: "mock",
  name: "Mock",
  languages: ["en"],
  search: async () => [],
  getPopular: async () => [],
  async getSeries(id) {
    if (failNext) throw new Error("simulated source outage");
    seriesFetches++;
    return {
      sourceSeriesId: id,
      title: "Mock Series",
      altTitles: ["Alt"],
      coverUrl: "https://example.com/cover.jpg",
      description: "desc",
      status: "ongoing",
      tags: ["Action"],
      chapters: [
        { sourceChapterId: "ch1", number: 1, title: "One" },
        { sourceChapterId: "ch2", number: 2, title: "Two" },
      ],
    };
  },
  async getPages() {
    pageFetches++;
    return [
      { index: 0, imageUrl: "https://example.com/1.jpg" },
      { index: 1, imageUrl: "https://example.com/2.jpg" },
    ];
  },
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

await prisma.series.deleteMany({ where: { source: "mock" } });

// 1. First fetch hits the source and caches
const s1 = await getSeriesCached(mock, "abc");
assert(seriesFetches === 1, "expected 1 source fetch");
assert(s1.chapters.length === 2, "expected 2 chapters cached");
console.log("✓ first getSeries fetched from source and cached");

// 2. Second fetch inside TTL is served from cache
await getSeriesCached(mock, "abc");
assert(seriesFetches === 1, "cache was not used within TTL");
console.log("✓ second getSeries served from cache (no source fetch)");

// 3. Pages: fetch once, then cached
const p1 = await getPagesCached(mock, "abc", "ch1");
assert(p1.length === 2 && pageFetches === 1, "pages not fetched correctly");
const p2 = await getPagesCached(mock, "abc", "ch1");
assert(pageFetches === 1, "page cache was not used within TTL");
console.log("✓ getPages cached");

// 4. Source outage after cache expiry serves stale data instead of erroring
await prisma.series.updateMany({
  where: { source: "mock" },
  data: { fetchedAt: new Date(0) }, // force TTL expiry
});
failNext = true;
const stale = await getSeriesCached(mock, "abc");
assert(stale.title === "Mock Series", "stale data not served during outage");
console.log("✓ source outage after TTL expiry falls back to stale cache");

await prisma.series.deleteMany({ where: { source: "mock" } });
await prisma.$disconnect();
console.log("\n✅ Caching pipeline works.");
