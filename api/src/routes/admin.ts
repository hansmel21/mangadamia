import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ROLES,
  capabilitiesFor,
  requireCapability,
  verifyPassword,
  type Capability,
} from "../auth.js";
import { createAnnouncement } from "../announcements.js";
import { prisma } from "../db/client.js";
import { createNotification } from "../notifications.js";
import { identitiesForUsers } from "../identity.js";
import { evaluateBadges, revokeIneligibleBadges } from "../badges.js";
import {
  restoreActivityForContent,
  restoreDirectContentXp,
  reverseActivityForContent,
  reverseDirectContentXp,
} from "../quests.js";

const actions = [
  "dismiss",
  "correct_spoiler",
  "remove_content",
  "warn",
  "suspend_7d",
  "suspend_30d",
  "ban",
] as const;

const actionBody = z.object({
  action: z.enum(actions),
  reasonCode: z.enum([
    "spam",
    "harassment",
    "hate",
    "sexual_content",
    "child_safety",
    "copyright",
    "spoiler",
    "impersonation",
    "fraud",
    "other",
  ]),
  reason: z.string().trim().min(3).max(1000),
  spoilerState: z.boolean().optional(),
});

const actionCapability: Record<(typeof actions)[number], Capability> = {
  dismiss: "view_reports",
  correct_spoiler: "correct_spoilers",
  remove_content: "remove_content",
  warn: "warn_users",
  suspend_7d: "suspend_users",
  suspend_30d: "suspend_users",
  ban: "ban_users",
};

function jsonSnapshot(value: unknown) {
  return value == null ? undefined : JSON.parse(JSON.stringify(value));
}

async function targetSnapshot(targetType: string, targetId: string) {
  if (targetType === "post") {
    return prisma.post.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        body: true,
        isSpoiler: true,
        userId: true,
        moderationStatus: true,
        moderationReason: true,
        createdAt: true,
      },
    });
  }
  if (targetType === "comment") {
    return prisma.comment.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        body: true,
        isSpoiler: true,
        userId: true,
        moderationStatus: true,
        moderationReason: true,
        createdAt: true,
      },
    });
  }
  return prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, role: true, status: true, suspendedUntil: true, createdAt: true },
  });
}

async function targetUserId(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === "user") return targetId;
  if (targetType === "post") {
    return (await prisma.post.findUnique({ where: { id: targetId }, select: { userId: true } }))
      ?.userId ?? null;
  }
  return (
    (await prisma.comment.findUnique({ where: { id: targetId }, select: { userId: true } }))
      ?.userId ?? null
  );
}

async function requireAction(req: FastifyRequest, action: (typeof actions)[number]) {
  return requireCapability(req, actionCapability[action]);
}

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

    const userId = await targetUserId(report.targetType, report.targetId);
    const before = await targetSnapshot(report.targetType, report.targetId);
    let contentXp = 0;
    if (input.action === "remove_content" && report.targetType === "post") {
      contentXp = 8 + 5 * (await prisma.postLike.count({ where: { postId: report.targetId } }));
    } else if (input.action === "remove_content" && report.targetType === "comment") {
      contentXp = 10 + 5 * (await prisma.commentLike.count({ where: { commentId: report.targetId } }));
    }
    const now = new Date();
    const action = await prisma.$transaction(async (tx) => {
      if (input.action === "correct_spoiler") {
        const spoilerState = input.spoilerState ?? true;
        if (report.targetType === "post") {
          await tx.post.updateMany({ where: { id: report.targetId }, data: { isSpoiler: spoilerState } });
        } else {
          await tx.comment.updateMany({ where: { id: report.targetId }, data: { isSpoiler: spoilerState } });
        }
      }
      if (input.action === "remove_content") {
        if (report.targetType === "post") {
          await tx.post.updateMany({
            where: { id: report.targetId },
            data: { moderationStatus: "removed", moderationReason: input.reason, moderatedAt: now },
          });
        } else if (report.targetType === "comment") {
          await tx.comment.updateMany({
            where: { id: report.targetId },
            data: { moderationStatus: "removed", moderationReason: input.reason, moderatedAt: now },
          });
        } else {
          throw Object.assign(new Error("A user report cannot use remove_content"), {
            statusCode: 400,
          });
        }
      }
      if ((input.action === "suspend_7d" || input.action === "suspend_30d") && userId) {
        const days = input.action === "suspend_30d" ? 30 : 7;
        await tx.user.update({
          where: { id: userId },
          data: { status: "suspended", suspendedUntil: new Date(Date.now() + days * 86_400_000) },
        });
        // Sessions remain valid so suspended readers can read and appeal; all
        // community mutations already pass through requireActiveUser.
      }
      if (input.action === "ban" && userId) {
        await tx.user.update({
          where: { id: userId },
          data: { status: "banned", suspendedUntil: null },
        });
        await tx.session.deleteMany({ where: { userId } });
      }
      const created = await tx.moderationAction.create({
        data: {
          moderatorId: moderator.id,
          moderatorSnapshot: moderator.username,
          reportId: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          action: input.action,
          reasonCode: input.reasonCode,
          reason: input.reason,
          beforeSnapshot: jsonSnapshot(before),
          requestId: req.id,
        },
      });
      if (userId && ["warn", "remove_content", "suspend_7d", "suspend_30d", "ban"].includes(input.action)) {
        const kind = input.action === "warn" ? "warning" : input.action;
        await tx.moderationNotice.create({
          data: {
            userId,
            moderationActionId: created.id,
            kind,
            message: input.reason,
            requiresAcknowledgement: true,
          },
        });
        await tx.notification.create({
          data: {
            userId,
            kind: `moderation_${kind}`,
            title: input.action === "warn" ? "Account warning" : "Moderation update",
            safeBody: "A moderation decision is available in your account inbox.",
            targetUrl: "/appeals",
            priority: "high",
            dedupeKey: `moderation:${created.id}`,
          },
        });
      }
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: input.action === "dismiss" ? "dismissed" : "resolved",
          resolution: `${input.action}:${input.reasonCode}:${input.reason}`,
          reviewedAt: now,
        },
      });
      return created;
    });
    const after = await targetSnapshot(report.targetType, report.targetId);
    await prisma.moderationAction.update({
      where: { id: action.id },
      data: { afterSnapshot: jsonSnapshot(after) },
    });
    if (input.action === "remove_content" && userId) {
      await reverseActivityForContent(userId, report.targetId, input.reason);
      await reverseDirectContentXp(userId, action.id, contentXp);
      await revokeIneligibleBadges(userId);
    }
    return { ok: true };
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
