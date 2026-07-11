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
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
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
    role: "user" | "moderator" | "admin";
    status: "active" | "suspended" | "banned";
  };
}

export interface CommentInfo {
  id: string;
  parentId?: string | null;
  body: string;
  username: string;
  level: number;
  badgeId?: string | null;
  badgeIcon?: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  replies?: CommentInfo[];
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
  xpForNextLevel: number;
  badges: BadgeInfo[];
}

export interface ProfileInfo {
  id: string;
  username: string;
  level: number;
  memberDays: number;
  title: { id: string; icon: string; name: string } | null;
  stats: { comments: number; likesReceived: number; chaptersRead: number; posts: number };
  badges: { id: string; name: string; icon: string; earnedAt: string }[];
  blockedByMe: boolean;
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
  type: "comment" | "post";
  createdAt: string;
  read: boolean;
  fromUsername: string;
  body: string;
  canonicalId: string | null;
  seriesTitle: string | null;
  chapterNumber: number | null;
}

export interface PostInfo {
  id: string;
  parentId: string | null;
  body: string;
  isSpoiler: boolean;
  createdAt: string;
  username: string;
  level: number;
  badgeId?: string | null;
  badgeIcon?: string | null;
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  chapterNumber: number | null;
  series: { canonicalId: string; title: string; coverUrl?: string | null } | null;
  replies: PostInfo[];
}

export interface AdminReport {
  id: string;
  targetType: "post" | "comment" | "user";
  targetId: string;
  reason: string | null;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
  reporter: { username: string };
  target:
    | { id: string; body?: string; username?: string; userId?: string; moderationStatus?: string }
    | null;
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
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", "POST", { email, password }),
  logout: () => request<{ ok: boolean }>("/auth/logout", "POST", {}),
  acceptTerms: (version: string) =>
    request<{ ok: boolean; acceptedTermsVersion: string }>("/me/terms", "POST", { version }),
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>("/me/account", "DELETE", { password }),
  me: () => get<MeResponse>("/me"),
  reportRead: (canonicalId: string, chapterNumber: number) =>
    request<{ ok: boolean; newBadges: BadgeMini[]; levelUp: number | null }>(
      "/activity/read",
      "POST",
      { canonicalId, chapterNumber },
    ),

  comments: (canonicalId: string, chapterNumber: number) =>
    get<CommentInfo[]>(`/comments/${encodeURIComponent(canonicalId)}/${chapterNumber}`),
  postComment: (canonicalId: string, chapterNumber: number, body: string, parentId?: string) =>
    request<CommentInfo & { newBadges: BadgeMini[]; levelUp: number | null }>(
      `/comments/${encodeURIComponent(canonicalId)}/${chapterNumber}`,
      "POST",
      { body, parentId },
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

  feed: (page = 1, canonicalId?: string) =>
    get<PostInfo[]>(`/posts?page=${page}${canonicalId ? `&canonicalId=${canonicalId}` : ""}`),
  createPost: (
    body: string,
    opts?: { canonicalId?: string; chapterNumber?: number; parentId?: string; isSpoiler?: boolean },
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

  equipTitle: (badgeId: string | null) =>
    request<{ ok: boolean; equippedBadgeId: string | null }>("/me/title", "POST", { badgeId }),
  userProfile: (username: string) =>
    get<ProfileInfo>(`/users/${encodeURIComponent(username)}`),
  toggleBlock: (username: string) =>
    request<{ blocked: boolean }>(`/users/${encodeURIComponent(username)}/block`, "POST"),
  report: (targetType: "post" | "comment" | "user", targetId: string, reason?: string) =>
    request<{ ok: boolean }>("/report", "POST", { targetType, targetId, reason }),

  notifications: () => get<NotificationInfo[]>("/notifications"),
  notificationCount: () => get<{ unread: number }>("/notifications/count"),
  markNotificationsRead: () => request<{ ok: boolean }>("/notifications/read", "POST"),
  deleteComment: (id: string) =>
    request<{ ok: boolean }>(`/comments/${encodeURIComponent(id)}`, "DELETE"),
  toggleLike: (id: string) =>
    request<{ liked: boolean; likeCount: number }>(
      `/comments/${encodeURIComponent(id)}/like`,
      "POST",
    ),

  adminReports: (status: "pending" | "resolved" | "dismissed" = "pending") =>
    get<AdminReport[]>(`/admin/reports?status=${status}`),
  moderateReport: (
    id: string,
    action: "dismiss" | "remove_content" | "warn" | "suspend_7d" | "ban",
    reason: string,
  ) =>
    request<{ ok: boolean }>(`/admin/reports/${encodeURIComponent(id)}/action`, "POST", {
      action,
      reason,
    }),
};
