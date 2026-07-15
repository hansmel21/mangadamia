// Gates: Reddit-style communities inside the Dungeon. Readers may join many
// gates (unlike the one-guild rule). Visibility tiers: open (anyone
// views/joins/posts), restricted "SEALED" (anyone views/joins, only authorized
// posters post), private "HIDDEN" (invisible to non-members, entry by request).
// The gate feed itself lives in social.ts next to the guild board.
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getUser, requireAcceptedTerms, requireActiveUser } from "../auth.js";
import { prisma } from "../db/client.js";
import { currentWeekKey, isGuildEmblem } from "../guilds.js";
import { gateRankForScore, type Rank } from "../ranks.js";
import { identitiesForUsers } from "../identity.js";
import { createNotification } from "../notifications.js";
import {
  GATE_PERM_KEYS,
  gateCan,
  hasGatePerm,
  roleToggleState,
  type GatePermKey,
} from "../permissions.js";
import { GATE_CREATE_MIN_LEVEL } from "../progression.js";
import { levelForXp } from "../badges.js";
import { validateUserContent } from "../policy.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const MOD_ROLES = ["gatekeeper", "warden"];

const createBody = z.object({
  name: z.string().trim().min(3).max(30),
  description: z.string().trim().max(500).nullable().optional(),
  emblemKey: z.string().min(1),
  primaryColor: z.string().regex(HEX),
  secondaryColor: z.string().regex(HEX).nullable().optional(),
  visibility: z.enum(["open", "restricted", "private"]).default("open"),
});

const editBody = z.object({
  name: z.string().trim().min(3).max(30).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  emblemKey: z.string().min(1).optional(),
  primaryColor: z.string().regex(HEX).optional(),
  secondaryColor: z.string().regex(HEX).nullable().optional(),
  visibility: z.enum(["open", "restricted", "private"]).optional(),
});

type GateRecord = { id: string; visibility: string };
type GateMembership = { role: string; approvedPoster: boolean } | null;

export async function gateMembership(userId: string | undefined, gateId: string) {
  if (!userId) return null;
  return prisma.gateMember.findUnique({
    where: { userId_gateId: { userId, gateId } },
  });
}

export function canViewGate(gate: GateRecord, membership: GateMembership): boolean {
  return gate.visibility !== "private" || !!membership;
}

export function isGateMod(membership: GateMembership): boolean {
  return !!membership && MOD_ROLES.includes(membership.role);
}

// This week's activity score per gate: visible posts+replies ×2 plus
// reactions on them ×1. Two queries for any number of gates (the directory
// caps at 50); cache per weekKey if this ever gets hot.
export async function gateActivityScores(gateIds: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (gateIds.length === 0) return scores;
  const since = new Date(`${currentWeekKey()}T00:00:00Z`);
  const posts = await prisma.post.groupBy({
    by: ["gateId"],
    where: {
      gateId: { in: gateIds },
      createdAt: { gte: since },
      moderationStatus: "visible",
    },
    _count: true,
  });
  for (const row of posts) {
    if (row.gateId) scores.set(row.gateId, row._count * 2);
  }
  const reactions = await prisma.$queryRaw<{ gateId: string; count: number }[]>(
    Prisma.sql`
      SELECT p."gateId" AS "gateId", COUNT(*)::int AS count
      FROM "PostLike" l
      JOIN "Post" p ON p."id" = l."postId"
      WHERE p."gateId" IN (${Prisma.join(gateIds)})
        AND l."createdAt" >= ${since}
        AND p."moderationStatus" = 'visible'
      GROUP BY p."gateId"
    `,
  );
  for (const row of reactions) {
    scores.set(row.gateId, (scores.get(row.gateId) ?? 0) + row.count);
  }
  return scores;
}

export function registerGateRoutes(app: FastifyInstance): void {
  // Permission-toggle gate: warden powers are configurable per gate (the
  // gatekeeper always passes).
  async function requireGateMod(userId: string, gateId: string, key: GatePermKey) {
    const [m, gate] = await Promise.all([
      gateMembership(userId, gateId),
      prisma.gate.findUnique({ where: { id: gateId }, select: { permissions: true } }),
    ]);
    if (!gate || !isGateMod(m) || !hasGatePerm(gate, m, key)) {
      throw httpError(403, "Wardens only");
    }
    return m!;
  }

  const summarize = (
    g: {
      id: string;
      name: string;
      emblemKey: string;
      primaryColor: string;
      secondaryColor: string | null;
      description: string | null;
      visibility: string;
      createdAt: Date;
      _count: { members: number };
    },
    mine: GateMembership,
    hasRequested: boolean,
    rank: Rank | null = null,
  ) => {
    // Private gates show only a masked shell to outsiders (found via search).
    if (g.visibility === "private" && !mine) {
      return {
        id: g.id,
        name: g.name,
        emblemKey: null,
        primaryColor: null,
        secondaryColor: null,
        description: null,
        visibility: g.visibility,
        memberCount: g._count.members,
        myRole: null,
        approvedPoster: false,
        hasRequested,
        rank: null as Rank | null,
        masked: true,
      };
    }
    return {
      id: g.id,
      name: g.name,
      emblemKey: g.emblemKey,
      primaryColor: g.primaryColor,
      secondaryColor: g.secondaryColor,
      description: g.description,
      visibility: g.visibility,
      memberCount: g._count.members,
      myRole: mine?.role ?? null,
      approvedPoster: mine?.approvedPoster ?? false,
      hasRequested,
      rank,
      masked: false,
    };
  };

  // ── Open a gate ───────────────────────────────────────────────────────
  app.post(
    "/gates",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const user = await requireAcceptedTerms(req);
      const body = createBody.parse(req.body);
      validateUserContent(body.name);
      if (body.description) validateUserContent(body.description);
      if (!isGuildEmblem(body.emblemKey)) throw httpError(400, "Unknown emblem");
      const clash = await prisma.gate.findFirst({
        where: { name: { equals: body.name, mode: "insensitive" } },
      });
      if (clash) throw httpError(409, "That gate name is taken");
      // Opening a gate is a milestone privilege — unless the reader spends a
      // Gate Key. Consumed atomically LAST, after every validation, so a
      // rejected request never burns the key.
      if (levelForXp(user.xp) < GATE_CREATE_MIN_LEVEL) {
        const { consumeItem } = await import("../items.js");
        const spentGateKey = await consumeItem(user.id, "gate-key");
        if (!spentGateKey) {
          throw httpError(
            403,
            `Opening a gate unlocks at Hunter LV ${GATE_CREATE_MIN_LEVEL} — keep reading and posting (or spend a Gate Key)!`,
          );
        }
      }
      const gate = await prisma.gate.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          emblemKey: body.emblemKey,
          primaryColor: body.primaryColor,
          secondaryColor: body.secondaryColor ?? null,
          visibility: body.visibility,
          ownerId: user.id,
          members: { create: { userId: user.id, role: "gatekeeper" } },
        },
      });
      return { id: gate.id };
    },
  );

  // ── Directory ─────────────────────────────────────────────────────────
  app.get("/gates", async (req) => {
    const me = await getUser(req);
    const { q, sort, joined } = z
      .object({
        q: z.string().trim().max(60).optional(),
        sort: z.enum(["popular", "new"]).default("popular"),
        joined: z.coerce.boolean().default(false),
      })
      .parse(req.query);
    if (joined && !me) throw httpError(401, "Sign in to see your gates");
    const gates = await prisma.gate.findMany({
      where: joined
        ? {
            members: { some: { userId: me!.id } },
            ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          }
        : {
            // Hidden gates stay out of the directory, but a name search may
            // surface them as masked rows (serializer strips the details).
            ...(q
              ? { name: { contains: q, mode: "insensitive" as const } }
              : { visibility: { not: "private" } }),
          },
      orderBy:
        sort === "new"
          ? [{ createdAt: "desc" as const }]
          : [{ members: { _count: "desc" as const } }, { createdAt: "asc" as const }],
      take: 50,
      include: { _count: { select: { members: true } } },
    });
    const [myMemberships, myRequests] = await Promise.all([
      me
        ? prisma.gateMember.findMany({
            where: { userId: me.id, gateId: { in: gates.map((g) => g.id) } },
          })
        : [],
      me
        ? prisma.gateJoinRequest.findMany({
            where: { userId: me.id, gateId: { in: gates.map((g) => g.id) } },
          })
        : [],
    ]);
    const mineByGate = new Map(myMemberships.map((m) => [m.gateId, m]));
    const requested = new Set(myRequests.map((r) => r.gateId));
    // Weekly activity rank (E→S). Masked rows keep it hidden.
    const scores = await gateActivityScores(
      gates
        .filter((g) => g.visibility !== "private" || mineByGate.has(g.id))
        .map((g) => g.id),
    );
    return gates.map((g) =>
      summarize(
        g,
        mineByGate.get(g.id) ?? null,
        requested.has(g.id),
        scores.has(g.id) || g.visibility !== "private" || mineByGate.has(g.id)
          ? gateRankForScore(scores.get(g.id) ?? 0)
          : null,
      ),
    );
  });

  // ── My gates (composer picker + Dungeon scope) ────────────────────────
  app.get("/me/gates", async (req) => {
    const user = await requireActiveUser(req);
    const memberships = await prisma.gateMember.findMany({
      where: { userId: user.id },
      include: { gate: true },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((m) => ({
      id: m.gate.id,
      name: m.gate.name,
      emblemKey: m.gate.emblemKey,
      primaryColor: m.gate.primaryColor,
      visibility: m.gate.visibility,
      role: m.role,
      approvedPoster: m.approvedPoster,
    }));
  });

  // ── Gate detail ───────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/gates/:id", async (req) => {
    const me = await getUser(req);
    const gate = await prisma.gate.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { members: true } } },
    });
    if (!gate) throw httpError(404, "No such gate");
    const [mine, request] = await Promise.all([
      gateMembership(me?.id, gate.id),
      me
        ? prisma.gateJoinRequest.findUnique({
            where: { gateId_userId: { gateId: gate.id, userId: me.id } },
          })
        : null,
    ]);
    const base = summarize(gate, mine, !!request);
    if (base.masked) return base;
    const scores = await gateActivityScores([gate.id]);
    const weeklyScore = scores.get(gate.id) ?? 0;
    const canManage = isGateMod(mine);
    const pendingRequestCount = canManage
      ? await prisma.gateJoinRequest.count({ where: { gateId: gate.id } })
      : 0;
    return {
      ...base,
      rank: gateRankForScore(weeklyScore),
      weeklyScore,
      createdAt: gate.createdAt,
      canManage,
      // Per-capability truth for the client's buttons/fields.
      can: gateCan(gate, mine),
      // Toggle state for the settings screen (gatekeeper reads/writes it).
      wardenPermissions:
        mine?.role === "gatekeeper"
          ? roleToggleState(gate.permissions, "warden", GATE_PERM_KEYS)
          : null,
      pendingRequestCount,
    };
  });

  // ── Warden permission toggles (gatekeeper only) ───────────────────────
  app.put<{ Params: { id: string } }>("/gates/:id/permissions", async (req) => {
    const user = await requireActiveUser(req);
    const mine = await gateMembership(user.id, req.params.id);
    if (mine?.role !== "gatekeeper") {
      throw httpError(403, "Only the Gatekeeper can change warden permissions");
    }
    const toggles = z
      .object(
        Object.fromEntries(GATE_PERM_KEYS.map((key) => [key, z.boolean()])) as Record<
          (typeof GATE_PERM_KEYS)[number],
          z.ZodBoolean
        >,
      )
      .parse(req.body);
    await prisma.gate.update({
      where: { id: req.params.id },
      data: { permissions: { warden: toggles } },
    });
    return { ok: true, wardenPermissions: toggles };
  });

  // ── Enter (join) ──────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/gates/:id/join", async (req) => {
    const user = await requireActiveUser(req);
    const gate = await prisma.gate.findUnique({ where: { id: req.params.id } });
    if (!gate) throw httpError(404, "No such gate");
    const existing = await gateMembership(user.id, gate.id);
    if (existing) throw httpError(409, "You're already inside this gate");
    if (gate.visibility === "private") {
      await prisma.gateJoinRequest.upsert({
        where: { gateId_userId: { gateId: gate.id, userId: user.id } },
        create: { gateId: gate.id, userId: user.id },
        update: {},
      });
      await createNotification({
        userId: gate.ownerId,
        actorId: user.id,
        kind: "gate_entry_request",
        title: "Entry request",
        safeBody: `@${user.username} requested entry to ${gate.name}.`,
        targetUrl: `/gate/${gate.id}`,
        dedupeKey: `gate-req:${gate.id}:${user.id}`,
      });
      return { status: "requested" };
    }
    await prisma.gateMember.create({
      data: { userId: user.id, gateId: gate.id, role: "member" },
    });
    return { status: "joined" };
  });

  // ── Withdraw (leave) ──────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/gates/:id/leave", async (req) => {
    const user = await requireActiveUser(req);
    const membership = await gateMembership(user.id, req.params.id);
    if (!membership) throw httpError(400, "You're not inside this gate");
    if (membership.role === "gatekeeper") {
      const others = await prisma.gateMember.findMany({
        where: { gateId: req.params.id, userId: { not: user.id } },
        orderBy: [{ joinedAt: "asc" }],
      });
      if (others.length === 0) {
        // Last one out closes the gate (posts cascade).
        await prisma.gate.delete({ where: { id: req.params.id } });
        return { status: "dissolved" };
      }
      const heir = others.find((m) => m.role === "warden") ?? others[0];
      await prisma.$transaction([
        prisma.gateMember.update({
          where: { userId_gateId: { userId: heir.userId, gateId: req.params.id } },
          data: { role: "gatekeeper" },
        }),
        prisma.gate.update({ where: { id: req.params.id }, data: { ownerId: heir.userId } }),
        prisma.gateMember.delete({
          where: { userId_gateId: { userId: user.id, gateId: req.params.id } },
        }),
      ]);
      await createNotification({
        userId: heir.userId,
        actorId: user.id,
        kind: "gate_promoted",
        title: "You're the Gatekeeper",
        safeBody: `@${user.username} withdrew and passed you the gate.`,
        targetUrl: `/gate/${req.params.id}`,
        dedupeKey: `gate-gk:${req.params.id}:${heir.userId}:${Date.now()}`,
      });
      return { status: "left" };
    }
    await prisma.gateMember.delete({
      where: { userId_gateId: { userId: user.id, gateId: req.params.id } },
    });
    return { status: "left" };
  });

  // ── Entry requests (mods) ─────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/gates/:id/requests", async (req) => {
    const user = await requireActiveUser(req);
    await requireGateMod(user.id, req.params.id, "entry_requests");
    const requests = await prisma.gateJoinRequest.findMany({
      where: { gateId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    const identities = await identitiesForUsers(requests.map((r) => r.userId));
    return requests.map((r) => ({
      userId: r.userId,
      createdAt: r.createdAt,
      identity: identities.get(r.userId) ?? null,
    }));
  });

  app.post<{ Params: { id: string; userId: string } }>(
    "/gates/:id/requests/:userId",
    async (req) => {
      const user = await requireActiveUser(req);
      const { action } = z.object({ action: z.enum(["accept", "reject"]) }).parse(req.body);
      await requireGateMod(user.id, req.params.id, "entry_requests");
      const request = await prisma.gateJoinRequest.findUnique({
        where: { gateId_userId: { gateId: req.params.id, userId: req.params.userId } },
      });
      if (!request) throw httpError(404, "No such request");
      if (action === "reject") {
        await prisma.gateJoinRequest.delete({
          where: { gateId_userId: { gateId: req.params.id, userId: req.params.userId } },
        });
        return { ok: true, status: "rejected" };
      }
      const gate = await prisma.gate.findUniqueOrThrow({ where: { id: req.params.id } });
      await prisma.$transaction([
        prisma.gateMember.upsert({
          where: { userId_gateId: { userId: req.params.userId, gateId: req.params.id } },
          create: { userId: req.params.userId, gateId: req.params.id, role: "member" },
          update: {},
        }),
        prisma.gateJoinRequest.delete({
          where: { gateId_userId: { gateId: req.params.id, userId: req.params.userId } },
        }),
      ]);
      await createNotification({
        userId: req.params.userId,
        actorId: user.id,
        kind: "gate_entry_accepted",
        title: "Entry granted",
        safeBody: `You may now enter ${gate.name}.`,
        targetUrl: `/gate/${gate.id}`,
        dedupeKey: `gate-accept:${gate.id}:${req.params.userId}`,
      });
      return { ok: true, status: "accepted" };
    },
  );

  // ── Members ───────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/gates/:id/members", async (req) => {
    const me = await getUser(req);
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).default(1) })
      .parse(req.query);
    const gate = await prisma.gate.findUnique({ where: { id: req.params.id } });
    if (!gate) throw httpError(404, "No such gate");
    const mine = await gateMembership(me?.id, gate.id);
    if (!canViewGate(gate, mine)) throw httpError(404, "No such gate");
    const rankOrder: Record<string, number> = { gatekeeper: 0, warden: 1, member: 2 };
    const members = await prisma.gateMember.findMany({
      where: { gateId: gate.id },
      orderBy: [{ joinedAt: "asc" }],
      skip: (page - 1) * 50,
      take: 50,
    });
    members.sort((a, b) => (rankOrder[a.role] ?? 9) - (rankOrder[b.role] ?? 9));
    const identities = await identitiesForUsers(members.map((m) => m.userId), me?.id);
    return members.map((m) => ({
      userId: m.userId,
      role: m.role,
      approvedPoster: m.approvedPoster,
      joinedAt: m.joinedAt,
      identity: identities.get(m.userId) ?? null,
    }));
  });

  // ── Promote / demote wardens (gatekeeper) ─────────────────────────────
  app.post<{ Params: { id: string; userId: string } }>(
    "/gates/:id/members/:userId/role",
    async (req) => {
      const user = await requireActiveUser(req);
      const { role } = z.object({ role: z.enum(["warden", "member"]) }).parse(req.body);
      const mine = await gateMembership(user.id, req.params.id);
      if (!mine || mine.role !== "gatekeeper") {
        throw httpError(403, "Only the Gatekeeper can change roles");
      }
      if (req.params.userId === user.id) throw httpError(400, "You hold this gate already");
      const target = await gateMembership(req.params.userId, req.params.id);
      if (!target) throw httpError(404, "Not a raider here");
      await prisma.gateMember.update({
        where: { userId_gateId: { userId: req.params.userId, gateId: req.params.id } },
        data: { role },
      });
      return { ok: true, role };
    },
  );

  // ── Authorize posters (mods, sealed gates) ────────────────────────────
  app.post<{ Params: { id: string; userId: string } }>(
    "/gates/:id/members/:userId/approved-poster",
    async (req) => {
      const user = await requireActiveUser(req);
      const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
      await requireGateMod(user.id, req.params.id, "authorize_posters");
      const target = await gateMembership(req.params.userId, req.params.id);
      if (!target) throw httpError(404, "Not a raider here");
      if (MOD_ROLES.includes(target.role)) {
        throw httpError(400, "Wardens can already post");
      }
      await prisma.gateMember.update({
        where: { userId_gateId: { userId: req.params.userId, gateId: req.params.id } },
        data: { approvedPoster: approved },
      });
      return { ok: true, approved };
    },
  );

  // ── Kick (mods) ───────────────────────────────────────────────────────
  app.delete<{ Params: { id: string; userId: string } }>(
    "/gates/:id/members/:userId",
    async (req) => {
      const user = await requireActiveUser(req);
      if (req.params.userId === user.id) throw httpError(400, "Use leave to withdraw yourself");
      const mine = await requireGateMod(user.id, req.params.id, "kick");
      const target = await gateMembership(req.params.userId, req.params.id);
      if (!target) throw httpError(404, "Not a raider here");
      if (target.role === "gatekeeper") throw httpError(403, "You can't remove the Gatekeeper");
      if (target.role === "warden" && mine.role !== "gatekeeper") {
        throw httpError(403, "Only the Gatekeeper can remove a Warden");
      }
      await prisma.gateMember.delete({
        where: { userId_gateId: { userId: req.params.userId, gateId: req.params.id } },
      });
      return { ok: true };
    },
  );

  // ── Edit gate ─────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>("/gates/:id", async (req) => {
    const user = await requireActiveUser(req);
    const patch = editBody.parse(req.body);
    const mine = await requireGateMod(user.id, req.params.id, "edit_info");
    // Renaming and visibility flips reshape the gate itself — gatekeeper only.
    if ((patch.name || patch.visibility) && mine.role !== "gatekeeper") {
      throw httpError(403, "Only the Gatekeeper can rename the gate or change its visibility");
    }
    if (patch.name) validateUserContent(patch.name);
    if (patch.description) validateUserContent(patch.description);
    if (patch.emblemKey && !isGuildEmblem(patch.emblemKey)) throw httpError(400, "Unknown emblem");
    if (patch.name) {
      const clash = await prisma.gate.findFirst({
        where: {
          id: { not: req.params.id },
          name: { equals: patch.name, mode: "insensitive" },
        },
      });
      if (clash) throw httpError(409, "That gate name is taken");
    }
    const updated = await prisma.gate.update({
      where: { id: req.params.id },
      data: {
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.emblemKey ? { emblemKey: patch.emblemKey } : {}),
        ...(patch.primaryColor ? { primaryColor: patch.primaryColor } : {}),
        ...(patch.secondaryColor !== undefined ? { secondaryColor: patch.secondaryColor } : {}),
        ...(patch.visibility ? { visibility: patch.visibility } : {}),
      },
    });
    if (patch.visibility === "private") {
      // Hidden gates never show on the main wall: demote everything promoted.
      await prisma.post.updateMany({
        where: { gateId: req.params.id, promotedAt: { not: null } },
        data: { promotedAt: null },
      });
    }
    return { ok: true, gate: { id: updated.id, name: updated.name } };
  });
}
