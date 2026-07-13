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
  const heir = await prisma.$transaction(async (tx): Promise<{
    userId: string;
    guildId: string;
  } | null> => {
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
    return heirOut;
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
}
