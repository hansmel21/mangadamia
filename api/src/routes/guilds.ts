// Guilds: small reader groups with a hall, roster, level, and (via the post
// routes) a members-only wall. See GUILDS_PLAN.md.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUser, requireAcceptedTerms, requireActiveUser } from "../auth.js";
import { prisma } from "../db/client.js";
import {
  currentWeekKey,
  decorationMinLevel,
  ensureGuildEvent,
  finalizePastWars,
  GUILD_DECORATIONS,
  guildEventTitle,
  guildLevelForXp,
  guildPerks,
  guildMemberCap,
  guildPower,
  guildXpForLevel,
  isGuildEmblem,
  RAID_BONUS_XP,
  raidTargetForGuild,
  warScoreForGuild,
  weekEndsAt,
  weekNumber,
} from "../guilds.js";
import { identitiesForUsers } from "../identity.js";
import { createNotification } from "../notifications.js";
import {
  GUILD_PERM_KEYS,
  guildCan,
  hasGuildPerm,
  roleToggleState,
  type GuildPermKey,
} from "../permissions.js";
import { GUILD_CREATE_MIN_LEVEL } from "../progression.js";
import { levelForXp } from "../badges.js";
import { validateUserContent } from "../policy.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const createBody = z.object({
  name: z.string().trim().min(3).max(30),
  tag: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .regex(/^[a-zA-Z0-9]+$/, "letters and numbers only"),
  emblemKey: z.string().min(1),
  primaryColor: z.string().regex(HEX),
  secondaryColor: z.string().regex(HEX).nullable().optional(),
  motto: z.string().trim().max(80).nullable().optional(),
});

const editBody = z.object({
  name: z.string().trim().min(3).max(30).optional(),
  tag: z.string().trim().min(2).max(5).regex(/^[a-zA-Z0-9]+$/).optional(),
  emblemKey: z.string().min(1).optional(),
  primaryColor: z.string().regex(HEX).optional(),
  secondaryColor: z.string().regex(HEX).nullable().optional(),
  motto: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  joinPolicy: z.enum(["open", "request", "invite"]).optional(),
  decorationKey: z.string().nullable().optional(),
});

export function registerGuildRoutes(app: FastifyInstance): void {
  const officerRoles = ["guildmaster", "officer"];

  async function requireMembership(userId: string) {
    const m = await prisma.guildMember.findUnique({ where: { userId } });
    if (!m) throw httpError(404, "You're not in a guild");
    return m;
  }

  // Permission-toggle gate: officer powers are configurable per guild (the
  // guildmaster always passes). Replaces the old flat officerRoles check.
  async function requireGuildPerm(userId: string, guildId: string, key: GuildPermKey) {
    const membership = await requireMembership(userId);
    if (membership.guildId !== guildId) throw httpError(403, "You can't manage this guild");
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { permissions: true },
    });
    if (!guild || !hasGuildPerm(guild, membership, key)) {
      throw httpError(403, "You can't manage this guild");
    }
    return membership;
  }

  // ── Create ────────────────────────────────────────────────────────────
  app.post(
    "/guilds",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const user = await requireAcceptedTerms(req);
      const { name, tag, emblemKey, primaryColor, secondaryColor, motto } = createBody.parse(
        req.body,
      );
      // Founding a guild is a milestone privilege — keeps day-one spam guilds out.
      if (levelForXp(user.xp) < GUILD_CREATE_MIN_LEVEL) {
        throw httpError(
          403,
          `Founding a guild unlocks at Hunter LV ${GUILD_CREATE_MIN_LEVEL} — keep reading and posting!`,
        );
      }
      validateUserContent(name);
      if (motto) validateUserContent(motto);
      if (!isGuildEmblem(emblemKey)) throw httpError(400, "Unknown emblem");
      const existing = await prisma.guildMember.findUnique({ where: { userId: user.id } });
      if (existing) throw httpError(409, "You're already in a guild — leave it first");
      const clash = await prisma.guild.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: "insensitive" } },
            { tag: { equals: tag, mode: "insensitive" } },
          ],
        },
      });
      if (clash) {
        throw httpError(
          409,
          clash.name.toLowerCase() === name.toLowerCase()
            ? "That guild name is taken"
            : "That guild tag is taken",
        );
      }
      const guild = await prisma.guild.create({
        data: {
          name,
          tag: tag.toUpperCase(),
          emblemKey,
          primaryColor,
          secondaryColor: secondaryColor ?? null,
          motto: motto ?? null,
          guildmasterId: user.id,
          members: {
            create: { userId: user.id, role: "guildmaster", weekKey: currentWeekKey() },
          },
        },
      });
      return { id: guild.id };
    },
  );

  // ── Browse + leaderboard ──────────────────────────────────────────────
  app.get("/guilds", async (req) => {
    const me = await getUser(req);
    const { q, sort } = z
      .object({
        q: z.string().trim().max(60).optional(),
        sort: z.enum(["level", "new"]).default("level"),
      })
      .parse(req.query);
    const guilds = await prisma.guild.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { tag: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: sort === "new" ? { createdAt: "desc" } : { xp: "desc" },
      take: 50,
      include: { _count: { select: { members: true } } },
    });
    const [myMembership, weekWars] = await Promise.all([
      me ? prisma.guildMember.findUnique({ where: { userId: me.id } }) : null,
      prisma.guildWar.findMany({
        where: { weekKey: currentWeekKey() },
        select: { guildAId: true, guildBId: true },
      }),
    ]);
    const atWarIds = new Set(weekWars.flatMap((w) => [w.guildAId, w.guildBId]));
    return guilds.map((g, index) => {
      const level = guildLevelForXp(g.xp);
      return {
        id: g.id,
        name: g.name,
        tag: g.tag,
        emblemKey: g.emblemKey,
        primaryColor: g.primaryColor,
        secondaryColor: g.secondaryColor,
        motto: g.motto,
        level,
        xp: g.xp,
        memberCount: g._count.members,
        memberCap: guildMemberCap(level),
        joinPolicy: g.joinPolicy,
        atWar: atWarIds.has(g.id),
        rank: sort === "level" ? index + 1 : null,
        mine: myMembership?.guildId === g.id,
      };
    });
  });

  // ── Hall detail ───────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/guilds/:id", async (req) => {
    const me = await getUser(req);
    const guild = await prisma.guild.findUnique({
      where: { id: req.params.id },
      include: { members: { orderBy: [{ contributionXp: "desc" }] } },
    });
    if (!guild) throw httpError(404, "No such guild");
    const memberIds = guild.members.map((m) => m.userId);
    const [identities, memberUsers, myMembership] = await Promise.all([
      identitiesForUsers(memberIds, me?.id),
      prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, xp: true, lastActiveAt: true },
      }),
      me ? prisma.guildMember.findUnique({ where: { userId: me.id } }) : null,
    ]);
    // Presence: active in the last 10 minutes (lastActiveAt bumps ≤ every 5).
    const onlineCutoff = Date.now() - 10 * 60 * 1000;
    const onlineIds = new Set(
      memberUsers.filter((u) => u.lastActiveAt.getTime() >= onlineCutoff).map((u) => u.id),
    );
    const lastActiveById = new Map(memberUsers.map((u) => [u.id, u.lastActiveAt]));
    const level = guildLevelForXp(guild.xp);
    const isMember = myMembership?.guildId === guild.id;
    // Per-capability truth for the client; canManage stays as the umbrella
    // "sees the management surfaces" flag.
    const can = guildCan(guild, isMember ? myMembership : null);
    const canManage = isMember && officerRoles.includes(myMembership!.role);
    const [myRequest, myInvite, requests, invites] = await Promise.all([
      me && !isMember
        ? prisma.guildJoinRequest.findUnique({
            where: { guildId_userId: { guildId: guild.id, userId: me.id } },
          })
        : null,
      me && !isMember
        ? prisma.guildInvite.findUnique({
            where: { guildId_userId: { guildId: guild.id, userId: me.id } },
          })
        : null,
      canManage
        ? prisma.guildJoinRequest.findMany({ where: { guildId: guild.id }, orderBy: { createdAt: "asc" } })
        : [],
      canManage
        ? prisma.guildInvite.findMany({ where: { guildId: guild.id }, orderBy: { createdAt: "asc" } })
        : [],
    ]);
    const extraIds = [
      ...new Set([
        ...requests.map((r) => r.userId),
        ...invites.flatMap((i) => [i.userId, i.invitedById]),
      ]),
    ];
    const requestIdentities = extraIds.length
      ? await identitiesForUsers(extraIds, me?.id)
      : new Map();
    const rankOrder: Record<string, number> = { guildmaster: 0, officer: 1, member: 2 };
    return {
      id: guild.id,
      name: guild.name,
      tag: guild.tag,
      emblemKey: guild.emblemKey,
      primaryColor: guild.primaryColor,
      secondaryColor: guild.secondaryColor,
      motto: guild.motto,
      description: guild.description,
      decorationKey: guild.decorationKey,
      joinPolicy: guild.joinPolicy,
      guildmasterId: guild.guildmasterId,
      level,
      perks: guildPerks(level),
      decorations: GUILD_DECORATIONS.map((d) => ({
        key: d.key,
        name: d.name,
        minLevel: d.minLevel,
        unlocked: level >= d.minLevel,
      })),
      xp: guild.xp,
      xpFloor: guildXpForLevel(level),
      xpForNextLevel: guildXpForLevel(level + 1),
      power: guildPower(memberUsers.map((u) => u.xp)),
      memberCount: guild.members.length,
      memberCap: guildMemberCap(level),
      onlineCount: onlineIds.size,
      myRole: isMember ? myMembership!.role : null,
      can,
      // Toggle state for the settings screen (guildmaster reads/writes it).
      officerPermissions:
        isMember && myMembership!.role === "guildmaster"
          ? roleToggleState(guild.permissions, "officer", GUILD_PERM_KEYS)
          : null,
      inAnotherGuild: !!myMembership && !isMember,
      joinRequestPending: !!myRequest,
      invitePending: !!myInvite,
      members: guild.members
        .map((m) => ({
          role: m.role,
          contributionXp: m.contributionXp,
          weeklyXp: m.weeklyXp,
          joinedAt: m.joinedAt,
          online: onlineIds.has(m.userId),
          lastActiveAt: lastActiveById.get(m.userId) ?? null,
          identity: identities.get(m.userId) ?? null,
        }))
        .sort(
          (a, b) =>
            (rankOrder[a.role] ?? 3) - (rankOrder[b.role] ?? 3) ||
            b.contributionXp - a.contributionXp,
        ),
      pendingRequests: requests.map((r) => ({
        identity: requestIdentities.get(r.userId) ?? null,
        requestedAt: r.createdAt,
      })),
      pendingInvites: invites.map((i) => ({
        identity: requestIdentities.get(i.userId) ?? null,
        invitedBy: requestIdentities.get(i.invitedById) ?? null,
        invitedAt: i.createdAt,
      })),
    };
  });

  // ── Join ──────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/guilds/:id/join", async (req) => {
    const user = await requireActiveUser(req);
    const guild = await prisma.guild.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { members: true } } },
    });
    if (!guild) throw httpError(404, "No such guild");
    const existing = await prisma.guildMember.findUnique({ where: { userId: user.id } });
    if (existing) {
      throw httpError(
        409,
        existing.guildId === guild.id ? "You're already in this guild" : "You're already in a guild",
      );
    }
    if (guild.joinPolicy === "invite") {
      throw httpError(403, "This guild is invite-only");
    }
    if (guild.joinPolicy === "request") {
      await prisma.guildJoinRequest.upsert({
        where: { guildId_userId: { guildId: guild.id, userId: user.id } },
        create: { guildId: guild.id, userId: user.id },
        update: {},
      });
      await createNotification({
        userId: guild.guildmasterId,
        actorId: user.id,
        kind: "guild_join_request",
        title: "Guild join request",
        safeBody: `@${user.username} asked to join ${guild.name}.`,
        targetUrl: `/guild/${guild.id}`,
        dedupeKey: `guild-req:${guild.id}:${user.id}`,
      });
      return { status: "requested" };
    }
    // open
    if (guild._count.members >= guildMemberCap(guildLevelForXp(guild.xp))) {
      throw httpError(409, "This guild is full");
    }
    await prisma.guildMember.create({
      data: { userId: user.id, guildId: guild.id, role: "member", weekKey: currentWeekKey() },
    });
    return { status: "joined" };
  });

  // ── Leave (self) ──────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/guilds/:id/leave", async (req) => {
    const user = await requireActiveUser(req);
    const membership = await requireMembership(user.id);
    if (membership.guildId !== req.params.id) throw httpError(400, "You're not in this guild");
    if (membership.role === "guildmaster") {
      const others = await prisma.guildMember.findMany({
        where: { guildId: membership.guildId, userId: { not: user.id } },
        orderBy: [{ joinedAt: "asc" }],
      });
      if (others.length === 0) {
        // Last one out dissolves the guild.
        await prisma.guild.delete({ where: { id: membership.guildId } });
        return { status: "dissolved" };
      }
      const heir = others.find((m) => m.role === "officer") ?? others[0];
      await prisma.$transaction([
        prisma.guildMember.update({ where: { userId: heir.userId }, data: { role: "guildmaster" } }),
        prisma.guild.update({
          where: { id: membership.guildId },
          data: { guildmasterId: heir.userId },
        }),
        prisma.guildMember.delete({ where: { userId: user.id } }),
      ]);
      await createNotification({
        userId: heir.userId,
        actorId: user.id,
        kind: "guild_promoted",
        title: "You're the Guildmaster",
        safeBody: `@${user.username} left and passed you leadership.`,
        targetUrl: `/guild/${membership.guildId}`,
        dedupeKey: `guild-gm:${membership.guildId}:${heir.userId}:${Date.now()}`,
      });
      return { status: "left" };
    }
    await prisma.guildMember.delete({ where: { userId: user.id } });
    return { status: "left" };
  });

  // ── Approve / reject a join request (officers) ────────────────────────
  app.post<{ Params: { id: string; userId: string } }>(
    "/guilds/:id/requests/:userId",
    async (req) => {
      const user = await requireActiveUser(req);
      const { action } = z.object({ action: z.enum(["accept", "reject"]) }).parse(req.body);
      await requireGuildPerm(user.id, req.params.id, "approve_requests");
      const request = await prisma.guildJoinRequest.findUnique({
        where: { guildId_userId: { guildId: req.params.id, userId: req.params.userId } },
      });
      if (!request) throw httpError(404, "No such request");
      if (action === "reject") {
        await prisma.guildJoinRequest.delete({
          where: { guildId_userId: { guildId: req.params.id, userId: req.params.userId } },
        });
        return { ok: true, status: "rejected" };
      }
      const already = await prisma.guildMember.findUnique({ where: { userId: req.params.userId } });
      if (already) {
        await prisma.guildJoinRequest.delete({
          where: { guildId_userId: { guildId: req.params.id, userId: req.params.userId } },
        });
        throw httpError(409, "That reader already joined a guild");
      }
      const guild = await prisma.guild.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { _count: { select: { members: true } } },
      });
      if (guild._count.members >= guildMemberCap(guildLevelForXp(guild.xp))) {
        throw httpError(409, "Your guild is full");
      }
      await prisma.$transaction([
        prisma.guildMember.create({
          data: {
            userId: req.params.userId,
            guildId: req.params.id,
            role: "member",
            weekKey: currentWeekKey(),
          },
        }),
        prisma.guildJoinRequest.delete({
          where: { guildId_userId: { guildId: req.params.id, userId: req.params.userId } },
        }),
      ]);
      await createNotification({
        userId: req.params.userId,
        actorId: user.id,
        kind: "guild_accepted",
        title: "Guild request accepted",
        safeBody: `You joined ${guild.name}.`,
        targetUrl: `/guild/${guild.id}`,
        dedupeKey: `guild-accept:${guild.id}:${req.params.userId}`,
      });
      return { ok: true, status: "accepted" };
    },
  );

  // ── Invite a reader by username (officers) ────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/guilds/:id/invites",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (req) => {
      const user = await requireActiveUser(req);
      const { username } = z
        .object({ username: z.string().trim().min(1).max(30) })
        .parse(req.body);
      await requireGuildPerm(user.id, req.params.id, "invite");
      const target = await prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
        select: { id: true, username: true, status: true },
      });
      if (!target || target.status !== "active") throw httpError(404, "No reader by that name");
      const [guild, targetMembership] = await Promise.all([
        prisma.guild.findUniqueOrThrow({
          where: { id: req.params.id },
          include: { _count: { select: { members: true } } },
        }),
        prisma.guildMember.findUnique({ where: { userId: target.id } }),
      ]);
      if (targetMembership) {
        throw httpError(
          409,
          targetMembership.guildId === guild.id
            ? "They're already a member"
            : "That reader is already in a guild",
        );
      }
      if (guild._count.members >= guildMemberCap(guildLevelForXp(guild.xp))) {
        throw httpError(409, "Your guild is full");
      }
      // If they already asked to join, the invite is an acceptance.
      const request = await prisma.guildJoinRequest.findUnique({
        where: { guildId_userId: { guildId: guild.id, userId: target.id } },
      });
      if (request) {
        await prisma.$transaction([
          prisma.guildMember.create({
            data: { userId: target.id, guildId: guild.id, role: "member", weekKey: currentWeekKey() },
          }),
          prisma.guildJoinRequest.deleteMany({ where: { userId: target.id } }),
          prisma.guildInvite.deleteMany({ where: { userId: target.id } }),
        ]);
        await createNotification({
          userId: target.id,
          actorId: user.id,
          kind: "guild_accepted",
          title: "Guild request accepted",
          safeBody: `You joined ${guild.name}.`,
          targetUrl: `/guild/${guild.id}`,
          dedupeKey: `guild-accept:${guild.id}:${target.id}`,
        });
        return { status: "joined", username: target.username };
      }
      const existing = await prisma.guildInvite.findUnique({
        where: { guildId_userId: { guildId: guild.id, userId: target.id } },
      });
      if (existing) throw httpError(409, "Already invited — waiting on their answer");
      await prisma.guildInvite.create({
        data: { guildId: guild.id, userId: target.id, invitedById: user.id },
      });
      await createNotification({
        userId: target.id,
        actorId: user.id,
        kind: "guild_invite",
        title: "Guild invitation",
        safeBody: `@${user.username} invited you to join ${guild.name}.`,
        targetUrl: `/guild/${guild.id}`,
        dedupeKey: `guild-invite:${guild.id}:${target.id}`,
      });
      return { status: "invited", username: target.username };
    },
  );

  // ── Answer my invitation ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/guilds/:id/invites/respond", async (req) => {
    const user = await requireActiveUser(req);
    const { action } = z.object({ action: z.enum(["accept", "decline"]) }).parse(req.body);
    const invite = await prisma.guildInvite.findUnique({
      where: { guildId_userId: { guildId: req.params.id, userId: user.id } },
    });
    if (!invite) throw httpError(404, "That invitation is gone");
    if (action === "decline") {
      await prisma.guildInvite.delete({
        where: { guildId_userId: { guildId: req.params.id, userId: user.id } },
      });
      return { status: "declined" };
    }
    const existing = await prisma.guildMember.findUnique({ where: { userId: user.id } });
    if (existing) throw httpError(409, "You're already in a guild — leave it first");
    const guild = await prisma.guild.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { _count: { select: { members: true } } },
    });
    if (guild._count.members >= guildMemberCap(guildLevelForXp(guild.xp))) {
      throw httpError(409, "This guild is full");
    }
    await prisma.$transaction([
      prisma.guildMember.create({
        data: { userId: user.id, guildId: guild.id, role: "member", weekKey: currentWeekKey() },
      }),
      // Joining voids their other pending invites and join requests.
      prisma.guildInvite.deleteMany({ where: { userId: user.id } }),
      prisma.guildJoinRequest.deleteMany({ where: { userId: user.id } }),
    ]);
    await createNotification({
      userId: invite.invitedById,
      actorId: user.id,
      kind: "guild_invite_accepted",
      title: "Invitation accepted",
      safeBody: `@${user.username} joined ${guild.name}.`,
      targetUrl: `/guild/${guild.id}`,
      dedupeKey: `guild-invite-accept:${guild.id}:${user.id}`,
    });
    return { status: "joined" };
  });

  // ── Revoke an invitation (officers) ───────────────────────────────────
  app.delete<{ Params: { id: string; userId: string } }>(
    "/guilds/:id/invites/:userId",
    async (req) => {
      const user = await requireActiveUser(req);
      await requireGuildPerm(user.id, req.params.id, "invite");
      await prisma.guildInvite.deleteMany({
        where: { guildId: req.params.id, userId: req.params.userId },
      });
      return { ok: true };
    },
  );

  // ── Kick a member (officers) ──────────────────────────────────────────
  app.delete<{ Params: { id: string; userId: string } }>(
    "/guilds/:id/members/:userId",
    async (req) => {
      const user = await requireActiveUser(req);
      if (req.params.userId === user.id) throw httpError(400, "Use leave to exit your own guild");
      const membership = await requireGuildPerm(user.id, req.params.id, "kick");
      const target = await prisma.guildMember.findUnique({ where: { userId: req.params.userId } });
      if (!target || target.guildId !== req.params.id) throw httpError(404, "Not a member");
      if (target.role === "guildmaster") throw httpError(403, "You can't remove the Guildmaster");
      if (target.role === "officer" && membership.role !== "guildmaster") {
        throw httpError(403, "Only the Guildmaster can remove an officer");
      }
      await prisma.guildMember.delete({ where: { userId: req.params.userId } });
      return { ok: true };
    },
  );

  // ── Change a member's role (guildmaster) ──────────────────────────────
  app.post<{ Params: { id: string; userId: string } }>(
    "/guilds/:id/members/:userId/role",
    async (req) => {
      const user = await requireActiveUser(req);
      const { role } = z
        .object({ role: z.enum(["officer", "member", "guildmaster"]) })
        .parse(req.body);
      const membership = await requireMembership(user.id);
      if (membership.guildId !== req.params.id || membership.role !== "guildmaster") {
        throw httpError(403, "Only the Guildmaster can change roles");
      }
      const target = await prisma.guildMember.findUnique({ where: { userId: req.params.userId } });
      if (!target || target.guildId !== req.params.id) throw httpError(404, "Not a member");
      if (req.params.userId === user.id) throw httpError(400, "You already lead this guild");
      if (role === "guildmaster") {
        // Transfer leadership; current master becomes an officer.
        await prisma.$transaction([
          prisma.guildMember.update({ where: { userId: req.params.userId }, data: { role: "guildmaster" } }),
          prisma.guildMember.update({ where: { userId: user.id }, data: { role: "officer" } }),
          prisma.guild.update({ where: { id: req.params.id }, data: { guildmasterId: req.params.userId } }),
        ]);
        await createNotification({
          userId: req.params.userId,
          actorId: user.id,
          kind: "guild_promoted",
          title: "You're the Guildmaster",
          safeBody: `@${user.username} passed you leadership.`,
          targetUrl: `/guild/${req.params.id}`,
          dedupeKey: `guild-gm:${req.params.id}:${req.params.userId}:${Date.now()}`,
        });
        return { ok: true, role };
      }
      await prisma.guildMember.update({ where: { userId: req.params.userId }, data: { role } });
      return { ok: true, role };
    },
  );

  // ── Edit guild (officers with the edit_info permission) ───────────────
  app.patch<{ Params: { id: string } }>("/guilds/:id", async (req) => {
    const user = await requireActiveUser(req);
    const patch = editBody.parse(req.body);
    await requireGuildPerm(user.id, req.params.id, "edit_info");
    if (patch.name) validateUserContent(patch.name);
    if (patch.motto) validateUserContent(patch.motto);
    if (patch.description) validateUserContent(patch.description);
    if (patch.emblemKey && !isGuildEmblem(patch.emblemKey)) throw httpError(400, "Unknown emblem");
    if (patch.decorationKey) {
      const minLevel = decorationMinLevel(patch.decorationKey);
      if (minLevel === null) throw httpError(400, "Unknown decoration");
      const current = await prisma.guild.findUniqueOrThrow({
        where: { id: req.params.id },
        select: { xp: true },
      });
      if (guildLevelForXp(current.xp) < minLevel) {
        throw httpError(403, `That decoration unlocks at guild LV ${minLevel}`);
      }
    }
    if (patch.name || patch.tag) {
      const clash = await prisma.guild.findFirst({
        where: {
          id: { not: req.params.id },
          OR: [
            ...(patch.name ? [{ name: { equals: patch.name, mode: "insensitive" as const } }] : []),
            ...(patch.tag ? [{ tag: { equals: patch.tag, mode: "insensitive" as const } }] : []),
          ],
        },
      });
      if (clash) throw httpError(409, "That guild name or tag is taken");
    }
    const updated = await prisma.guild.update({
      where: { id: req.params.id },
      data: {
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.tag ? { tag: patch.tag.toUpperCase() } : {}),
        ...(patch.emblemKey ? { emblemKey: patch.emblemKey } : {}),
        ...(patch.primaryColor ? { primaryColor: patch.primaryColor } : {}),
        ...(patch.secondaryColor !== undefined ? { secondaryColor: patch.secondaryColor } : {}),
        ...(patch.motto !== undefined ? { motto: patch.motto } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.joinPolicy ? { joinPolicy: patch.joinPolicy } : {}),
        ...(patch.decorationKey !== undefined ? { decorationKey: patch.decorationKey } : {}),
      },
    });
    return { ok: true, guild: { id: updated.id, name: updated.name, tag: updated.tag } };
  });

  // ── Officer permission toggles (guildmaster only) ─────────────────────
  // Deliberately its own endpoint: PATCH /guilds/:id is officer-reachable,
  // and officers must not be able to widen their own powers.
  app.put<{ Params: { id: string } }>("/guilds/:id/permissions", async (req) => {
    const user = await requireActiveUser(req);
    const membership = await requireMembership(user.id);
    if (membership.guildId !== req.params.id || membership.role !== "guildmaster") {
      throw httpError(403, "Only the Guildmaster can change officer permissions");
    }
    const toggles = z
      .object(
        Object.fromEntries(GUILD_PERM_KEYS.map((key) => [key, z.boolean()])) as Record<
          (typeof GUILD_PERM_KEYS)[number],
          z.ZodBoolean
        >,
      )
      .parse(req.body);
    await prisma.guild.update({
      where: { id: req.params.id },
      data: { permissions: { officer: toggles } },
    });
    return { ok: true, officerPermissions: toggles };
  });

  // ── Guild War: this week's head-to-head ───────────────────────────────
  // Wars pair lazily: the first member to open the war window this week
  // triggers matchmaking against the nearest-XP guild that's still unpaired.
  // Scores derive from members' weekly contribution (weeklyXp) and are
  // snapshotted onto the war row on every read, so the final pre-rollover
  // write stands as the result in history.
  const warSide = (g: {
    id: string;
    name: string;
    tag: string;
    emblemKey: string;
    primaryColor: string;
    secondaryColor: string | null;
  }) => ({
    id: g.id,
    name: g.name,
    tag: g.tag,
    emblemKey: g.emblemKey,
    primaryColor: g.primaryColor,
    secondaryColor: g.secondaryColor,
  });

  app.get<{ Params: { id: string } }>("/guilds/:id/war", async (req) => {
    const me = await getUser(req);
    const guildId = req.params.id;
    const weekKey = currentWeekKey();
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw httpError(404, "No such guild");

    let war = await prisma.guildWar.findFirst({
      where: { weekKey, OR: [{ guildAId: guildId }, { guildBId: guildId }] },
    });
    if (!war) {
      // Only a member of this guild can trigger matchmaking.
      const membership = me
        ? await prisma.guildMember.findUnique({ where: { userId: me.id } })
        : null;
      if (!membership || membership.guildId !== guildId) return { war: null };
      const busy = await prisma.guildWar.findMany({
        where: { weekKey },
        select: { guildAId: true, guildBId: true },
      });
      const busyIds = new Set(busy.flatMap((w) => [w.guildAId, w.guildBId]));
      busyIds.add(guildId);
      const candidates = await prisma.guild.findMany({
        where: { id: { notIn: [...busyIds] }, members: { some: {} } },
        select: { id: true, xp: true },
      });
      if (candidates.length === 0) return { war: null };
      const opponent = candidates.reduce((best, c) =>
        Math.abs(c.xp - guild.xp) < Math.abs(best.xp - guild.xp) ? c : best,
      );
      try {
        war = await prisma.guildWar.create({
          data: { weekKey, guildAId: guildId, guildBId: opponent.id },
        });
      } catch {
        // Concurrent matchmaking — take whichever pairing won the race.
        war = await prisma.guildWar.findFirst({
          where: { weekKey, OR: [{ guildAId: guildId }, { guildBId: guildId }] },
        });
        if (!war) return { war: null };
      }
    }

    const [scoreA, scoreB, guildA, guildB] = await Promise.all([
      warScoreForGuild(war.guildAId, war.weekKey),
      warScoreForGuild(war.guildBId, war.weekKey),
      prisma.guild.findUniqueOrThrow({ where: { id: war.guildAId } }),
      prisma.guild.findUniqueOrThrow({ where: { id: war.guildBId } }),
    ]);
    // Snapshot live scores so history has finals after the week rolls over.
    await prisma.guildWar.update({ where: { id: war.id }, data: { scoreA, scoreB } });
    return {
      war: {
        id: war.id,
        weekKey: war.weekKey,
        weekNo: weekNumber(war.weekKey),
        endsAt: weekEndsAt(war.weekKey),
        sideA: { ...warSide(guildA), score: scoreA },
        sideB: { ...warSide(guildB), score: scoreB },
      },
    };
  });

  // ── War history ───────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/guilds/:id/wars", async (req) => {
    // Lazy fallback: freeze + pay any wars the scheduled tick hasn't yet.
    await finalizePastWars();
    const guildId = req.params.id;
    const weekKey = currentWeekKey();
    const wars = await prisma.guildWar.findMany({
      where: {
        OR: [{ guildAId: guildId }, { guildBId: guildId }],
        weekKey: { not: weekKey }, // history = finished weeks only
      },
      orderBy: { weekKey: "desc" },
      take: 12,
      include: { guildA: true, guildB: true },
    });
    return wars.map((w) => {
      const mineIsA = w.guildAId === guildId;
      const myScore = mineIsA ? w.scoreA : w.scoreB;
      const theirScore = mineIsA ? w.scoreB : w.scoreA;
      return {
        id: w.id,
        weekKey: w.weekKey,
        weekNo: weekNumber(w.weekKey),
        opponent: warSide(mineIsA ? w.guildB : w.guildA),
        myScore,
        theirScore,
        result: myScore > theirScore ? "won" : myScore < theirScore ? "lost" : "draw",
      };
    });
  });

  // ── Guild Raid: this week's shared objective ──────────────────────────
  app.get<{ Params: { id: string } }>("/guilds/:id/raid", async (req) => {
    const me = await getUser(req);
    const guildId = req.params.id;
    const weekKey = currentWeekKey();
    const [guild, memberCount, row] = await Promise.all([
      prisma.guild.findUnique({ where: { id: guildId } }),
      prisma.guildMember.count({ where: { guildId } }),
      prisma.guildRaidProgress.findUnique({
        where: { guildId_weekKey: { guildId, weekKey } },
      }),
    ]);
    if (!guild) throw httpError(404, "No such guild");
    // The viewer's share: chapters they completed this week (first-completion
    // events, same window the raid ticks on).
    const myMembership = me
      ? await prisma.guildMember.findUnique({ where: { userId: me.id } })
      : null;
    const myShare =
      me && myMembership?.guildId === guildId
        ? (
            await prisma.activityEvent.groupBy({
              by: ["eventKey"],
              where: {
                userId: me.id,
                type: "chapter_completed",
                reversedAt: null,
                createdAt: { gte: new Date(`${weekKey}T00:00:00Z`) },
              },
            })
          ).length
        : null;
    return {
      weekKey,
      weekNo: weekNumber(weekKey),
      target: raidTargetForGuild(memberCount),
      progress: row?.progress ?? 0,
      completed: !!row?.claimedAt,
      bonusXp: RAID_BONUS_XP,
      resetsAt: weekEndsAt(weekKey),
      myShare,
    };
  });

  // ── Guild Event: this week's rotating co-op side quest ────────────────
  app.get<{ Params: { id: string } }>("/guilds/:id/event", async (req) => {
    const me = await getUser(req);
    const guildId = req.params.id;
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw httpError(404, "No such guild");
    const event = await ensureGuildEvent(guildId);
    const myMembership = me
      ? await prisma.guildMember.findUnique({ where: { userId: me.id } })
      : null;
    const myShare =
      me && myMembership?.guildId === guildId
        ? ((
            await prisma.guildEventContribution.findUnique({
              where: { eventId_userId: { eventId: event.id, userId: me.id } },
            })
          )?.value ?? 0)
        : null;
    return {
      weekKey: event.weekKey,
      weekNo: weekNumber(event.weekKey),
      eventType: event.eventType,
      title: guildEventTitle(event.eventType, event.target),
      target: event.target,
      progress: Math.min(event.progress, event.target),
      completed: !!event.completedAt,
      bonusXp: event.bonusXp,
      resetsAt: weekEndsAt(event.weekKey),
      myShare,
    };
  });

  // ── Event history (finished weeks) ────────────────────────────────────
  app.get<{ Params: { id: string } }>("/guilds/:id/events", async (req) => {
    const weekKey = currentWeekKey();
    const events = await prisma.guildEvent.findMany({
      where: { guildId: req.params.id, weekKey: { not: weekKey } },
      orderBy: { weekKey: "desc" },
      take: 12,
    });
    return events.map((e) => ({
      id: e.id,
      weekKey: e.weekKey,
      weekNo: weekNumber(e.weekKey),
      eventType: e.eventType,
      title: guildEventTitle(e.eventType, e.target),
      target: e.target,
      progress: Math.min(e.progress, e.target),
      completed: !!e.completedAt,
      bonusXp: e.bonusXp,
    }));
  });

  // ── My guild shortcut ─────────────────────────────────────────────────
  app.get("/me/guild", async (req) => {
    const user = await getUser(req);
    if (!user) return { guildId: null };
    const membership = await prisma.guildMember.findUnique({ where: { userId: user.id } });
    return { guildId: membership?.guildId ?? null, role: membership?.role ?? null };
  });
}
