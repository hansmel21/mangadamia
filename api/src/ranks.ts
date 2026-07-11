// Hunter-rank scale (E → S) shared by author level bands and community series
// rank (from review ratings). Colors live client-side.

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

// Reaction types. Only "endorse" grants the author EXP; the rest are free.
export const REACTION_TYPES = ["endorse", "hype", "mindblown", "pain", "dead"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];
export function isReactionType(value: string): value is ReactionType {
  return (REACTION_TYPES as readonly string[]).includes(value);
}

// Community series rank from the average review rating (1–5).
export function seriesRankForAverage(avg: number): Rank {
  if (avg >= 4.4) return "S";
  if (avg >= 3.8) return "A";
  if (avg >= 3.2) return "B";
  if (avg >= 2.6) return "C";
  if (avg >= 2.0) return "D";
  return "E";
}
