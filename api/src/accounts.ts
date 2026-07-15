import { prisma } from "./db/client.js";
import { createNotification } from "./notifications.js";

// Product rule: account deletion removes the account and all associated social,
// reward, notification, report, appeal, and moderation records rather than
// leaving public anonymized content behind.
export async function deleteUserCompletely(userId: string): Promise<void> {
  const [posts, comments] = await Promise.all([
    prisma.post.findMany({ where: { userId }, select: { id: true } }),
    prisma.comment.findMany({ where: { userId }, select: { id: true } }),
  ]);
  const postIds = posts.map((item) => item.id);
  const commentIds = comments.map((item) => item.id);
  const { heir, gateHeirs } = await prisma.$transaction(async (tx): Promise<{
    heir: { userId: string; guildId: string } | null;
    gateHeirs: { userId: string; gateId: string; gateName: string }[];
  }> => {
    let heirOut: { userId: string; guildId: string } | null = null;
    // Guild succession — the leave route's rules, applied here too, so a
    // deleted guildmaster can't orphan a guild (the cascade would otherwise
    // silently drop their membership without transferring leadership).
    const membership = await tx.guildMember.findUnique({ where: { userId } });
    if (membership && membership.role === "guildmaster") {
      const others = await tx.guildMember.findMany({
        where: { guildId: membership.guildId, userId: { not: userId } },
        orderBy: [{ joinedAt: "asc" }],
      });
      if (others.length === 0) {
        // Last member out dissolves the guild.
        await tx.guild.delete({ where: { id: membership.guildId } });
      } else {
        const next = others.find((m) => m.role === "officer") ?? others[0];
        await tx.guildMember.update({
          where: { userId: next.userId },
          data: { role: "guildmaster" },
        });
        await tx.guild.update({
          where: { id: membership.guildId },
          data: { guildmasterId: next.userId },
        });
        heirOut = { userId: next.userId, guildId: membership.guildId };
      }
    }
    // Gate succession — same rules per gate the reader keeps (a reader can
    // hold many gates, unlike the one-guild rule).
    const gateHeirsOut: { userId: string; gateId: string; gateName: string }[] = [];
    const keptGates = await tx.gateMember.findMany({
      where: { userId, role: "gatekeeper" },
      include: { gate: { select: { name: true } } },
    });
    for (const kept of keptGates) {
      const others = await tx.gateMember.findMany({
        where: { gateId: kept.gateId, userId: { not: userId } },
        orderBy: [{ joinedAt: "asc" }],
      });
      if (others.length === 0) {
        // Last one out closes the gate (posts cascade).
        await tx.gate.delete({ where: { id: kept.gateId } });
        continue;
      }
      const next = others.find((m) => m.role === "warden") ?? others[0];
      await tx.gateMember.update({
        where: { userId_gateId: { userId: next.userId, gateId: kept.gateId } },
        data: { role: "gatekeeper" },
      });
      await tx.gate.update({ where: { id: kept.gateId }, data: { ownerId: next.userId } });
      gateHeirsOut.push({ userId: next.userId, gateId: kept.gateId, gateName: kept.gate.name });
    }
    await tx.notification.deleteMany({ where: { actorId: userId } });
    await tx.report.deleteMany({
      where: {
        OR: [
          { targetType: "user", targetId: userId },
          ...(postIds.length ? [{ targetType: "post", targetId: { in: postIds } }] : []),
          ...(commentIds.length ? [{ targetType: "comment", targetId: { in: commentIds } }] : []),
        ],
      },
    });
    await tx.moderationAction.deleteMany({
      where: {
        OR: [
          { moderatorId: userId },
          { targetType: "user", targetId: userId },
          ...(postIds.length ? [{ targetType: "post", targetId: { in: postIds } }] : []),
          ...(commentIds.length ? [{ targetType: "comment", targetId: { in: commentIds } }] : []),
        ],
      },
    });
    await tx.user.delete({ where: { id: userId } });
    return { heir: heirOut, gateHeirs: gateHeirsOut };
  });
  if (heir) {
    await createNotification({
      userId: heir.userId,
      kind: "guild_promoted",
      title: "You're the Guildmaster",
      safeBody: "The previous Guildmaster's account was deleted — leadership passed to you.",
      targetUrl: `/guild/${heir.guildId}`,
      dedupeKey: `guild-gm-deleted:${heir.guildId}:${heir.userId}`,
    });
  }
  for (const gateHeir of gateHeirs) {
    await createNotification({
      userId: gateHeir.userId,
      kind: "gate_promoted",
      title: "You're the Gatekeeper",
      safeBody: `The previous Gatekeeper's account was deleted — ${gateHeir.gateName} passed to you.`,
      targetUrl: `/gate/${gateHeir.gateId}`,
      dedupeKey: `gate-gk-deleted:${gateHeir.gateId}:${gateHeir.userId}`,
    });
  }
}
