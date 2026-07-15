// Items & inventory: grants (idempotent via the RewardGrant ledger) and
// consumable USE handlers. Passive items (streak-shield, gate-key) are
// consumed automatically by their hook sites, never via /use.
import { prisma } from "./db/client.js";
import { bumpWeeklyXp } from "./arena.js";
import { creditGuild } from "./guilds.js";
import { createNotification } from "./notifications.js";
import { maybeGrantLevelMilestones, setMilestoneItemGranter } from "./progression.js";

// Grant qty of an item, exactly once per (sourceType, sourceId). Returns
// whether this call actually granted (false = the ledger already had it).
export async function grantItem(
  userId: string,
  itemId: string,
  qty: number,
  sourceType: string,
  sourceId: string,
  notify = true,
): Promise<boolean> {
  try {
    const key = { userId, rewardType: "item", rewardId: itemId, sourceType, sourceId };
    try {
      await prisma.rewardGrant.create({ data: key });
    } catch {
      return false; // unique violation — this source already paid out
    }
    const item = await prisma.itemDefinition.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) return false;
    await prisma.userItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId, quantity: qty },
      update: { quantity: { increment: qty } },
    });
    if (notify) {
      await createNotification({
        userId,
        kind: "reward_granted",
        title: "Item acquired!",
        safeBody: `${item.iconKey} ${item.name} ×${qty} added to your inventory.`,
        targetUrl: "/account",
        dedupeKey: `item:${itemId}:${sourceType}:${sourceId}`,
      });
    }
    return true;
  } catch {
    return false; // best-effort — item drops must never break the action
  }
}

// Atomically consume one of an item; true when a charge was actually spent.
export async function consumeItem(userId: string, itemId: string): Promise<boolean> {
  const spent = await prisma.userItem.updateMany({
    where: { userId, itemId, quantity: { gte: 1 } },
    data: { quantity: { decrement: 1 } },
  });
  return spent.count > 0;
}

export interface UseResult {
  message: string;
  xpAwarded?: number;
  cosmeticId?: string;
}

// Active consumable effects. Anything not listed here (or marked passive)
// rejects /use with a helpful message.
export const USE_HANDLERS: Record<string, (userId: string) => Promise<UseResult>> = {
  "xp-elixir-s": async (userId) => {
    const XP = 100;
    await prisma.user.update({ where: { id: userId }, data: { xp: { increment: XP } } });
    await bumpWeeklyXp(prisma, userId, XP);
    await creditGuild(userId, XP);
    void maybeGrantLevelMilestones(userId);
    return { message: `The elixir burns going down. +${XP} XP.`, xpAwarded: XP };
  },
  "monarch-chest": async (userId) => {
    // A random active cosmetic the reader doesn't own yet; falls back to XP
    // when the whole catalog is owned.
    const owned = await prisma.userCosmetic.findMany({
      where: { userId },
      select: { cosmeticId: true },
    });
    const pool = await prisma.cosmeticDefinition.findMany({
      where: { isActive: true, id: { notIn: owned.map((c) => c.cosmeticId) } },
      select: { id: true, name: true },
    });
    if (pool.length === 0) {
      const XP = 150;
      await prisma.user.update({ where: { id: userId }, data: { xp: { increment: XP } } });
      await bumpWeeklyXp(prisma, userId, XP);
      await creditGuild(userId, XP);
      return { message: `The chest was empty… except for +${XP} XP in dust.`, xpAwarded: XP };
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await prisma.userCosmetic.upsert({
      where: { userId_cosmeticId: { userId, cosmeticId: pick.id } },
      create: { userId, cosmeticId: pick.id, source: "monarch_chest" },
      update: {},
    });
    return { message: `The chest creaks open — ${pick.name} is yours!`, cosmeticId: pick.id };
  },
};

export const PASSIVE_ITEMS = new Set(["streak-shield", "gate-key"]);

// Item rewards for the level milestone track (wired via the progression hook
// to avoid an import cycle).
setMilestoneItemGranter(async (userId, itemId, qty, sourceType, sourceId) => {
  await grantItem(userId, itemId, qty, sourceType, sourceId);
});
