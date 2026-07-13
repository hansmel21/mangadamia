import type { Rarity } from "./api";

export const rarityColors: Record<Rarity, { main: string; soft: string; text: string }> = {
  common: { main: "#8992A3", soft: "rgba(137,146,163,0.14)", text: "#C7CDD8" },
  rare: { main: "#6d8fc4", soft: "rgba(75,163,255,0.14)", text: "#9ED0FF" },
  epic: { main: "#9a7fd1", soft: "rgba(168,107,255,0.15)", text: "#D6B7FF" },
  legendary: { main: "#cda45e", soft: "rgba(205,164,94,0.16)", text: "#e8d3a0" },
  mythic: { main: "#c06a87", soft: "rgba(192,106,135,0.16)", text: "#FF9CBC" },
};

export function normalizeRarity(value?: string | null): Rarity {
  return value && value in rarityColors ? (value as Rarity) : "common";
}
