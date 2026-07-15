// Inventory routes: list what the reader holds and use consumables.
import type { FastifyInstance } from "fastify";
import { requireActiveUser } from "../auth.js";
import { prisma } from "../db/client.js";
import { PASSIVE_ITEMS, USE_HANDLERS } from "../items.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function registerItemRoutes(app: FastifyInstance): void {
  app.get("/me/items", async (req) => {
    const user = await requireActiveUser(req);
    const rows = await prisma.userItem.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      include: { item: true },
      orderBy: { item: { sortOrder: "asc" } },
    });
    return rows
      .filter((r) => r.item.isActive)
      .map((r) => ({
        id: r.itemId,
        name: r.item.name,
        description: r.item.description,
        kind: r.item.kind,
        rarity: r.item.rarity,
        icon: r.item.iconKey,
        quantity: r.quantity,
        usable: r.item.kind === "consumable" && !PASSIVE_ITEMS.has(r.itemId),
      }));
  });

  app.post<{ Params: { id: string } }>(
    "/me/items/:id/use",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req) => {
      const user = await requireActiveUser(req);
      const itemId = req.params.id;
      if (PASSIVE_ITEMS.has(itemId)) {
        throw httpError(400, "This item is consumed automatically when it's needed.");
      }
      const handler = USE_HANDLERS[itemId];
      if (!handler) throw httpError(400, "This item can't be used.");
      // Atomic decrement first; refund if the effect throws.
      const spent = await prisma.userItem.updateMany({
        where: { userId: user.id, itemId, quantity: { gte: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (spent.count === 0) throw httpError(400, "You don't have that item.");
      try {
        const result = await handler(user.id);
        const remaining = await prisma.userItem.findUnique({
          where: { userId_itemId: { userId: user.id, itemId } },
          select: { quantity: true },
        });
        return { ok: true, remaining: remaining?.quantity ?? 0, ...result };
      } catch (e) {
        await prisma.userItem.updateMany({
          where: { userId: user.id, itemId },
          data: { quantity: { increment: 1 } },
        });
        throw e;
      }
    },
  );
}
