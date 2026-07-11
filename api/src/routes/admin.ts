import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireModerator } from "../auth.js";
import { prisma } from "../db/client.js";

const actionBody = z.object({
  action: z.enum(["dismiss", "remove_content", "warn", "suspend_7d", "ban"]),
  reason: z.string().trim().min(3).max(500),
});

async function targetSnapshot(targetType: string, targetId: string) {
  if (targetType === "post") {
    return prisma.post.findUnique({
      where: { id: targetId },
      select: { id: true, body: true, userId: true, moderationStatus: true, createdAt: true },
    });
  }
  if (targetType === "comment") {
    return prisma.comment.findUnique({
      where: { id: targetId },
      select: { id: true, body: true, userId: true, moderationStatus: true, createdAt: true },
    });
  }
  return prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, status: true, createdAt: true },
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

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get("/admin/reports", async (req) => {
    await requireModerator(req);
    const { status } = z
      .object({ status: z.enum(["pending", "resolved", "dismissed"]).default("pending") })
      .parse(req.query);
    const reports = await prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { reporter: { select: { username: true } } },
    });
    return Promise.all(
      reports.map(async (report) => ({
        ...report,
        target: await targetSnapshot(report.targetType, report.targetId),
      })),
    );
  });

  app.post<{ Params: { id: string } }>("/admin/reports/:id/action", async (req) => {
    const moderator = await requireModerator(req);
    const { action, reason } = actionBody.parse(req.body);
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
    if (report.status !== "pending") {
      throw Object.assign(new Error("Report has already been reviewed"), { statusCode: 409 });
    }

    const userId = await targetUserId(report.targetType, report.targetId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (action === "remove_content") {
        if (report.targetType === "post") {
          await tx.post.updateMany({
            where: { id: report.targetId },
            data: { moderationStatus: "removed", moderationReason: reason, moderatedAt: now },
          });
        } else if (report.targetType === "comment") {
          await tx.comment.updateMany({
            where: { id: report.targetId },
            data: { moderationStatus: "removed", moderationReason: reason, moderatedAt: now },
          });
        } else {
          throw Object.assign(new Error("A user report cannot use remove_content"), {
            statusCode: 400,
          });
        }
      }
      if (action === "suspend_7d" && userId) {
        await tx.user.update({
          where: { id: userId },
          data: { status: "suspended", suspendedUntil: new Date(Date.now() + 7 * 86_400_000) },
        });
        await tx.session.deleteMany({ where: { userId } });
      }
      if (action === "ban" && userId) {
        await tx.user.update({
          where: { id: userId },
          data: { status: "banned", suspendedUntil: null },
        });
        await tx.session.deleteMany({ where: { userId } });
      }
      await tx.moderationAction.create({
        data: {
          moderatorId: moderator.id,
          targetType: report.targetType,
          targetId: report.targetId,
          action,
          reason,
        },
      });
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: action === "dismiss" ? "dismissed" : "resolved",
          resolution: `${action}: ${reason}`,
          reviewedAt: now,
        },
      });
    });
    return { ok: true };
  });
}
