// The source adapter interface — the heart of the aggregator.
// Every site we support implements this. Adding a new site = one new file
// in this folder that exports a `Source`, registered in ./index.ts.

export interface SeriesSummary {
  sourceSeriesId: string;
  title: string;
  coverUrl?: string;
}

export interface ChapterInfo {
  sourceChapterId: string;
  number: number; // 10.5 for chapter 10.5
  title?: string;
  publishedAt?: Date;
}

export interface SeriesDetail extends SeriesSummary {
  altTitles: string[];
  description?: string;
  status?: "ongoing" | "completed" | "hiatus" | "cancelled" | "unknown";
  tags: string[];
  chapters: ChapterInfo[];
}

export interface PageInfo {
  index: number;
  imageUrl: string;
  // Headers the *client app* must send when fetching the image.
  // Most scanlation sites reject image requests without their own Referer.
  headers?: Record<string, string>;
}

export type StatusFilter = "ongoing" | "completed";

export interface Source {
  id: string; // "mangadex", "asura", ...
  name: string; // display name shown in the app
  languages: string[]; // ISO codes of chapter languages this adapter returns

  search(query: string, page: number, status?: StatusFilter): Promise<SeriesSummary[]>;
  getPopular(page: number): Promise<SeriesSummary[]>;
  // Optional listings — a source that lacks one simply sits out that feed
  getLatest?(page: number): Promise<SeriesSummary[]>; // recent chapter updates
  getNewest?(page: number): Promise<SeriesSummary[]>; // recently added series
  getSeries(sourceSeriesId: string): Promise<SeriesDetail>;
  getPages(sourceSeriesId: string, sourceChapterId: string): Promise<PageInfo[]>;
}
