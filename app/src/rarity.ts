import type { Rarity } from "./api";

export const rarityColors: Record<Rarity, { main: string; soft: string; text: string }> = {
  common: { main: "#8992A3", soft: "rgba(137,146,163,0.14)", text: "#C7CDD8" },
  rare: { main: "#4BA3FF", soft: "rgba(75,163,255,0.14)", text: "#9ED0FF" },
  epic: { main: "#A86BFF", soft: "rgba(168,107,255,0.15)", text: "#D6B7FF" },
  legendary: { main: "#F5B84C", soft: "rgba(245,184,76,0.16)", text: "#FFE09A" },
  mythic: { main: "#FF4D87", soft: "rgba(255,77,135,0.16)", text: "#FF9CBC" },
};

export function normalizeRarity(value?: string | null): Rarity {
  return value && value in rarityColors ? (value as Rarity) : "common";
}
