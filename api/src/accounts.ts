import { prisma } from "./db/client.js";

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
  await prisma.$transaction(async (tx) => {
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
  });
}
