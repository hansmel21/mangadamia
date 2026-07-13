// Official announcements — THE SYSTEM's voice. Created only through the
// admin endpoints (isOfficial is never accepted from the public composer),
// rendered without the acting admin's identity, and optionally fanned out as
// a notification to every active reader (the "announcements" preference
// bucket gates the push per reader; the in-app row is always created).
import type { User } from "@prisma/client";
import { prisma } from "./db/client.js";
import { dispatchPendingPushes } from "./notifications.js";

export interface AnnouncementInput {
  admin: User;
  body: string;
  pinned?: boolean;
  notify?: boolean;
  targetUrl?: string;
}

export async function createAnnouncement(input: AnnouncementInput): Promise<{ postId: string }> {
  const post = await prisma.post.create({
    data: {
      userId: input.admin.id,
      body: input.body,
      kind: "announcement",
      isOfficial: true,
      pinned: input.pinned ?? true,
    },
  });
  if (input.notify) {
    // Fire-and-forget: never let a big fan-out block the admin's request.
    void fanOutAnnouncement(post.id, input.body, input.targetUrl).catch(() => {});
  }
  return { postId: post.id };
}

// Batched createMany keeps a large fan-out cheap: no per-user round trips,
// and the (userId, dedupeKey) unique + skipDuplicates makes re-runs no-ops.
// Push delivery rides the existing dispatcher (kind "announcement" routes to
// the announcements preference bucket automatically).
async function fanOutAnnouncement(
  postId: string,
  body: string,
  targetUrl?: string,
): Promise<void> {
  const safeBody = body.length > 170 ? `${body.slice(0, 167)}…` : body;
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { status: "active" },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        kind: "announcement",
        title: "System notice",
        safeBody,
        targetUrl: targetUrl ?? `/post/${postId}`,
        postId,
        dedupeKey: `announcement:${postId}`,
      })),
      skipDuplicates: true,
    });
    cursor = users[users.length - 1].id;
    if (users.length < 1000) break;
  }
  // Kick the first wave immediately; the 30s interval drains the rest.
  void dispatchPendingPushes(250).catch(() => {});
}
