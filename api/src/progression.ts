// Hunter-level progression: milestone rewards granted as readers level up,
// plus the level gates on founding guilds / opening gates. Grants are
// CATCH-UP IDEMPOTENT — maybeGrantLevelMilestones() awards everything at or
// below the current level that hasn't been granted yet (level-up detection is
// scattered across XP sites, so edge-triggering would miss paths; this way
// any call site heals the whole track).
import { prisma } from "./db/client.js";
import { levelForXp, xpForLevel } from "./badges.js";
import { createNotification } from "./notifications.js";

// Level gates (tunable — zero them out to disable).
export const GUILD_CREATE_MIN_LEVEL = 3;
export const GATE_CREATE_MIN_LEVEL = 5;

interface MilestoneReward {
  type: "title" | "cosmetic" | "item";
  id: string;
  name: string;
  qty?: number; // items only
}

export const LEVEL_MILESTONES: { level: number; rewards: MilestoneReward[] }[] = [
  {
    level: 3,
    rewards: [
      { type: "title", id: "rising-hunter", name: "Rising Hunter" },
      { type: "item", id: "xp-elixir-s", name: "XP Elixir (S)" },
    ],
  },
  {
    level: 5,
    rewards: [
      { type: "title", id: "proven-hunter", name: "Proven Hunter" },
      { type: "item", id: "streak-shield", name: "Streak Shield" },
    ],
  },
  { level: 10, rewards: [{ type: "cosmetic", id: "frame-tempered", name: "Tempered Halo" }] },
  {
    level: 15,
    rewards: [
      { type: "cosmetic", id: "avatar-veteran", name: "Veteran Sigil" },
      { type: "item", id: "gate-key", name: "Gate Key" },
    ],
  },
  {
    level: 20,
    rewards: [
      { type: "title", id: "elite-hunter", name: "Elite Hunter" },
      { type: "item", id: "monarch-chest", name: "Monarch's Chest" },
    ],
  },
  { level: 30, rewards: [{ type: "title", id: "high-hunter", name: "High Hunter" }] },
  {
    level: 50,
    rewards: [{ type: "cosmetic", id: "frame-transcendent", name: "Transcendent Crown" }],
  },
];

// Item grants join in the items phase; this hook keeps the reward loop in one
// place so milestone definitions can reference item ids without a cycle.
let grantItemHook:
  | ((userId: string, itemId: string, qty: number, sourceType: string, sourceId: string) => Promise<void>)
  | null = null;
export function setMilestoneItemGranter(fn: typeof grantItemHook): void {
  grantItemHook = fn;
}

// The client's MILESTONE TRACK: every step with reached/reward info.
export function milestoneTrack(xp: number) {
  const level = levelForXp(xp);
  const steps = LEVEL_MILESTONES.map((m) => ({
    level: m.level,
    xpRequired: xpForLevel(m.level),
    reached: level >= m.level,
    rewards: m.rewards.map((r) => ({ type: r.type, id: r.id, name: r.name })),
  }));
  const next = steps.find((s) => !s.reached) ?? null;
  return { level, xp, steps, next };
}

// Grant everything ≤ the reader's current level, exactly once each.
export async function maybeGrantLevelMilestones(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
    if (!user) return;
    const level = levelForXp(user.xp);
    for (const milestone of LEVEL_MILESTONES) {
      if (milestone.level > level) break;
      for (const reward of milestone.rewards) {
        const key = {
          userId,
          rewardType: reward.type,
          rewardId: reward.id,
          sourceType: "level_milestone",
          sourceId: String(milestone.level),
        };
        const existing = await prisma.rewardGrant.findUnique({
          where: { userId_rewardType_rewardId_sourceType_sourceId: key },
          select: { id: true },
        });
        if (existing) continue;
        if (reward.type === "title") {
          await prisma.userTitle.upsert({
            where: { userId_titleId: { userId, titleId: reward.id } },
            create: { userId, titleId: reward.id, source: "level_milestone" },
            update: {},
          });
        } else if (reward.type === "cosmetic") {
          await prisma.userCosmetic.upsert({
            where: { userId_cosmeticId: { userId, cosmeticId: reward.id } },
            create: { userId, cosmeticId: reward.id, source: "level_milestone" },
            update: {},
          });
        } else if (reward.type === "item") {
          if (!grantItemHook) continue; // items phase not wired yet
          await grantItemHook(userId, reward.id, reward.qty ?? 1, "level_milestone", key.sourceId);
          continue; // the hook writes its own RewardGrant ledger row
        }
        await prisma.rewardGrant.upsert({
          where: { userId_rewardType_rewardId_sourceType_sourceId: key },
          create: key,
          update: {},
        });
        await createNotification({
          userId,
          kind: "reward_granted",
          title: `Level ${milestone.level} milestone!`,
          safeBody: `Your climb pays off — ${reward.name} is yours.`,
          targetUrl: "/account",
          dedupeKey: `level-milestone:${milestone.level}:${reward.id}`,
        });
      }
    }
  } catch {
    // best-effort; the next call heals anything missed
  }
}
