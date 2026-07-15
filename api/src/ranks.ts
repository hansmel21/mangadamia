// Hunter-rank scale (E → S) shared by author level bands and community series
// rank (from review ratings). Colors live client-side.

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

// Reaction types. The first reaction a reader leaves on a post grants the
// author EXP; switching between emotes doesn't.
export const REACTION_TYPES = ["like", "hype", "mindblown", "pain", "dead"] as const;
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

// Gate rank from this week's in-gate activity score (posts ×2 + reactions).
// Thresholds are tunable — an active small community should sit around B.
export function gateRankForScore(score: number): Rank {
  if (score >= 250) return "S";
  if (score >= 120) return "A";
  if (score >= 60) return "B";
  if (score >= 25) return "C";
  if (score >= 10) return "D";
  return "E";
}
