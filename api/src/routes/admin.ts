import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ROLES, capabilitiesFor, requireCapability, verifyPassword } from "../auth.js";
import { createAnnouncement } from "../announcements.js";
import { prisma } from "../db/client.js";
import { createNotification } from "../notifications.js";
import { identitiesForUsers } from "../identity.js";
import { evaluateBadges } from "../badges.js";
import {
  actionBody,
  applyModerationAction,
  jsonSnapshot,
  requireAction,
  restoreContent,
  targetSnapshot,
  targetUserId,
  type ModAction,
} from "../moderation.js";
import { restoreActivityForContent, restoreDirectContentXp } from "../quests.js";

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get("/admin/reports", async (req) => {
    const moderator = await requireCapability(req, "view_reports");
    const { status } = z
      .object({ status: z.enum(["pending", "resolved", "dismissed"]).default("pending") })
      .parse(req.query);
    const reports = await prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { reporter: { select: { id: true, username: true } } },
    });
    const snapshots = await Promise.all(
      reports.map((report) => targetSnapshot(report.targetType, report.targetId)),
    );
    const identityIds = reports.flatMap((report, index) => {
      const snapshot = snapshots[index] as { id?: string; userId?: string } | null;
      const targetIdentityId = report.targetType === "user" ? snapshot?.id : snapshot?.userId;
      return [report.reporter.id, ...(targetIdentityId ? [targetIdentityId] : [])];
    });
    const identities = await identitiesForUsers(identityIds, moderator.id);
    return {
      capabilities: capabilitiesFor(moderator.role),
      reports: reports.map((report, index) => {
        const target = snapshots[index] as { id?: string; userId?: string } | null;
        const targetIdentityId = report.targetType === "user" ? target?.id : target?.userId;
        return {
          ...report,
          reporter: {
            ...report.reporter,
            identity: identities.get(report.reporter.id) ?? null,
          },
          target,
          targetIdentity: targetIdentityId ? identities.get(targetIdentityId) ?? null : null,
        };
      }),
    };
  });

  app.post<{ Params: { id: string } }>("/admin/reports/:id/action", async (req) => {
    const input = actionBody.parse(req.body);
    const moderator = await requireAction(req, input.action);
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
    if (report.status !== "pending") {
      throw Object.assign(new Error("Report has already been reviewed"), { statusCode: 409 });
    }
    if (input.action === "correct_spoiler" && report.targetType === "user") {
      throw Object.assign(new Error("A user profile has no spoiler flag"), { statusCode: 400 });
    }
    await applyModerationAction({
      moderator,
      targetType: report.targetType,
      targetId: report.targetId,
      input,
      reportId: report.id,
      requestId: req.id,
    });
    return { ok: true };
  });

  // ── Content audit: browse EVERYTHING, not just reported items ─────────
  app.get("/admin/content", async (req) => {
    await requireCapability(req, "view_reports");
    const q = z
      .object({
        type: z.enum(["post", "comment"]).default("post"),
        q: z.string().trim().max(200).optional(),
        username: z.string().trim().max(30).optional(),
        status: z.enum(["visible", "removed", "gate_removed", "all"]).default("all"),
        kind: z.string().trim().max(30).optional(),
        reported: z.coerce.boolean().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const author = q.username
      ? await prisma.user.findFirst({
          where: { username: { equals: q.username, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    if (q.username && !author) return { total: 0, page: q.page, items: [] };
    const where = {
      ...(q.q ? { body: { contains: q.q, mode: "insensitive" as const } } : {}),
      ...(author ? { userId: author.id } : {}),
      ...(q.status !== "all" ? { moderationStatus: q.status } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } }
        : {}),
    };
    if (q.type === "post") {
      const postWhere = { ...where, ...(q.kind ? { kind: q.kind } : {}) };
      const [total, rows] = await Promise.all([
        prisma.post.count({ where: postWhere }),
        prisma.post.findMany({
          where: postWhere,
          orderBy: { createdAt: "desc" },
          skip: (q.page - 1) * 25,
          take: 25,
          include: { _count: { select: { likes: true, replies: true } } },
        }),
      ]);
      const ids = rows.map((r) => r.id);
      const [reports, identities] = await Promise.all([
        ids.length
          ? prisma.report.groupBy({
              by: ["targetId"],
              where: { targetType: "post", targetId: { in: ids } },
              _count: true,
            })
          : [],
        identitiesForUsers(rows.map((r) => r.userId)),
      ]);
      const reportsById = new Map(reports.map((r) => [r.targetId, r._count]));
      let items = rows.map((r) => ({
        id: r.id,
        type: "post" as const,
        body: r.body,
        kind: r.kind,
        isSpoiler: r.isSpoiler,
        isOfficial: r.isOfficial,
        guildId: r.guildId,
        gifUrl: r.gifUrl,
        imageUrls: r.imageUrls,
        moderationStatus: r.moderationStatus,
        moderationReason: r.moderationReason,
        createdAt: r.createdAt,
        author: identities.get(r.userId) ?? null,
        reactionCount: r._count.likes,
        replyCount: r._count.replies,
        reportCount: reportsById.get(r.id) ?? 0,
      }));
      if (q.reported) items = items.filter((i) => i.reportCount > 0);
      return { total, page: q.page, items };
    }
    const [total, rows] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * 25,
        take: 25,
        include: { _count: { select: { likes: true } } },
      }),
    ]);
    const ids = rows.map((r) => r.id);
    const [reports, identities] = await Promise.all([
      ids.length
        ? prisma.report.groupBy({
            by: ["targetId"],
            where: { targetType: "comment", targetId: { in: ids } },
            _count: true,
          })
        : [],
      identitiesForUsers(rows.map((r) => r.userId)),
    ]);
    const reportsById = new Map(reports.map((r) => [r.targetId, r._count]));
    let items = rows.map((r) => ({
      id: r.id,
      type: "comment" as const,
      body: r.body,
      isSpoiler: r.isSpoiler,
      canonicalId: r.canonicalId,
      chapterNumber: r.chapterNumber,
      moderationStatus: r.moderationStatus,
      moderationReason: r.moderationReason,
      createdAt: r.createdAt,
      author: identities.get(r.userId) ?? null,
      reactionCount: r._count.likes,
      reportCount: reportsById.get(r.id) ?? 0,
    }));
    if (q.reported) items = items.filter((i) => i.reportCount > 0);
    return { total, page: q.page, items };
  });

  // ── Direct moderation action — no report required ─────────────────────
  app.post<{ Params: { targetType: string; targetId: string } }>(
    "/admin/content/:targetType/:targetId/action",
    async (req) => {
      const targetType = z.enum(["post", "comment", "user"]).parse(req.params.targetType);
      // Everything but dismiss (meaningless without a report), plus restore.
      const directBody = actionBody.extend({
        action: z.enum([
          "correct_spoiler",
          "remove_content",
          "warn",
          "suspend_7d",
          "suspend_30d",
          "ban",
          "restore_content",
        ]),
      });
      const input = directBody.parse(req.body);
      if (input.action === "restore_content") {
        if (targetType === "user") {
          throw Object.assign(new Error("Restore applies to posts and comments"), {
            statusCode: 400,
          });
        }
        const moderator = await requireCapability(req, "remove_content");
        const exists = await targetSnapshot(targetType, req.params.targetId);
        if (!exists) throw Object.assign(new Error("No such content"), { statusCode: 404 });
        await restoreContent({
          moderator,
          targetType,
          targetId: req.params.targetId,
          reason: input.reason,
          requestId: req.id,
        });
        return { ok: true };
      }
      const action = input.action as Exclude<ModAction, "dismiss">;
      const moderator = await requireAction(req, action);
      if (action === "correct_spoiler" && targetType === "user") {
        throw Object.assign(new Error("A user profile has no spoiler flag"), { statusCode: 400 });
      }
      const exists = await targetSnapshot(targetType, req.params.targetId);
      if (!exists) throw Object.assign(new Error("No such content"), { statusCode: 404 });
      await applyModerationAction({
        moderator,
        targetType,
        targetId: req.params.targetId,
        input: { ...input, action },
        requestId: req.id,
      });
      return { ok: true };
    },
  );

  // ── Dashboard counts ───────────────────────────────────────────────────
  app.get("/admin/overview", async (req) => {
    await requireCapability(req, "view_reports");
    const dayAgo = new Date(Date.now() - 86_400_000);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [
      pendingReports,
      pendingAppeals,
      totalUsers,
      activeToday,
      suspended,
      banned,
      posts24h,
      comments24h,
      removed7d,
      liveArenaEvents,
    ] = await Promise.all([
      prisma.report.count({ where: { status: "pending" } }),
      prisma.appeal.count({ where: { status: "pending" } }),
      prisma.user.count(),
      prisma.user.count({ where: { lastActiveAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { status: "suspended" } }),
      prisma.user.count({ where: { status: "banned" } }),
      prisma.post.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.comment.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.moderationAction.count({
        where: { action: "remove_content", createdAt: { gte: weekAgo } },
      }),
      prisma.arenaEvent.count({
        where: { startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
      }),
    ]);
    return {
      pendingReports,
      pendingAppeals,
      users: { total: totalUsers, activeToday, suspended, banned },
      posts24h,
      comments24h,
      removed7d,
      liveArenaEvents,
    };
  });

  app.get("/admin/appeals", async (req) => {
    await requireCapability(req, "review_appeals");
    const { status } = z
      .object({ status: z.enum(["pending", "upheld", "overturned"]).default("pending") })
      .parse(req.query);
    return prisma.appeal.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, username: true, status: true } },
        moderationAction: true,
      },
    });
  });

  app.post<{ Params: { id: string } }>("/admin/appeals/:id/decision", async (req) => {
    const reviewer = await requireCapability(req, "review_appeals");
    const { decision, response } = z
      .object({
        decision: z.enum(["upheld", "overturned"]),
        response: z.string().trim().min(10).max(2000),
      })
      .parse(req.body);
    const appeal = await prisma.appeal.findUnique({
      where: { id: req.params.id },
      include: { moderationAction: true },
    });
    if (!appeal || appeal.status !== "pending") {
      throw Object.assign(new Error("Pending appeal not found"), { statusCode: 404 });
    }
    await prisma.$transaction(async (tx) => {
      if (decision === "overturned") {
        if (["suspend_7d", "suspend_30d", "ban"].includes(appeal.moderationAction.action)) {
          await tx.user.update({
            where: { id: appeal.userId },
            data: { status: "active", suspendedUntil: null },
          });
        }
        if (appeal.moderationAction.action === "remove_content") {
          if (appeal.moderationAction.targetType === "post") {
            await tx.post.updateMany({
              where: { id: appeal.moderationAction.targetId },
              data: { moderationStatus: "visible", moderationReason: null, moderatedAt: null },
            });
          } else if (appeal.moderationAction.targetType === "comment") {
            await tx.comment.updateMany({
              where: { id: appeal.moderationAction.targetId },
              data: { moderationStatus: "visible", moderationReason: null, moderatedAt: null },
            });
          }
        }
      }
      await tx.appeal.update({
        where: { id: appeal.id },
        data: { status: decision, response, reviewerId: reviewer.id, reviewedAt: new Date() },
      });
      await tx.moderationAction.create({
        data: {
          moderatorId: reviewer.id,
          moderatorSnapshot: reviewer.username,
          targetType: "appeal",
          targetId: appeal.id,
          action: decision,
          reasonCode: "appeal",
          reason: response,
          requestId: req.id,
        },
      });
    });
    if (decision === "overturned" && appeal.moderationAction.action === "remove_content") {
      const restoredUserId = await targetUserId(
        appeal.moderationAction.targetType,
        appeal.moderationAction.targetId,
      );
      if (restoredUserId) {
        const restoredAmount =
          appeal.moderationAction.targetType === "post"
            ? 8 +
              5 *
                (await prisma.postLike.count({
                  where: { postId: appeal.moderationAction.targetId },
                }))
            : 10 +
              5 *
                (await prisma.commentLike.count({
                  where: { commentId: appeal.moderationAction.targetId },
                }));
        await restoreActivityForContent(restoredUserId, appeal.moderationAction.targetId);
        await restoreDirectContentXp(
          restoredUserId,
          appeal.id,
          restoredAmount,
        );
        await evaluateBadges(restoredUserId);
      }
    }
    await createNotification({
      userId: appeal.userId,
      kind: "appeal_decision",
      title: "Appeal decision",
      safeBody: `Your appeal was ${decision}.`,
      targetUrl: "/appeals",
      dedupeKey: `appeal:${appeal.id}:${decision}`,
      priority: "high",
    });
    return { ok: true };
  });

  app.get("/admin/audit", async (req) => {
    await requireCapability(req, "view_audit");
    return prisma.moderationAction.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  });

  // ── Official announcements (THE SYSTEM's voice) ───────────────────────
  app.post("/admin/announcements", async (req) => {
    const admin = await requireCapability(req, "manage_rewards");
    const { body, pinned, notify, targetUrl } = z
      .object({
        body: z.string().trim().min(3).max(4000),
        pinned: z.boolean().default(true),
        notify: z.boolean().default(false),
        targetUrl: z.string().trim().max(200).optional(),
      })
      .parse(req.body);
    const { postId } = await createAnnouncement({ admin, body, pinned, notify, targetUrl });
    return { postId };
  });

  app.get("/admin/announcements", async (req) => {
    await requireCapability(req, "manage_rewards");
    const posts = await prisma.post.findMany({
      where: { isOfficial: true },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { likes: true, replies: true } } },
    });
    return posts.map((p) => ({
      id: p.id,
      body: p.body,
      pinned: p.pinned,
      moderationStatus: p.moderationStatus,
      createdAt: p.createdAt,
      reactionCount: p._count.likes,
      replyCount: p._count.replies,
    }));
  });

  app.patch<{ Params: { id: string } }>("/admin/announcements/:id", async (req) => {
    await requireCapability(req, "manage_rewards");
    const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);
    const updated = await prisma.post.updateMany({
      where: { id: req.params.id, isOfficial: true },
      data: { pinned },
    });
    if (updated.count === 0) {
      throw Object.assign(new Error("No such announcement"), { statusCode: 404 });
    }
    return { ok: true, pinned };
  });

  app.delete<{ Params: { id: string } }>("/admin/announcements/:id", async (req) => {
    const admin = await requireCapability(req, "manage_rewards");
    const post = await prisma.post.findFirst({
      where: { id: req.params.id, isOfficial: true },
    });
    if (!post) throw Object.assign(new Error("No such announcement"), { statusCode: 404 });
    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: { moderationStatus: "removed", pinned: false, moderatedAt: new Date() },
      }),
      prisma.moderationAction.create({
        data: {
          moderatorId: admin.id,
          moderatorSnapshot: admin.username,
          targetType: "post",
          targetId: post.id,
          action: "remove_content",
          reasonCode: "other",
          reason: "Official announcement retired by an administrator",
          beforeSnapshot: jsonSnapshot({ body: post.body, pinned: post.pinned }),
        },
      }),
    ]);
    return { ok: true };
  });

  app.get("/admin/users", async (req) => {
    const admin = await requireCapability(req, "manage_rewards");
    const { q } = z.object({ q: z.string().trim().max(100).default("") }).parse(req.query);
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        usernameChangesLeft: true,
        createdAt: true,
        titles: { select: { titleId: true } },
      },
    });
    const identities = await identitiesForUsers(users.map((user) => user.id), admin.id);
    return users.map((user) => ({ ...user, identity: identities.get(user.id) ?? null }));
  });

  app.get("/admin/titles", async (req) => {
    await requireCapability(req, "manage_rewards");
    return prisma.titleDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  });

  app.patch<{ Params: { id: string } }>("/admin/users/:id/role", async (req) => {
    const owner = await requireCapability(req, "manage_roles");
    const { role, password } = z
      .object({ role: z.enum(ROLES), password: z.string().min(1).max(200) })
      .parse(req.body);
    if (!verifyPassword(password, owner.passwordHash)) {
      throw Object.assign(new Error("Password confirmation failed"), { statusCode: 403 });
    }
    if (req.params.id === owner.id && role !== "owner") {
      const otherOwners = await prisma.user.count({ where: { role: "owner", id: { not: owner.id } } });
      if (otherOwners === 0) throw Object.assign(new Error("The last owner cannot demote themselves"), { statusCode: 409 });
    }
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw Object.assign(new Error("User not found"), { statusCode: 404 });
    const updated = await prisma.user.update({ where: { id: before.id }, data: { role } });
    await prisma.moderationAction.create({
      data: {
        moderatorId: owner.id,
        moderatorSnapshot: owner.username,
        targetType: "user",
        targetId: updated.id,
        action: "role_change",
        reasonCode: "administration",
        reason: `${before.role} -> ${updated.role}`,
        beforeSnapshot: jsonSnapshot({ role: before.role }),
        afterSnapshot: jsonSnapshot({ role: updated.role }),
        requestId: req.id,
      },
    });
    return { ok: true, role: updated.role };
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/username-change", async (req) => {
    const admin = await requireCapability(req, "manage_rewards");
    const { amount } = z.object({ amount: z.number().int().min(1).max(10).default(1) }).parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { usernameChangesLeft: { increment: amount } },
      select: { usernameChangesLeft: true },
    });
    await prisma.moderationAction.create({
      data: {
        moderatorId: admin.id,
        moderatorSnapshot: admin.username,
        targetType: "user",
        targetId: req.params.id,
        action: "grant_username_change",
        reasonCode: "administration",
        reason: `Granted ${amount} username change permission(s)`,
        requestId: req.id,
      },
    });
    return { ok: true, usernameChangesLeft: updated.usernameChangesLeft };
  });

  app.post<{ Params: { id: string; titleId: string } }>(
    "/admin/users/:id/titles/:titleId",
    async (req) => {
      const admin = await requireCapability(req, "manage_rewards");
      const title = await prisma.titleDefinition.findUnique({ where: { id: req.params.titleId } });
      if (!title) throw Object.assign(new Error("Title not found"), { statusCode: 404 });
      await prisma.userTitle.upsert({
        where: { userId_titleId: { userId: req.params.id, titleId: title.id } },
        create: { userId: req.params.id, titleId: title.id, source: "admin", grantedBy: admin.id },
        update: { source: "admin", grantedBy: admin.id },
      });
      await prisma.rewardGrant.upsert({
        where: {
          userId_rewardType_rewardId_sourceType_sourceId: {
            userId: req.params.id,
            rewardType: "title",
            rewardId: title.id,
            sourceType: "admin",
            sourceId: `${req.params.id}:${title.id}`,
          },
        },
        create: {
          userId: req.params.id,
          rewardType: "title",
          rewardId: title.id,
          sourceType: "admin",
          sourceId: `${req.params.id}:${title.id}`,
        },
        update: { revokedAt: null },
      });
      await createNotification({
        userId: req.params.id,
        actorId: admin.id,
        kind: "title_unlocked",
        title: "Title unlocked",
        safeBody: `You unlocked the ${title.name} title.`,
        targetUrl: "/(tabs)/account",
        dedupeKey: `admin-title:${req.params.id}:${title.id}`,
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string; titleId: string } }>(
    "/admin/users/:id/titles/:titleId",
    async (req) => {
      const admin = await requireCapability(req, "manage_rewards");
      await prisma.$transaction([
        prisma.userTitle.deleteMany({ where: { userId: req.params.id, titleId: req.params.titleId } }),
        prisma.user.updateMany({
          where: { id: req.params.id, equippedTitleId: req.params.titleId },
          data: { equippedTitleId: null },
        }),
        prisma.rewardGrant.updateMany({
          where: {
            userId: req.params.id,
            rewardType: "title",
            rewardId: req.params.titleId,
            sourceType: "admin",
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        }),
      ]);
      await prisma.moderationAction.create({
        data: {
          moderatorId: admin.id,
          moderatorSnapshot: admin.username,
          targetType: "user",
          targetId: req.params.id,
          action: "revoke_title",
          reasonCode: "administration",
          reason: req.params.titleId,
          requestId: req.id,
        },
      });
      return { ok: true };
    },
  );
}
