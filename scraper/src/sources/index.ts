// Registry of all source adapters. To add a site: write its adapter file,
// import it here, add it to the array. Nothing else changes.

import { asura } from "./asura.js";
import { mangadex } from "./mangadex.js";
import type { Source } from "./types.js";
import { weebcentral } from "./weebcentral.js";

export const sources: Source[] = [mangadex, asura, weebcentral];

export function getSource(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}
