// Asura Scans (asurascans.com) — scraped source, big for manhwa.
// The site is an Astro app: listing/series/chapter data is server-rendered
// into HTML-entity-encoded JSON blobs where every scalar is wrapped in a
// [0, value] tuple (e.g. "title":[0,"Nano Machine"]). We decode the entities
// and regex-extract what we need instead of parsing the whole blob.
//
// ⚠️ Known quirks of this site:
//  1. Series URLs end in a rotating hash (/comics/nano-machine-a80d257e).
//     Bare /comics/<slug> 302-redirects to the current hash, so we store the
//     bare slug and let fetch follow the redirect.
//  2. It sits behind Cloudflare. If requests start failing with 403, the
//     server's IP is being challenged — see README ("When Cloudflare blocks").
//
// If this adapter breaks: npm run test:source asura

import * as cheerio from "cheerio";
import { fetchHtml } from "./http.js";
import type { ChapterInfo, PageInfo, SeriesDetail, SeriesSummary, Source } from "./types.js";

const BASE = "https://asurascans.com";

// Undo the HTML-entity encoding of the embedded JSON blobs.
function decodeEntities(html: string): string {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

// Strip the rotating URL hash ("nano-machine-a80d257e" → "nano-machine").
// Require a digit so title words that happen to be hex ("facade") survive.
function stripHash(slug: string): string {
  return slug.replace(/-(?=[0-9a-f]*\d)[0-9a-f]{6,10}$/, "");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseSeriesList(html: string): SeriesSummary[] {
  const $ = cheerio.load(html);
  const out: SeriesSummary[] = [];
  const seen = new Set<string>();
  // Each card has two links: the cover (title in img alt, text is the rating
  // number) and the title link (title in its text).
  $("a[href^='/comics/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/^\/comics\/([^/?#]+)$/);
    if (!match) return;
    const slug = stripHash(match[1]);
    if (seen.has(slug)) return;
    const text = $(el).text().trim();
    const title =
      $(el).find("img").attr("alt")?.trim() ||
      (/^[\d.]+$/.test(text) ? "" : text);
    if (!title) return;
    seen.add(slug);
    out.push({
      sourceSeriesId: slug,
      title,
      coverUrl: $(el).find("img").attr("src") || undefined,
    });
  });
  return out;
}

const STATUS_MAP: Record<string, SeriesDetail["status"]> = {
  ongoing: "ongoing",
  completed: "completed",
  hiatus: "hiatus",
  "season end": "hiatus",
  dropped: "cancelled",
};

function parseChapters(text: string): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const seen = new Set<string>();
  // Chapter records are flat objects in the embedded blob:
  // {"id":[0,259906],"series_id":[0,2017],"number":[0,320],"title":[0,"..."],
  //  "slug":[0,"chapter-320"],...,"published_at":[0,"..."],...,"is_locked":[0,false],...}
  // Chapter URLs use the number (/chapter/320), not the slug — slugs are
  // UUIDs on some series — so the number is our chapter id.
  for (const m of text.matchAll(
    /\{"id":\[0,\d+\],"series_id":\[0,\d+\],"number":\[0,[\d.]+\][^{}]*\}/g,
  )) {
    const obj = m[0];
    const id = obj.match(/"number":\[0,([\d.]+)\]/)?.[1];
    if (!id || seen.has(id)) continue;
    // Premium/locked chapters aren't readable without an account — skip them.
    if (obj.includes('"is_premium":[0,true]') || obj.includes('"is_locked":[0,true]')) continue;
    seen.add(id);
    const title = obj.match(/"title":\[0,"((?:[^"\\]|\\.)*)"\]/)?.[1];
    const published = obj.match(/"published_at":\[0,"([^"]+)"\]/)?.[1];
    chapters.push({
      sourceChapterId: id,
      number: Number.parseFloat(id) || 0,
      title: title ? decodeEntities(title).replaceAll('\\"', '"') : undefined,
      publishedAt: published ? new Date(published) : undefined,
    });
  }
  chapters.sort((a, b) => a.number - b.number);
  return chapters;
}

export const asura: Source = {
  id: "asura",
  name: "Asura Scans",
  languages: ["en"],

  async search(query, page, status) {
    const html = await fetchHtml(
      `${BASE}/browse?page=${page}&q=${encodeURIComponent(query)}` +
        (status ? `&status=${status}` : ""),
    );
    return parseSeriesList(html);
  },

  async getPopular(page) {
    const html = await fetchHtml(`${BASE}/browse?page=${page}&sort=popular`);
    return parseSeriesList(html);
  },

  // The default browse order is latest-updated (verified against the site)
  async getLatest(page) {
    const html = await fetchHtml(`${BASE}/browse?page=${page}`);
    return parseSeriesList(html);
  },

  async getSeries(slug): Promise<SeriesDetail> {
    const html = await fetchHtml(`${BASE}/comics/${slug}`);
    const $ = cheerio.load(html);
    const text = decodeEntities(html);

    const title =
      $("meta[property='og:title']").attr("content")?.replace(/ \| Asura Scans$/i, "").trim() ||
      $("h1").first().text().trim();
    const cover = $("meta[property='og:image']").attr("content");

    // The embedded description is full HTML; og:description may be truncated.
    const descMatch = text.match(/"description":\[0,"((?:[^"\\]|\\.)*)"\]/);
    const description = descMatch
      ? stripTags(descMatch[1].replaceAll('\\"', '"'))
      : $("meta[property='og:description']").attr("content");

    const statusRaw = text.match(/"status":\[0,"([^"]+)"\]/)?.[1]?.toLowerCase() ?? "";
    const genresBlob = text.slice(text.indexOf('"genres":'), text.indexOf('"genres":') + 1500);
    const tags = [...genresBlob.matchAll(/"name":\[0,"([^"]+)"\]/g)].map((m) => m[1]);

    return {
      sourceSeriesId: slug,
      title,
      coverUrl: cover ?? undefined,
      altTitles: [],
      description: description || undefined,
      status: STATUS_MAP[statusRaw] ?? "unknown",
      tags: [...new Set(tags)],
      chapters: parseChapters(text),
    };
  },

  async getPages(slug, chapterId): Promise<PageInfo[]> {
    const html = await fetchHtml(`${BASE}/comics/${slug}/chapter/${chapterId}`);
    const text = decodeEntities(html);

    // Page list: "pages":[1,[[0,{"url":[0,"https://cdn..."],"width":[0,800],...}],...]]
    const start = text.indexOf('"pages":[1,[');
    if (start === -1) return [];
    const end = text.indexOf("]]]", start);
    const blob = text.slice(start, end === -1 ? undefined : end + 3);

    return [...blob.matchAll(/"url":\[0,"(https?:[^"]+)"\]/g)].map((m, index) => ({
      index,
      imageUrl: m[1],
      headers: { Referer: `${BASE}/` },
    }));
  },
};
