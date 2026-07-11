// MangaDex API adapter. This is the only remote catalog provider.
// Docs: https://api.mangadex.org/docs/

import { fetchJson } from "./http.js";
import type { ChapterInfo, PageInfo, SeriesDetail, SeriesSummary, Source } from "./types.js";

const API = "https://api.mangadex.org";
const LANG = "en";

// Identify this documented API integration honestly to MangaDex.
const MD_INIT = { headers: { "user-agent": process.env.APP_USER_AGENT ?? "MangaShelf/1.0" } };

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    description: Record<string, string>;
    status: string;
    tags: { attributes: { name: Record<string, string> } }[];
  };
  relationships: { type: string; attributes?: { fileName?: string } }[];
}

function pickTitle(titles: Record<string, string>): string {
  return titles[LANG] ?? titles.ja ?? Object.values(titles)[0] ?? "Untitled";
}

function coverUrl(manga: MdManga): string | undefined {
  const cover = manga.relationships.find((r) => r.type === "cover_art");
  const file = cover?.attributes?.fileName;
  return file ? `https://uploads.mangadex.org/covers/${manga.id}/${file}.512.jpg` : undefined;
}

function toSummary(manga: MdManga): SeriesSummary {
  return {
    sourceSeriesId: manga.id,
    title: pickTitle(manga.attributes.title),
    coverUrl: coverUrl(manga),
  };
}

// Restrict the catalog to MangaDex's safe rating. Suggestive, erotica, and
// pornographic titles are deliberately excluded from discovery and feeds.
const listParams =
  "limit=24&includes[]=cover_art&contentRating[]=safe" +
  "&hasAvailableChapters=true&availableTranslatedLanguage[]=" +
  LANG;

async function listManga(extra: string, page: number): Promise<SeriesSummary[]> {
  const offset = (page - 1) * 24;
  const res = await fetchJson<{ data: MdManga[] }>(
    `${API}/manga?${listParams}&offset=${offset}&${extra}`,
    MD_INIT,
  );
  return res.data.map(toSummary);
}

async function fetchAllChapters(mangaId: string): Promise<ChapterInfo[]> {
  const chapters: ChapterInfo[] = [];
  const seen = new Set<string>(); // dedupe multiple scan groups covering the same chapter
  for (let offset = 0; ; offset += 500) {
    const res = await fetchJson<{
      data: {
        id: string;
        attributes: {
          chapter: string | null;
          title: string | null;
          publishAt: string;
          externalUrl: string | null;
        };
      }[];
      total: number;
    }>(
      `${API}/manga/${mangaId}/feed?limit=500&offset=${offset}` +
        `&translatedLanguage[]=${LANG}&order[chapter]=asc&includeEmptyPages=0` +
        `&contentRating[]=safe`,
      MD_INIT,
    );
    for (const ch of res.data) {
      // externalUrl means the chapter is hosted elsewhere and has no pages here
      if (ch.attributes.externalUrl) continue;
      const number = Number.parseFloat(ch.attributes.chapter ?? "0") || 0;
      const key = ch.attributes.chapter ?? ch.id;
      if (seen.has(key)) continue;
      seen.add(key);
      chapters.push({
        sourceChapterId: ch.id,
        number,
        title: ch.attributes.title ?? undefined,
        publishedAt: new Date(ch.attributes.publishAt),
      });
    }
    if (offset + 500 >= res.total) break;
  }
  return chapters;
}

const STATUS_MAP: Record<string, SeriesDetail["status"]> = {
  ongoing: "ongoing",
  completed: "completed",
  hiatus: "hiatus",
  cancelled: "cancelled",
};

export const mangadex: Source = {
  id: "mangadex",
  name: "MangaDex",
  languages: [LANG],

  search: (query, page, status) =>
    listManga(
      `title=${encodeURIComponent(query)}${status ? `&status[]=${status}` : ""}`,
      page,
    ),

  getPopular: (page) => listManga("order[followedCount]=desc", page),

  getLatest: (page) => listManga("order[latestUploadedChapter]=desc", page),

  getNewest: (page) => listManga("order[createdAt]=desc", page),

  async getSeries(id): Promise<SeriesDetail> {
    const [res, chapters] = await Promise.all([
      fetchJson<{ data: MdManga }>(`${API}/manga/${id}?includes[]=cover_art`, MD_INIT),
      fetchAllChapters(id),
    ]);
    const attrs = res.data.attributes;
    return {
      ...toSummary(res.data),
      altTitles: attrs.altTitles.map(pickTitle).filter((t) => t !== "Untitled"),
      description: attrs.description[LANG] ?? Object.values(attrs.description)[0],
      status: STATUS_MAP[attrs.status] ?? "unknown",
      tags: attrs.tags.map((t) => t.attributes.name.en).filter(Boolean),
      chapters,
    };
  },

  async getPages(_seriesId, chapterId): Promise<PageInfo[]> {
    // MangaDex@Home: ask which server hosts this chapter, then build page URLs.
    // Prefer the data-saver variants — they're 3-5x smaller and load much
    // faster from MangaDex@Home nodes; quality is fine on phone screens.
    const res = await fetchJson<{
      baseUrl: string;
      chapter: { hash: string; data: string[]; dataSaver?: string[] };
    }>(`${API}/at-home/server/${chapterId}`, MD_INIT);
    const files = res.chapter.dataSaver?.length ? res.chapter.dataSaver : res.chapter.data;
    const quality = res.chapter.dataSaver?.length ? "data-saver" : "data";
    return files.map((file, index) => ({
      index,
      imageUrl: `${res.baseUrl}/${quality}/${res.chapter.hash}/${file}`,
    }));
  },
};
