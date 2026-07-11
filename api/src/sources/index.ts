// Registry of all source adapters. To add a site: write its adapter file,
// import it here, add it to the array. Nothing else changes.

import { mangadex } from "./mangadex.js";
import type { Source } from "./types.js";

export const sources: Source[] = [mangadex];

export function getSource(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}
