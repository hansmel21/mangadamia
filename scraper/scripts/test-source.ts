// Smoke test for a source adapter against the LIVE site.
// Usage: npm run test:source <sourceId> [search query]
//   e.g. npm run test:source mangadex "solo leveling"
// Walks the full pipeline: popular -> search -> series detail -> chapter pages.

import { getSource, sources } from "../src/sources/index.js";

const [sourceId, query = "solo leveling"] = process.argv.slice(2);
const source = sourceId ? getSource(sourceId) : undefined;
if (!source) {
  console.error(`Usage: npm run test:source <sourceId> [query]`);
  console.error(`Available sources: ${sources.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

console.log(`── Testing source "${source.id}" ──`);

console.log(`\n[1/4] getPopular(1)`);
const popular = await source.getPopular(1);
assert(popular.length > 0, "popular list is empty");
assert(popular[0].sourceSeriesId && popular[0].title, "popular item missing id/title");
console.log(`  ✓ ${popular.length} series, first: "${popular[0].title}" (${popular[0].sourceSeriesId})`);

console.log(`\n[2/4] search("${query}", 1)`);
const results = await source.search(query, 1);
assert(results.length > 0, `no search results for "${query}"`);
console.log(`  ✓ ${results.length} results, first: "${results[0].title}"`);

console.log(`\n[3/4] getSeries("${results[0].sourceSeriesId}")`);
const series = await source.getSeries(results[0].sourceSeriesId);
assert(series.title, "series has no title");
assert(series.chapters.length > 0, "series has no chapters");
console.log(
  `  ✓ "${series.title}" — status=${series.status}, ${series.chapters.length} chapters, ` +
    `tags=[${series.tags.slice(0, 4).join(", ")}]`,
);

const chapter = series.chapters[0];
console.log(`\n[4/4] getPages(ch. ${chapter.number} — ${chapter.sourceChapterId})`);
const pages = await source.getPages(series.sourceSeriesId, chapter.sourceChapterId);
assert(pages.length > 0, "chapter has no pages");
assert(pages.every((p) => p.imageUrl.startsWith("http")), "page has invalid image URL");
console.log(`  ✓ ${pages.length} pages, first image: ${pages[0].imageUrl.slice(0, 90)}`);
if (pages[0].headers) console.log(`    required headers: ${JSON.stringify(pages[0].headers)}`);

console.log(`\n✅ Source "${source.id}" passed all checks.`);
