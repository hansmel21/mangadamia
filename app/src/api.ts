// Client for our own backend API (the /api folder of this repo).
import Constants from "expo-constants";
import { getToken } from "./session";

// Where is the backend?
//  - In development with Expo Go, default to the same machine that's running
//    `expo start` (your laptop), port 3000 — no config needed.
//  - Set EXPO_PUBLIC_API_URL (e.g. in app/.env) to override, and always set it
//    for production builds to your deployed Railway URL.
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (!__DEV__) {
    throw new Error("EXPO_PUBLIC_API_URL is required for production builds");
  }
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? undefined;
  const host = debuggerHost?.split(":")[0];
  if (host) return `http://${host}:3000`;
  return "http://localhost:3000";
}

export const API_URL = resolveBaseUrl();

export interface SourceInfo {
  id: string;
  name: string;
  languages: string[];
}

export interface SeriesSummary {
  sourceSeriesId: string;
  title: string;
  coverUrl?: string;
}

// One deduplicated series across sources; sources[] are its "servers",
// ordered best-first by the backend's health ranking.
export interface ServerRef {
  src: string;
  sourceSeriesId: string;
  chapterCount?: number;
}
export interface UnifiedCard {
  title: string;
  coverUrl?: string | null;
  canonicalId?: string;
  description?: string | null;
  tags?: string[];
  status?: string | null;
  sources: ServerRef[];
}

export interface RankedCard extends UnifiedCard {
  rank: number;
  readCount: number;
}

export interface ChapterInfo {
  sourceChapterId: string;
  number: number;
  title?: string | null;
  publishedAt?: string | null;
}

export interface SeriesDetail extends SeriesSummary {
  source: string;
  canonicalId?: string | null;
  altTitles: string[];
  description?: string | null;
  status?: string | null;
  tags: string[];
  chapters: ChapterInfo[];
}

export interface PageInfo {
  index: number;
  imageUrl: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    acceptedTermsVersion: string | null;
    role:
      | "user"
      | "community_moderator"
      | "moderator"
      | "senior_moderator"
      | "admin"
      | "owner";
    capabilities: string[];
    status: "active" | "suspended" | "banned";
  };
}

export interface PublicIdentity {
  id: string | null;
  username: string;
  level: number | null;
  avatar: CosmeticMini | null;
  frame: CosmeticMini | null;
  title: { id: string; name: string; rarity: Rarity } | null;
  staffMarker: { label: string; role: string } | null;
  anonymized: boolean;
}

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface CosmeticMini {
  id: string;
  assetKey: string;
  rarity: Rarity;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface RewardInfo {
  type: "xp" | "badge" | "title" | "cosmetic";
  id?: string;
  name: string;
  amount?: number;
  rarity?: Rarity;
}

export interface QuestCompletion {
  id: string;
  name: string;
  rewards: RewardInfo[];
}

export interface CommentInfo {
  id: string;
  parentId?: string | null;
  body: string;
  isSpoiler: boolean;
  author: PublicIdentity | null;
  username: string;
  level: number | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  replies?: CommentInfo[];
  completedQuests?: QuestCompletion[];
  levelUp?: number | null;
}

export interface BadgeMini {
  id: string;
  name: string;
  icon: string;
}

export interface BadgeInfo extends BadgeMini {
  description: string;
  earned: boolean;
  earnedAt: string | null;
  progress: { current: number; target: number };
}

export interface MeResponse {
  user: AuthResponse["user"];
  stats: { comments: number; likesReceived: number; chaptersRead: number; accountDays: number };
  xp: number;
  level: number;
  equippedBadgeId: string | null;
  equippedTitleId: string | null;
  equippedAvatarId: string | null;
  equippedFrameId: string | null;
  xpForNextLevel: number;
  identity: PublicIdentity | null;
  bio: string | null;
  usernameChangesLeft: number;
  followerCount: number;
  followingCount: number;
  pendingFollowCount: number;
  pendingNoticeCount: number;
  privacy: ProfilePrivacy;
  titles: TitleInfo[];
  cosmetics: CosmeticInfo[];
  badges: BadgeInfo[];
}

export interface ProfilePrivacy {
  profileVisibility: "public" | "private";
  showLevel: boolean;
  showTitle: boolean;
  showBadges: boolean;
  showStats: boolean;
  showPosts: boolean;
  showFavorites: boolean;
  showReadingHistory: boolean;
  showFollows: boolean;
  showJoinDate: boolean;
}

export interface TitleInfo {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  source: string;
  unlockedAt: string;
}

export interface CosmeticInfo extends CosmeticMini {
  name: string;
  description: string;
  kind: "avatar" | "frame";
  source: string;
  unlockedAt: string;
}

export interface ProfileInfo {
  id: string | null;
  username: string;
  bio?: string | null;
  identity?: PublicIdentity | null;
  unavailable?: "blocked" | "removed";
  private?: boolean;
  memberDays?: number | null;
  stats?: { comments: number; likesReceived: number; chaptersRead: number; posts: number } | null;
  badges: { id: string; name: string; icon: string; earnedAt: string }[];
  blockedByMe: boolean;
  blockedMe: boolean;
  followStatus: "pending" | "accepted" | null;
  followerCount: number | null;
  followingCount: number | null;
  isMe: boolean;
  recentPosts: {
    id: string;
    body: string;
    isSpoiler: boolean;
    createdAt: string;
    chapterNumber: number | null;
    likeCount: number;
    replyCount: number;
    series: { canonicalId: string; title: string; coverUrl?: string | null } | null;
  }[];
  favorites: { canonicalId: string; title: string; coverUrl?: string | null }[];
  recentReads: {
    canonicalId: string;
    title: string;
    coverUrl?: string | null;
    chapterNumber: number;
    readAt: string;
  }[];
}

export interface CloudLibraryEntry {
  canonicalId: string;
  source: string;
  sourceSeriesId: string;
  title: string;
  coverUrl?: string | null;
  addedAt: string;
}

export interface CloudProgress {
  canonicalId: string;
  chapterNumber: number;
  pageIndex: number;
  pageCount?: number | null;
  updatedAt: string;
}

export interface NotificationInfo {
  id: string;
  kind: string;
  type: "comment" | "post" | "system";
  createdAt: string;
  read: boolean;
  seen: boolean;
  title: string;
  fromUsername: string;
  body: string;
  targetUrl: string | null;
  metadata: Record<string, unknown> | null;
  actor: PublicIdentity | null;
  canonicalId: string | null;
  seriesTitle: string | null;
  chapterNumber: number | null;
}

export interface NotificationPage {
  items: NotificationInfo[];
  nextCursor: string | null;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  replies: boolean;
  reactions: boolean;
  follows: boolean;
  quests: boolean;
  newChapters: boolean;
  announcements: boolean;
}

export interface ModerationNotice {
  id: string;
  kind: string;
  message: string;
  acknowledgedAt: string | null;
  createdAt: string;
  moderationAction: {
    id: string;
    action: string;
    reasonCode: string;
    reason: string | null;
    createdAt: string;
  } | null;
}

export interface PostInfo {
  id: string;
  parentId: string | null;
  body: string;
  isSpoiler: boolean;
  createdAt: string;
  author: PublicIdentity | null;
  username: string;
  level: number | null;
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  chapterNumber: number | null;
  series: { canonicalId: string; title: string; coverUrl?: string | null } | null;
  seriesTags: {
    canonicalId: string;
    title: string;
    coverUrl?: string | null;
    chapterNumber: number | null;
  }[];
  replies: PostInfo[];
  completedQuests?: QuestCompletion[];
  levelUp?: number | null;
}

export interface QuestInfo {
  id: string;
  name: string;
  description: string;
  cadence: "daily" | "weekly" | "permanent" | "seasonal" | "hidden";
  progress: number;
  target: number;
  completedAt: string | null;
  resetsAt: string | null;
  rewards: RewardInfo[];
}

export interface AdminReport {
  id: string;
  targetType: "post" | "comment" | "user";
  targetId: string;
  reason: string | null;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
  reporter: { username: string; identity: PublicIdentity | null };
  targetIdentity: PublicIdentity | null;
  target:
    | { id: string; body?: string; username?: string; userId?: string; moderationStatus?: string }
    | null;
}

export interface AdminReportResponse {
  capabilities: string[];
  reports: AdminReport[];
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: AuthResponse["user"]["role"];
  status: AuthResponse["user"]["status"];
  usernameChangesLeft: number;
  createdAt: string;
  identity: PublicIdentity | null;
  titles: { titleId: string }[];
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // Backend errors carry a useful message — surface it when present
    let message = `API ${res.status} on ${path} — is the backend running at ${API_URL}?`;
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) message = err.message;
    } catch {
      // not JSON — keep the generic message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const get = <T,>(path: string) => request<T>(path);

export const api = {
  sources: () => get<SourceInfo[]>("/sources"),
  browse: (page = 1) => get<UnifiedCard[]>(`/browse?page=${page}`),
  browseLatest: (page = 1) => get<UnifiedCard[]>(`/browse/latest?page=${page}`),
  browseNew: (page = 1) => get<UnifiedCard[]>(`/browse/new?page=${page}`),
  ranks: () => get<RankedCard[]>("/ranks"),
  recommended: () => get<UnifiedCard[]>("/recommended"),
  searchAll: (q: string, page = 1, status?: "ongoing" | "completed") =>
    get<UnifiedCard[]>(
      `/search?q=${encodeURIComponent(q)}&page=${page}${status ? `&status=${status}` : ""}`,
    ),
  popular: (src: string, page = 1) =>
    get<SeriesSummary[]>(`/sources/${src}/popular?page=${page}`),
  search: (src: string, q: string, page = 1) =>
    get<SeriesSummary[]>(`/sources/${src}/search?q=${encodeURIComponent(q)}&page=${page}`),
  series: (src: string, id: string) =>
    get<SeriesDetail>(`/series/${src}/${encodeURIComponent(id)}`),
  canonicalSources: (canonicalId: string) =>
    get<ServerRef[]>(`/canonical/${encodeURIComponent(canonicalId)}/sources`),
  pages: (src: string, seriesId: string, chapterId: string) =>
    get<PageInfo[]>(
      `/chapters/${src}/${encodeURIComponent(seriesId)}/${encodeURIComponent(chapterId)}/pages`,
    ),

  register: (email: string, username: string, password: string, acceptedTermsVersion: string) =>
    request<AuthResponse>("/auth/register", "POST", {
      email,
      username,
      password,
      acceptedTermsVersion,
      ageConfirmed: true,
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", "POST", { email, password }),
  logout: () => request<{ ok: boolean }>("/auth/logout", "POST", {}),
  acceptTerms: (version: string) =>
    request<{ ok: boolean; acceptedTermsVersion: string }>("/me/terms", "POST", { version }),
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>("/me/account", "DELETE", { password }),
  me: () => get<MeResponse>("/me"),
  reportRead: (canonicalId: string, chapterNumber: number, event: "opened" | "completed" = "opened") =>
    request<{
      ok: boolean;
      newBadges: BadgeMini[];
      levelUp: number | null;
      completedQuests: QuestCompletion[];
    }>(
      "/activity/read",
      "POST",
      { canonicalId, chapterNumber, event },
    ),
  quests: () => get<QuestInfo[]>("/quests"),

  comments: (canonicalId: string, chapterNumber: number) =>
    get<CommentInfo[]>(`/comments/${encodeURIComponent(canonicalId)}/${chapterNumber}`),
  postComment: (
    canonicalId: string,
    chapterNumber: number,
    body: string,
    parentId?: string,
    isSpoiler = false,
  ) =>
    request<CommentInfo & { newBadges: BadgeMini[]; levelUp: number | null }>(
      `/comments/${encodeURIComponent(canonicalId)}/${chapterNumber}`,
      "POST",
      { body, parentId, isSpoiler },
    ),
  syncLibrary: () => get<CloudLibraryEntry[]>("/sync/library"),
  putLibrary: (canonicalId: string, source: string, sourceSeriesId: string) =>
    request<{ ok: boolean }>(`/sync/library/${encodeURIComponent(canonicalId)}`, "PUT", {
      source,
      sourceSeriesId,
    }),
  deleteLibrary: (canonicalId: string) =>
    request<{ ok: boolean }>(`/sync/library/${encodeURIComponent(canonicalId)}`, "DELETE"),
  syncProgress: () => get<CloudProgress[]>("/sync/progress"),
  putProgress: (
    canonicalId: string,
    chapterNumber: number,
    pageIndex: number,
    pageCount?: number,
  ) =>
    request<{ ok: boolean }>(`/sync/progress/${encodeURIComponent(canonicalId)}`, "PUT", {
      chapterNumber,
      pageIndex,
      pageCount,
    }),
  syncReads: (canonicalId: string) =>
    get<number[]>(`/sync/reads/${encodeURIComponent(canonicalId)}`),
  pushReads: (canonicalId: string, numbers: number[]) =>
    request<{ ok: boolean }>(`/sync/reads/${encodeURIComponent(canonicalId)}`, "POST", {
      numbers,
    }),

  feed: (page = 1, canonicalId?: string, feed: "global" | "following" = "global") =>
    get<PostInfo[]>(
      `/posts?page=${page}&feed=${feed}${canonicalId ? `&canonicalId=${canonicalId}` : ""}`,
    ),
  createPost: (
    body: string,
    opts?: {
      canonicalId?: string;
      chapterNumber?: number;
      parentId?: string;
      isSpoiler?: boolean;
      seriesTags?: { canonicalId: string; chapterNumber?: number }[];
    },
  ) =>
    request<PostInfo & { levelUp: number | null; newBadges?: BadgeMini[] }>("/posts", "POST", {
      body,
      ...opts,
    }),
  deletePost: (id: string) => request<{ ok: boolean }>(`/posts/${encodeURIComponent(id)}`, "DELETE"),
  togglePostLike: (id: string) =>
    request<{ liked: boolean; likeCount: number }>(
      `/posts/${encodeURIComponent(id)}/like`,
      "POST",
    ),

  equipTitle: (titleId: string | null) =>
    request<{ ok: boolean; equippedTitleId: string | null }>("/me/title", "POST", { titleId }),
  equipCosmetic: (slot: "avatar" | "frame", cosmeticId: string | null) =>
    request<{ ok: boolean }>("/me/cosmetic", "POST", { slot, cosmeticId }),
  updateProfile: (body: { bio?: string | null; username?: string }) =>
    request<{ user: AuthResponse["user"]; bio: string | null; usernameChangesLeft: number }>(
      "/me/profile",
      "PATCH",
      body,
    ),
  updatePrivacy: (privacy: Partial<ProfilePrivacy>) =>
    request<{ ok: boolean }>("/me/privacy", "PATCH", privacy),
  userProfile: (username: string) =>
    get<ProfileInfo>(`/users/${encodeURIComponent(username)}`),
  toggleBlock: (username: string) =>
    request<{ blocked: boolean }>(`/users/${encodeURIComponent(username)}/block`, "POST"),
  follow: (username: string) =>
    request<{ status: "pending" | "accepted" }>(
      `/users/${encodeURIComponent(username)}/follow`,
      "PUT",
    ),
  unfollow: (username: string) =>
    request<{ ok: boolean }>(`/users/${encodeURIComponent(username)}/follow`, "DELETE"),
  followList: (username: string, direction: "followers" | "following") =>
    get<PublicIdentity[]>(`/users/${encodeURIComponent(username)}/${direction}`),
  followRequests: () =>
    get<{ user: PublicIdentity; requestedAt: string }[]>("/me/follow-requests"),
  answerFollowRequest: (userId: string, action: "accept" | "reject") =>
    request<{ ok: boolean; status: string }>(
      `/me/follow-requests/${encodeURIComponent(userId)}`,
      "POST",
      { action },
    ),
  report: (targetType: "post" | "comment" | "user", targetId: string, reason?: string) =>
    request<{ ok: boolean }>("/report", "POST", { targetType, targetId, reason }),

  notifications: (cursor?: string) =>
    get<NotificationPage>(`/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  notificationCount: () => get<{ unread: number }>("/notifications/count"),
  markNotificationsRead: () => request<{ ok: boolean }>("/notifications/read", "POST"),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, "POST"),
  dismissNotification: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${encodeURIComponent(id)}`, "DELETE"),
  notificationPreferences: () => get<NotificationPreferences>("/notifications/preferences"),
  updateNotificationPreferences: (preferences: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>("/notifications/preferences", "PATCH", preferences),
  registerPushDevice: (expoToken: string, platform: "android" | "ios", locale?: string) =>
    request<{ ok: boolean }>("/notifications/devices", "PUT", { expoToken, platform, locale }),
  unregisterPushDevice: (expoToken: string) =>
    request<{ ok: boolean }>("/notifications/devices", "DELETE", { expoToken }),
  moderationNotices: () => get<ModerationNotice[]>("/me/moderation-notices"),
  acknowledgeNotice: (id: string) =>
    request<{ ok: boolean }>(`/me/moderation-notices/${encodeURIComponent(id)}/acknowledge`, "POST"),
  appealNotice: (id: string, message: string) =>
    request<{ ok: boolean }>(`/me/moderation-notices/${encodeURIComponent(id)}/appeal`, "POST", {
      message,
    }),
  deleteComment: (id: string) =>
    request<{ ok: boolean }>(`/comments/${encodeURIComponent(id)}`, "DELETE"),
  toggleLike: (id: string) =>
    request<{ liked: boolean; likeCount: number }>(
      `/comments/${encodeURIComponent(id)}/like`,
      "POST",
    ),

  adminReports: (status: "pending" | "resolved" | "dismissed" = "pending") =>
    get<AdminReportResponse>(`/admin/reports?status=${status}`),
  moderateReport: (
    id: string,
    action:
      | "dismiss"
      | "correct_spoiler"
      | "remove_content"
      | "warn"
      | "suspend_7d"
      | "suspend_30d"
      | "ban",
    reasonCode: string,
    reason: string,
    spoilerState?: boolean,
  ) =>
    request<{ ok: boolean }>(`/admin/reports/${encodeURIComponent(id)}/action`, "POST", {
      action,
      reasonCode,
      reason,
      spoilerState,
    }),
  adminUsers: (q = "") => get<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`),
  changeUserRole: (id: string, role: AuthResponse["user"]["role"], password: string) =>
    request<{ ok: boolean; role: string }>(`/admin/users/${encodeURIComponent(id)}/role`, "PATCH", {
      role,
      password,
    }),
  grantUsernameChange: (id: string, amount = 1) =>
    request<{ ok: boolean; usernameChangesLeft: number }>(
      `/admin/users/${encodeURIComponent(id)}/username-change`,
      "POST",
      { amount },
    ),
  adminTitles: () => get<{ id: string; name: string; rarity: Rarity; description: string }[]>("/admin/titles"),
  grantTitle: (userId: string, titleId: string) =>
    request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}/titles/${encodeURIComponent(titleId)}`, "POST"),
  revokeTitle: (userId: string, titleId: string) =>
    request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}/titles/${encodeURIComponent(titleId)}`, "DELETE"),
};
