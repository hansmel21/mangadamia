import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "./db/client.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface NotificationInput {
  userId: string;
  actorId?: string;
  kind: string;
  title: string;
  safeBody: string;
  targetUrl?: string;
  metadata?: Prisma.InputJsonValue;
  dedupeKey?: string;
  priority?: "normal" | "high";
  commentId?: string;
  postId?: string;
}

export async function createNotification(input: NotificationInput) {
  const notification = await prisma.notification.upsert({
    where: {
      userId_dedupeKey: {
        userId: input.userId,
        dedupeKey: input.dedupeKey ?? `notification:${randomUUID()}`,
      },
    },
    create: {
      userId: input.userId,
      actorId: input.actorId,
      kind: input.kind,
      title: input.title,
      safeBody: input.safeBody,
      targetUrl: input.targetUrl,
      metadata: input.metadata,
      dedupeKey: input.dedupeKey,
      priority: input.priority ?? "normal",
      commentId: input.commentId,
      postId: input.postId,
    },
    update: {},
  });
  void dispatchNotificationPush(notification.id);
  return notification;
}

function preferenceKey(kind: string): "replies" | "reactions" | "follows" | "quests" | "newChapters" | "announcements" {
  if (kind.includes("reply") || kind === "mention") return "replies";
  if (kind.includes("reaction") || kind.includes("like")) return "reactions";
  if (kind.includes("follow")) return "follows";
  if (kind.includes("quest") || kind.includes("reward") || kind.includes("badge") || kind.includes("title")) return "quests";
  if (kind === "new_chapter") return "newChapters";
  return "announcements";
}

export async function dispatchNotificationPush(notificationId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      user: {
        include: {
          notificationPrefs: true,
          pushDevices: { where: { revokedAt: null } },
        },
      },
    },
  });
  if (!notification || notification.pushQueuedAt || !notification.title || !notification.safeBody) return;
  const prefs = notification.user.notificationPrefs;
  const allowed = prefs?.pushEnabled && (prefs[preferenceKey(notification.kind)] ?? true);
  const devices = allowed ? notification.user.pushDevices : [];
  if (devices.length === 0) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { pushQueuedAt: new Date() },
    });
    return;
  }

  const messages = devices.map((device) => ({
    to: device.expoToken,
    sound: null,
    title: notification.title,
    body: notification.safeBody,
    priority: notification.priority === "high" ? "high" : "default",
    channelId: notification.kind.startsWith("moderation") ? "account" : "social",
    data: {
      url: notification.targetUrl ?? "/notifications",
      notificationId: notification.id,
    },
  }));
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}`);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { pushQueuedAt: new Date() },
    });
  } catch {
    // Leave it pending. The periodic dispatcher will retry; lock-screen copy is
    // deliberately spoiler-safe and contains no post/comment text.
  }
}

export async function dispatchPendingPushes(limit = 50): Promise<void> {
  const pending = await prisma.notification.findMany({
    where: { pushQueuedAt: null, dismissedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const item of pending) await dispatchNotificationPush(item.id);
}
