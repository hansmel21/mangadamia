import { levelForXp } from "./badges.js";
import { normalizeRole } from "./auth.js";
import { prisma } from "./db/client.js";

export const DEFAULT_TITLE_ID = "e-rank-hunter";
export const DEFAULT_AVATAR_ID = "avatar-origin";

export interface PublicIdentity {
  id: string | null;
  username: string;
  level: number | null;
  avatar: {
    id: string;
    assetKey: string;
    rarity: string;
    primaryColor: string | null;
    secondaryColor: string | null;
  } | null;
  frame: {
    id: string;
    assetKey: string;
    rarity: string;
    primaryColor: string | null;
    secondaryColor: string | null;
  } | null;
  title: { id: string; name: string; rarity: string } | null;
  staffMarker: { label: string; role: string } | null;
  anonymized: boolean;
}

const staffLabels: Record<string, string> = {
  community_moderator: "Community Guide",
  moderator: "Moderator",
  senior_moderator: "Senior Moderator",
  admin: "Administrator",
  owner: "Owner",
};

export async function ensureDefaultIdentity(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.userTitle.upsert({
      where: { userId_titleId: { userId, titleId: DEFAULT_TITLE_ID } },
      create: { userId, titleId: DEFAULT_TITLE_ID, source: "default" },
      update: {},
    }),
    prisma.userCosmetic.upsert({
      where: { userId_cosmeticId: { userId, cosmeticId: DEFAULT_AVATAR_ID } },
      create: { userId, cosmeticId: DEFAULT_AVATAR_ID, source: "default" },
      update: {},
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        equippedTitleId: DEFAULT_TITLE_ID,
        equippedAvatarId: DEFAULT_AVATAR_ID,
      },
    }),
  ]);
}

export async function identitiesForUsers(
  userIds: string[],
  viewerId?: string | null,
): Promise<Map<string, PublicIdentity>> {
  if (userIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: {
      id: true,
      username: true,
      xp: true,
      role: true,
      status: true,
      showLevel: true,
      showTitle: true,
      equippedTitle: { select: { id: true, name: true, rarity: true } },
      equippedAvatar: {
        select: {
          id: true,
          assetKey: true,
          rarity: true,
          primaryColor: true,
          secondaryColor: true,
        },
      },
      equippedFrame: {
        select: {
          id: true,
          assetKey: true,
          rarity: true,
          primaryColor: true,
          secondaryColor: true,
        },
      },
    },
  });
  const result = new Map<string, PublicIdentity>();
  for (const user of users) {
    if (user.status === "banned") {
      result.set(user.id, {
        id: null,
        username: "Removed Reader",
        level: null,
        avatar: null,
        frame: null,
        title: null,
        staffMarker: null,
        anonymized: true,
      });
      continue;
    }
    const self = viewerId === user.id;
    const role = normalizeRole(user.role);
    result.set(user.id, {
      id: user.id,
      username: user.username,
      level: self || user.showLevel ? levelForXp(user.xp) : null,
      avatar: user.equippedAvatar,
      frame: user.equippedFrame,
      title: self || user.showTitle ? user.equippedTitle : null,
      staffMarker: staffLabels[role] ? { label: staffLabels[role], role } : null,
      anonymized: false,
    });
  }
  return result;
}

export async function identityForUser(
  userId: string,
  viewerId?: string | null,
): Promise<PublicIdentity | null> {
  return (await identitiesForUsers([userId], viewerId)).get(userId) ?? null;
}
