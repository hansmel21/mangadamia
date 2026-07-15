// Registry of source adapters. Scraping runs OUT of this process now: each
// entry is a remote adapter that calls the external scraper service (the
// `scraper/` workspace) over HTTP. `catalog`, `unified`, and `health` still
// see plain `Source` objects and behave exactly as before.
//
// The set of sources is kept as a small static config (rather than fetched from
// the scraper at boot) so this module has no async import and no network
// dependency at startup. It must stay in sync with the scraper's registry
// (`scraper/src/sources/index.ts`); `hasLatest`/`hasNewest` mirror which
// optional listing feeds each adapter implements there.

import { remoteSource, type RemoteSourceMeta } from "./remote.js";
import type { Source } from "./types.js";

const REMOTE_SOURCES: RemoteSourceMeta[] = [
  { id: "mangadex", name: "MangaDex", languages: ["en"], hasLatest: true, hasNewest: true },
  { id: "asura", name: "Asura Scans", languages: ["en"], hasLatest: true },
  { id: "weebcentral", name: "Weeb Central", languages: ["en"], hasLatest: true, hasNewest: true },
];

export const sources: Source[] = REMOTE_SOURCES.map(remoteSource);

export function getSource(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}
