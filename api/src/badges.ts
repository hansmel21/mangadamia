// Badge catalog + awarding engine. Names and icons live here in code so the
// emoji placeholders can be swapped for real artwork without touching data —
// only the badge `id` is stored in the DB.

import { prisma } from "./db/client.js";

export interface BadgeDef {
  id: string;
  name: string;
  icon: string; // emoji placeholder — becomes an asset URL/key later
  description: string;
  // Which stat drives it, and the threshold to earn it
  stat: "comments" | "likesReceived" | "chaptersRead" | "accountDays";
  target: number;
}

// 14 badges, 14 different series — every badge alludes to a legend whose
// premise matches what the milestone measures (Solo Leveling keeps exactly
// one seat: the flagship). Names are fan allusions (no trademarked art or
// logos) — ids stay stable so already-earned badges survive any renaming.
export const BADGES: BadgeDef[] = [
  // Commenting — the art of talking
  { id: "first-comment", name: "Sole Reader", icon: "📱", description: "Post your first comment — somebody had to be first (Omniscient Reader)", stat: "comments", target: 1 },
  { id: "commenter-10", name: "Talk no Jutsu", icon: "🍥", description: "Post 10 comments — win them over with words alone (Naruto)", stat: "comments", target: 10 },
  { id: "commenter-50", name: "Bankai", icon: "⚔️", description: "Post 50 comments — your true voice, fully released (Bleach)", stat: "comments", target: 50 },
  { id: "commenter-100", name: "Domain Expansion", icon: "🌀", description: "Post 100 comments — the whole room bends to your words (Jujutsu Kaisen)", stat: "comments", target: 100 },
  // Likes received — recognition and power readings
  { id: "liked-10", name: "Picked Up", icon: "🎰", description: "Receive 10 likes — the readers chose you (Pick Me Up)", stat: "likesReceived", target: 10 },
  { id: "liked-50", name: "S-Class Hero", icon: "👊", description: "Receive 50 likes — the association has noticed (One-Punch Man)", stat: "likesReceived", target: 50 },
  { id: "liked-100", name: "Over 9000", icon: "💥", description: "Receive 100 likes — the scouter couldn't take it (Dragon Ball Z)", stat: "likesReceived", target: 100 },
  // Reading — the grind
  { id: "reader-10", name: "Final Selection", icon: "🗡️", description: "Read 10 chapters — you survived the entrance exam (Demon Slayer)", stat: "chaptersRead", target: 10 },
  { id: "reader-100", name: "Reborn Scholar", icon: "📜", description: "Read 100 chapters — a library lives in your head now (Tales of Demons and Gods)", stat: "chaptersRead", target: 100 },
  { id: "reader-500", name: "Roadwork", icon: "🥊", description: "Read 500 chapters — the grind IS the power (Hajime no Ippo)", stat: "chaptersRead", target: 500 },
  { id: "reader-1000", name: "Shadow Monarch", icon: "🌑", description: "Read 1,000 chapters — arise (Solo Leveling)", stat: "chaptersRead", target: 1000 },
  // Membership — time served
  { id: "member-1m", name: "Cabin Boy", icon: "⚓", description: "A month aboard the crew (One Piece)", stat: "accountDays", target: 30 },
  { id: "member-6m", name: "Hunter License", icon: "🎫", description: "Six months in — officially licensed (Hunter × Hunter)", stat: "accountDays", target: 182 },
  { id: "member-1y", name: "Elf Time", icon: "⏳", description: "A year here — barely a blink, really (Frieren)", stat: "accountDays", target: 365 },
];

const badgeById = new Map(BADGES.map((b) => [b.id, b]));
export const getBadge = (id: string): BadgeDef | undefined => badgeById.get(id);

export const levelForXp = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
export const xpForLevel = (level: number): number => (level - 1) ** 2 * 100;

export interface UserStats {
  comments: number;
  likesReceived: number;
  chaptersRead: number;
  accountDays: number;
}

export async function getStats(userId: string): Promise<UserStats> {
  const [comments, likesReceived, chaptersRead, user] = await Promise.all([
    prisma.comment.count({ where: { userId } }),
    prisma.commentLike.count({ where: { comment: { userId } } }),
    prisma.readChapter.count({ where: { userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
  ]);
  return {
    comments,
    likesReceived,
    chaptersRead,
    accountDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000),
  };
}

/** Award any newly earned badges; returns the ones just earned. */
export async function evaluateBadges(userId: string): Promise<BadgeDef[]> {
  const [stats, owned] = await Promise.all([
    getStats(userId),
    prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
  ]);
  const have = new Set(owned.map((b) => b.badgeId));
  const earned = BADGES.filter((b) => !have.has(b.id) && stats[b.stat] >= b.target);
  if (earned.length > 0) {
    await prisma.userBadge.createMany({
      data: earned.map((b) => ({ userId, badgeId: b.id })),
      skipDuplicates: true,
    });
  }
  return earned;
}

/**
 * The badge shown next to a user's name: their equipped Title if set,
 * otherwise their most recently earned badge.
 */
export async function displayBadges(
  userIds: string[],
): Promise<Map<string, { id: string; icon: string; name: string }>> {
  if (userIds.length === 0) return new Map();
  const [users, rows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, equippedBadgeId: true },
    }),
    prisma.userBadge.findMany({
      where: { userId: { in: userIds } },
      orderBy: { earnedAt: "desc" },
    }),
  ]);
  const result = new Map<string, { id: string; icon: string; name: string }>();
  for (const row of rows) {
    if (!result.has(row.userId)) {
      const def = badgeById.get(row.badgeId);
      if (def) result.set(row.userId, { id: def.id, icon: def.icon, name: def.name });
    }
  }
  for (const u of users) {
    if (u.equippedBadgeId) {
      const def = badgeById.get(u.equippedBadgeId);
      if (def) result.set(u.id, { id: def.id, icon: def.icon, name: def.name });
    }
  }
  return result;
}
