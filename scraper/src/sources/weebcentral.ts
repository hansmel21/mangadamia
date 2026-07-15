// Weeb Central (weebcentral.com) — scraped source.
// The site is built with HTMX, which is good news for us: the same partial
// HTML endpoints the site's own frontend calls are easy to fetch and parse.
//
// ⚠️ Scraper adapters break when the site changes its markup. If this stops
// working, run `npm run test:source weebcentral`, look at the failure, and
// adjust the selectors below.

import * as cheerio from "cheerio";
import { fetchHtml } from "./http.js";
import type { ChapterInfo, PageInfo, SeriesDetail, SeriesSummary, Source } from "./types.js";

const BASE = "https://weebcentral.com";

function parseSeriesList(html: string): SeriesSummary[] {
  const $ = cheerio.load(html);
  const out: SeriesSummary[] = [];
  const seen = new Set<string>();
  $("a[href*='/series/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/\/series\/([^/]+)/);
    if (!match || seen.has(match[1])) return;
    // Cover links carry the title in the img alt ("X cover"); title links in
    // their text. Don't match .font-semibold — the "Official" ribbon uses it.
    const title =
      $(el).find("img").attr("alt")?.replace(/ cover$/i, "").trim() ||
      $(el).find(".text-ellipsis, .line-clamp-1").first().text().trim() ||
      $(el).text().trim();
    const cover = $(el).find("img").attr("src");
    if (!title) return;
    seen.add(match[1]);
    out.push({ sourceSeriesId: match[1], title, coverUrl: cover ?? undefined });
  });
  return out;
}

async function fetchChapterList(seriesId: string): Promise<ChapterInfo[]> {
  const html = await fetchHtml(`${BASE}/series/${seriesId}/full-chapter-list`);
  const $ = cheerio.load(html);
  const chapters: ChapterInfo[] = [];
  $("a[href*='/chapters/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const idMatch = href.match(/\/chapters\/([^/?#]+)/);
    if (!idMatch) return;
    // Links contain inline SVGs (with <style> text) and "Last Read"/"New"
    // badges — strip those so only the chapter name is left.
    $(el).find("svg, style, .link-info").remove();
    const label =
      $(el).find("span span").first().text().trim() ||
      $(el).text().replace(/\s+/g, " ").trim();
    const numMatch = label.match(/(\d+(?:\.\d+)?)/);
    const datetime = $(el).find("time").attr("datetime");
    chapters.push({
      sourceChapterId: idMatch[1],
      number: numMatch ? Number.parseFloat(numMatch[1]) : 0,
      title: label || undefined,
      publishedAt: datetime ? new Date(datetime) : undefined,
    });
  });
  // The endpoint returns newest first; our convention is ascending
  chapters.reverse();
  return chapters;
}

const searchParams = (extra: string, page: number) =>
  `${BASE}/search/data?${extra}&official=Any&anime=Any&adult=Any` +
  `&display_mode=Full+Display&page=${page}`;

export const weebcentral: Source = {
  id: "weebcentral",
  name: "Weeb Central",
  languages: ["en"],

  async search(query, page, status) {
    // Their status values are "Ongoing" / "Complete" (not "Completed")
    const statusParam = status
      ? `&included_status=${status === "completed" ? "Complete" : "Ongoing"}`
      : "";
    const html = await fetchHtml(
      searchParams(
        `text=${encodeURIComponent(query)}&sort=Best+Match&order=Ascending${statusParam}`,
        page,
      ),
    );
    return parseSeriesList(html);
  },

  async getPopular(page) {
    const html = await fetchHtml(searchParams("sort=Popularity&order=Descending", page));
    return parseSeriesList(html);
  },

  async getLatest(page) {
    const html = await fetchHtml(searchParams("sort=Latest+Updates&order=Descending", page));
    return parseSeriesList(html);
  },

  async getNewest(page) {
    const html = await fetchHtml(searchParams("sort=Recently+Added&order=Descending", page));
    return parseSeriesList(html);
  },

  async getSeries(seriesId): Promise<SeriesDetail> {
    const [html, chapters] = await Promise.all([
      fetchHtml(`${BASE}/series/${seriesId}`),
      fetchChapterList(seriesId),
    ]);
    const $ = cheerio.load(html);

    const title = $("h1").first().text().trim();
    const cover = $("meta[property='og:image']").attr("content") ?? $("main img").first().attr("src");
    const description =
      $("li:contains('Description') p, .description, p.whitespace-pre-wrap").first().text().trim() ||
      $("meta[property='og:description']").attr("content");

    const statusText = $("li:contains('Status')").first().text().toLowerCase();
    const status = statusText.includes("complete")
      ? "completed"
      : statusText.includes("hiatus")
        ? "hiatus"
        : statusText.includes("cancel")
          ? "cancelled"
          : statusText.includes("ongoing")
            ? "ongoing"
            : "unknown";

    const tags = $("li:contains('Tags') a, li:contains('Genre') a")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    return {
      sourceSeriesId: seriesId,
      title,
      coverUrl: cover ?? undefined,
      altTitles: [],
      description: description || undefined,
      status,
      tags,
      chapters,
    };
  },

  async getPages(_seriesId, chapterId): Promise<PageInfo[]> {
    const html = await fetchHtml(
      `${BASE}/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`,
    );
    const $ = cheerio.load(html);
    return $("img")
      .map((index, el) => ({
        index,
        imageUrl: $(el).attr("src") ?? "",
        // Their image CDN rejects requests without the site's own Referer
        headers: { Referer: `${BASE}/` },
      }))
      .get()
      .filter((p) => p.imageUrl.startsWith("http"));
  },
};
