// Presentation for the "System" social layer: hunter ranks (E→S), reaction
// emotes, and System Record types. Kept in one place so cards, badges, and the
// composer stay consistent.
import type { PostKind, ReactionType } from "./api";
import { colors } from "./theme";

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

// Author hunter rank from level (bands mirror the server's series-rank scale).
export function hunterRankForLevel(level: number | null): Rank {
  const l = level ?? 1;
  if (l >= 55) return "S";
  if (l >= 35) return "A";
  if (l >= 20) return "B";
  if (l >= 10) return "C";
  if (l >= 5) return "D";
  return "E";
}

// Community series rank from the average review rating (1–5) — mirrors the
// server's seriesRankForAverage scale.
export function seriesRankForAverage(avg: number): Rank {
  if (avg >= 4.4) return "S";
  if (avg >= 3.8) return "A";
  if (avg >= 3.2) return "B";
  if (avg >= 2.6) return "C";
  if (avg >= 2.0) return "D";
  return "E";
}

export const rankColors: Record<Rank, string> = {
  E: "#8992A3",
  D: "#6FBF8F",
  C: "#4BA3FF",
  B: "#A86BFF",
  A: "#F5B84C",
  S: "#FF4D87",
};

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "❤️", label: "Like" },
  { type: "hype", emoji: "🔥", label: "Hype" },
  { type: "mindblown", emoji: "🤯", label: "Mindblown" },
  { type: "pain", emoji: "😭", label: "Pain" },
  { type: "dead", emoji: "💀", label: "Dead" },
];

export const reactionEmoji: Record<string, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.type, r.emoji]),
);

export const POST_KINDS: Record<PostKind, { label: string; color: string; icon: string }> = {
  record: { label: "RECORD", color: colors.accentSoft, icon: "◇" },
  theory: { label: "THEORY", color: "#4BA3FF", icon: "🧠" },
  review: { label: "REVIEW", color: colors.foil, icon: "★" },
  spoiler_intel: { label: "SPOILER INTEL", color: colors.danger, icon: "👁" },
  poll: { label: "POLL", color: "#4CC38A", icon: "📊" },
  // THE SYSTEM's official notices — never selectable in the composer.
  announcement: { label: "SYSTEM NOTICE", color: colors.data, icon: "⚙" },
};
