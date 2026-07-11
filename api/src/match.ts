// Title normalization shared by the canonical-matching code paths.
export function normalizeTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
