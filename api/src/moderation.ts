// Shared moderation pipeline. applyModerationAction() is the single path for
// every enforcement decision — from the reports queue (reportId set) or the
// admin console's direct content actions (no report) — so snapshots, notices,
// notifications, XP reversal, and the audit trail can never drift apart.
import type { User } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { requireCapability, type Capability } from "./auth.js";
import { evaluateBadges, revokeIneligibleBadges } from "./badges.js";
import { prisma } from "./db/client.js";
import {
  restoreActivityForContent,
  restoreDirectContentXp,
  reverseActivityForContent,
  reverseDirectContentXp,
} from "./quests.js";

export const MOD_ACTIONS = [
  "dismiss",
  "correct_spoiler",
  "remove_content",
  "warn",
  "suspend_7d",
  "suspend_30d",
  "ban",
] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];

export const actionBody = z.object({
  action: z.enum(MOD_ACTIONS),
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
export type ActionInput = z.infer<typeof actionBody>;

export const actionCapability: Record<ModAction, Capability> = {
  dismiss: "view_reports",
  correct_spoiler: "correct_spoilers",
  remove_content: "remove_content",
  warn: "warn_users",
  suspend_7d: "suspend_users",
  suspend_30d: "suspend_users",
  ban: "ban_users",
};

export async function requireAction(req: FastifyRequest, action: ModAction): Promise<User> {
  return requireCapability(req, actionCapability[action]);
}

export function jsonSnapshot(value: unknown) {
  return value == null ? undefined : JSON.parse(JSON.stringify(value));
}

export async function targetSnapshot(targetType: string, targetId: string) {
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

export async function targetUserId(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === "user") return targetId;
  if (targetType === "post") {
    return (
      (await prisma.post.findUnique({ where: { id: targetId }, select: { userId: true } }))?.userId ??
      null
    );
  }
  return (
    (await prisma.comment.findUnique({ where: { id: targetId }, select: { userId: true } }))
      ?.userId ?? null
  );
}

export async function applyModerationAction(opts: {
  moderator: User;
  targetType: string;
  targetId: string;
  input: ActionInput;
  // Present when acting from the reports queue: resolves/dismisses the report
  // inside the same transaction. Absent for direct console actions.
  reportId?: string;
  requestId?: string;
}): Promise<{ actionId: string }> {
  const { moderator, targetType, targetId, input, reportId, requestId } = opts;
  const userId = await targetUserId(targetType, targetId);
  const before = await targetSnapshot(targetType, targetId);
  let contentXp = 0;
  if (input.action === "remove_content" && targetType === "post") {
    contentXp = 8 + 5 * (await prisma.postLike.count({ where: { postId: targetId } }));
  } else if (input.action === "remove_content" && targetType === "comment") {
    contentXp = 10 + 5 * (await prisma.commentLike.count({ where: { commentId: targetId } }));
  }
  const now = new Date();
  const action = await prisma.$transaction(async (tx) => {
    if (input.action === "correct_spoiler") {
      const spoilerState = input.spoilerState ?? true;
      if (targetType === "post") {
        await tx.post.updateMany({ where: { id: targetId }, data: { isSpoiler: spoilerState } });
      } else {
        await tx.comment.updateMany({ where: { id: targetId }, data: { isSpoiler: spoilerState } });
      }
    }
    if (input.action === "remove_content") {
      if (targetType === "post") {
        await tx.post.updateMany({
          where: { id: targetId },
          data: { moderationStatus: "removed", moderationReason: input.reason, moderatedAt: now },
        });
      } else if (targetType === "comment") {
        await tx.comment.updateMany({
          where: { id: targetId },
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
        reportId: reportId ?? null,
        targetType,
        targetId,
        action: input.action,
        reasonCode: input.reasonCode,
        reason: input.reason,
        beforeSnapshot: jsonSnapshot(before),
        requestId,
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
    if (reportId) {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: input.action === "dismiss" ? "dismissed" : "resolved",
          resolution: `${input.action}:${input.reasonCode}:${input.reason}`,
          reviewedAt: now,
        },
      });
    }
    return created;
  });
  const after = await targetSnapshot(targetType, targetId);
  await prisma.moderationAction.update({
    where: { id: action.id },
    data: { afterSnapshot: jsonSnapshot(after) },
  });
  if (input.action === "remove_content" && userId) {
    await reverseActivityForContent(userId, targetId, input.reason);
    await reverseDirectContentXp(userId, action.id, contentXp);
    await revokeIneligibleBadges(userId);
  }
  return { actionId: action.id };
}

// Undo a mistaken removal without waiting for the reader to appeal — the same
// restore path the appeal-overturn flow uses, with its own audit row.
export async function restoreContent(opts: {
  moderator: User;
  targetType: "post" | "comment";
  targetId: string;
  reason: string;
  requestId?: string;
}): Promise<void> {
  const { moderator, targetType, targetId, reason, requestId } = opts;
  const before = await targetSnapshot(targetType, targetId);
  const audit = await prisma.$transaction(async (tx) => {
    if (targetType === "post") {
      await tx.post.updateMany({
        where: { id: targetId },
        data: { moderationStatus: "visible", moderationReason: null, moderatedAt: null },
      });
    } else {
      await tx.comment.updateMany({
        where: { id: targetId },
        data: { moderationStatus: "visible", moderationReason: null, moderatedAt: null },
      });
    }
    return tx.moderationAction.create({
      data: {
        moderatorId: moderator.id,
        moderatorSnapshot: moderator.username,
        targetType,
        targetId,
        action: "restore_content",
        reasonCode: "other",
        reason,
        beforeSnapshot: jsonSnapshot(before),
        requestId,
      },
    });
  });
  const userId = await targetUserId(targetType, targetId);
  if (userId) {
    const amount =
      targetType === "post"
        ? 8 + 5 * (await prisma.postLike.count({ where: { postId: targetId } }))
        : 10 + 5 * (await prisma.commentLike.count({ where: { commentId: targetId } }));
    await restoreActivityForContent(userId, targetId);
    // The audit row's id keys the XP grant, so repeat restores can't re-pay.
    await restoreDirectContentXp(userId, audit.id, amount);
    await evaluateBadges(userId);
  }
}
