// Client for our own backend API (the /api folder of this repo).
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
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

// Post images from the dev local-disk adapter are stored as relative
// "/uploads/…" paths; resolve those against the API host. Absolute URLs
// (Cloudinary in prod, Giphy GIFs) pass through untouched.
export function resolveMediaUrl(url: string): string {
  return url.startsWith("/") ? `${API_URL}${url}` : url;
}

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

export interface GuildCrestInfo {
  id: string;
  name: string;
  tag: string;
  emblemKey: string;
  primaryColor: string;
  secondaryColor: string | null;
  level: number;
}

export interface PublicIdentity {
  id: string | null;
  username: string;
  level: number | null;
  avatar: CosmeticMini | null;
  frame: CosmeticMini | null;
  title: { id: string; name: string; rarity: Rarity } | null;
  guild: GuildCrestInfo | null;
  staffMarker: { label: string; role: string } | null;
  anonymized: boolean;
}

export type GuildRole = "guildmaster" | "officer" | "member";
export type GuildJoinPolicy = "open" | "request" | "invite";

export interface GuildSummary {
  id: string;
  name: string;
  tag: string;
  emblemKey: string;
  primaryColor: string;
  secondaryColor: string | null;
  motto: string | null;
  level: number;
  xp: number;
  memberCount: number;
  memberCap: number;
  joinPolicy: GuildJoinPolicy;
  rank: number | null;
  mine: boolean;
}

export interface GuildMemberInfo {
  role: GuildRole;
  contributionXp: number;
  weeklyXp: number;
  joinedAt: string;
  identity: PublicIdentity | null;
}

export interface GuildDetail {
  id: string;
  name: string;
  tag: string;
  emblemKey: string;
  primaryColor: string;
  secondaryColor: string | null;
  motto: string | null;
  description: string | null;
  decorationKey: string | null;
  joinPolicy: GuildJoinPolicy;
  guildmasterId: string;
  level: number;
  perks: { key: string; level: number; label: string; unlocked: boolean }[];
  decorations: { key: string; name: string; minLevel: number; unlocked: boolean }[];
  xp: number;
  xpFloor: number;
  xpForNextLevel: number;
  power: number;
  memberCount: number;
  memberCap: number;
  myRole: GuildRole | null;
  inAnotherGuild: boolean;
  joinRequestPending: boolean;
  invitePending: boolean;
  members: GuildMemberInfo[];
  pendingRequests: { identity: PublicIdentity | null; requestedAt: string }[];
  pendingInvites: {
    identity: PublicIdentity | null;
    invitedBy: PublicIdentity | null;
    invitedAt: string;
  }[];
}

// One side of a weekly guild war (crest + live score).
export interface GuildWarSide {
  id: string;
  name: string;
  tag: string;
  emblemKey: string;
  primaryColor: string;
  secondaryColor: string | null;
  score: number;
}

export interface GuildWarInfo {
  id: string;
  weekKey: string;
  weekNo: number;
  endsAt: string;
  sideA: GuildWarSide;
  sideB: GuildWarSide;
}

export interface GuildWarHistoryEntry {
  id: string;
  weekKey: string;
  weekNo: number;
  opponent: Omit<GuildWarSide, "score">;
  myScore: number;
  theirScore: number;
  result: "won" | "lost" | "draw";
}

export interface GuildRaidInfo {
  weekKey: string;
  weekNo: number;
  target: number;
  progress: number;
  completed: boolean;
  bonusXp: number;
  resetsAt: string;
  myShare: number | null;
}

// This week's rotating co-op side quest (posts / replies / reactions).
export interface GuildEventInfo {
  weekKey: string;
  weekNo: number;
  eventType: string;
  title: string;
  target: number;
  progress: number;
  completed: boolean;
  bonusXp: number;
  resetsAt: string;
  myShare: number | null;
}

export interface GuildEventHistoryEntry {
  id: string;
  weekKey: string;
  weekNo: number;
  eventType: string;
  title: string;
  target: number;
  progress: number;
  completed: boolean;
  bonusXp: number;
}

// ── Arena (weekly games + leaderboard) ──────────────────────────────────────
export type ArenaStatus = "upcoming" | "live" | "ended";

export interface ArenaEventSummary {
  id: string;
  kind: "quiz" | "poll";
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: ArenaStatus;
  entryCount: number;
  entered: boolean;
  myScore: number | null;
}

export interface ArenaEventsResponse {
  weekNo: number;
  weekEndsAt: string;
  events: ArenaEventSummary[];
}

export interface ArenaQuizDetail extends ArenaEventSummary {
  kind: "quiz";
  durationSec: number;
  questionCount: number;
  questions: { q: string; options: string[] }[];
  // Answer key — null until the reader has entered (or the event ended).
  answers: number[] | null;
  myAnswers: number[] | null;
}

export interface ArenaPollDetail extends ArenaEventSummary {
  kind: "poll";
  options: string[];
  votes: number[];
  totalVotes: number;
  myVote: number | null;
}

export interface WeeklyBoardRow {
  rank: number;
  xp: number;
  identity: PublicIdentity | null;
}

export interface WeeklyBoardResponse {
  weekNo: number;
  weekEndsAt: string;
  rows: WeeklyBoardRow[];
  me: { rank: number; xp: number } | null;
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
  reactions: Record<string, number>;
  myReaction: string | null;
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

export type PostKind = "record" | "theory" | "review" | "spoiler_intel" | "poll";
export type ReactionType = "like" | "hype" | "mindblown" | "pain" | "dead";

export interface PollInfo {
  options: { id: string; text: string; votes: number }[];
  totalVotes: number;
  myVote: string | null;
}

// One GIF from the picker's search grid (server-side Giphy/Tenor proxy).
export interface GifResult {
  id: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

export interface GifSearchPage {
  configured: boolean;
  provider: "giphy" | "tenor" | null;
  results: GifResult[];
  next: string | null;
}

export interface QuotedPostInfo {
  id: string;
  author: PublicIdentity | null;
  username: string;
  body: string;
  kind: PostKind;
  rating: number | null;
  gifUrl: string | null;
  imageUrls: string[];
  isSpoiler: boolean;
  createdAt: string;
  series: { canonicalId: string; title: string; coverUrl?: string | null } | null;
}

export interface SeriesReviewSummary {
  canonicalId: string;
  count: number;
  average: number;
  rank: "E" | "D" | "C" | "B" | "A" | "S" | null;
  myReview: { id: string; rating: number; body: string } | null;
}

export interface PostInfo {
  id: string;
  parentId: string | null;
  body: string;
  kind: PostKind;
  rating: number | null;
  gifUrl: string | null;
  imageUrls: string[];
  isSpoiler: boolean;
  createdAt: string;
  author: PublicIdentity | null;
  username: string;
  level: number | null;
  // Per-type reaction counts, e.g. { endorse: 42, hype: 8 }.
  reactions: Record<string, number>;
  myReaction: string | null;
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
  // Total comments in the whole thread (all nesting levels). Present on feed
  // preview cards and the thread root; absent on freshly created replies.
  commentCount?: number;
  // Present on poll posts.
  poll?: PollInfo | null;
  // Present on quote-reposts: the embedded post being quoted.
  quotedPost?: QuotedPostInfo | null;
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
  // Raw-JPEG binary upload (the composer re-encodes to JPEG first).
  uploadImage: async (fileUri: string): Promise<{ url: string }> => {
    const token = getToken();
    const res = await FileSystem.uploadAsync(`${API_URL}/uploads/image`, fileUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "content-type": "image/jpeg",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status < 200 || res.status >= 300) {
      let message = `Image upload failed (${res.status})`;
      try {
        const parsed = JSON.parse(res.body) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        // keep the fallback message
      }
      throw new Error(message);
    }
    return JSON.parse(res.body) as { url: string };
  },
  searchGifs: (q: string, cursor?: string) =>
    get<GifSearchPage>(
      `/gifs/search?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
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
    request<CommentInfo & { newBadges: BadgeMini[]; levelUp: number | null; xpAwarded?: number }>(
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

  feed: (
    page = 1,
    canonicalId?: string,
    feed: "global" | "following" = "global",
    kind?: "theory" | "review",
    sort: "new" | "top" | "hot" = "new",
    topic?: string,
  ) =>
    get<PostInfo[]>(
      `/posts?page=${page}&feed=${feed}&sort=${sort}${
        canonicalId ? `&canonicalId=${canonicalId}` : ""
      }${kind ? `&kind=${kind}` : ""}${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`,
    ),
  post: (id: string) => get<PostInfo>(`/posts/${encodeURIComponent(id)}`),
  seriesReviews: (canonicalId: string) =>
    get<SeriesReviewSummary>(`/canonical/${encodeURIComponent(canonicalId)}/reviews`),
  createPost: (
    body: string,
    opts?: {
      canonicalId?: string;
      chapterNumber?: number;
      parentId?: string;
      isSpoiler?: boolean;
      kind?: PostKind;
      rating?: number;
      gifUrl?: string;
      imageUrls?: string[];
      pollOptions?: string[];
      quotedPostId?: string;
      seriesTags?: { canonicalId: string; chapterNumber?: number }[];
    },
  ) =>
    request<PostInfo & { levelUp: number | null; newBadges?: BadgeMini[]; xpAwarded?: number }>(
      "/posts",
      "POST",
      { body, ...opts },
    ),
  deletePost: (id: string) => request<{ ok: boolean }>(`/posts/${encodeURIComponent(id)}`, "DELETE"),
  reactToPost: (id: string, type: ReactionType) =>
    request<{ reactions: Record<string, number>; myReaction: string | null }>(
      `/posts/${encodeURIComponent(id)}/react`,
      "POST",
      { type },
    ),
  votePoll: (id: string, optionId: string) =>
    request<PollInfo>(`/posts/${encodeURIComponent(id)}/vote`, "POST", { optionId }),

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

  // ── Guilds ──────────────────────────────────────────────────────────────
  guilds: (sort: "level" | "new" = "level", q?: string) =>
    get<GuildSummary[]>(`/guilds?sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  guild: (id: string) => get<GuildDetail>(`/guilds/${encodeURIComponent(id)}`),
  myGuild: () => get<{ guildId: string | null; role: GuildRole | null }>("/me/guild"),
  createGuild: (body: {
    name: string;
    tag: string;
    emblemKey: string;
    primaryColor: string;
    secondaryColor?: string | null;
    motto?: string | null;
  }) => request<{ id: string }>("/guilds", "POST", body),
  joinGuild: (id: string) =>
    request<{ status: "joined" | "requested" }>(`/guilds/${encodeURIComponent(id)}/join`, "POST"),
  leaveGuild: (id: string) =>
    request<{ status: "left" | "dissolved" }>(`/guilds/${encodeURIComponent(id)}/leave`, "POST"),
  answerGuildRequest: (id: string, userId: string, action: "accept" | "reject") =>
    request<{ ok: boolean; status: string }>(
      `/guilds/${encodeURIComponent(id)}/requests/${encodeURIComponent(userId)}`,
      "POST",
      { action },
    ),
  inviteToGuild: (id: string, username: string) =>
    request<{ status: "invited" | "joined"; username: string }>(
      `/guilds/${encodeURIComponent(id)}/invites`,
      "POST",
      { username },
    ),
  respondToGuildInvite: (id: string, action: "accept" | "decline") =>
    request<{ status: "joined" | "declined" }>(
      `/guilds/${encodeURIComponent(id)}/invites/respond`,
      "POST",
      { action },
    ),
  revokeGuildInvite: (id: string, userId: string) =>
    request<{ ok: boolean }>(
      `/guilds/${encodeURIComponent(id)}/invites/${encodeURIComponent(userId)}`,
      "DELETE",
    ),
  kickGuildMember: (id: string, userId: string) =>
    request<{ ok: boolean }>(
      `/guilds/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      "DELETE",
    ),
  setGuildRole: (id: string, userId: string, role: GuildRole) =>
    request<{ ok: boolean; role: GuildRole }>(
      `/guilds/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/role`,
      "POST",
      { role },
    ),
  updateGuild: (
    id: string,
    body: Partial<{
      name: string;
      tag: string;
      emblemKey: string;
      primaryColor: string;
      secondaryColor: string | null;
      motto: string | null;
      description: string | null;
      joinPolicy: GuildJoinPolicy;
      decorationKey: string | null;
    }>,
  ) => request<{ ok: boolean }>(`/guilds/${encodeURIComponent(id)}`, "PATCH", body),
  guildWar: (id: string) =>
    get<{ war: GuildWarInfo | null }>(`/guilds/${encodeURIComponent(id)}/war`),
  guildWars: (id: string) =>
    get<GuildWarHistoryEntry[]>(`/guilds/${encodeURIComponent(id)}/wars`),
  guildRaid: (id: string) => get<GuildRaidInfo>(`/guilds/${encodeURIComponent(id)}/raid`),
  guildEvent: (id: string) => get<GuildEventInfo>(`/guilds/${encodeURIComponent(id)}/event`),
  guildEvents: (id: string) =>
    get<GuildEventHistoryEntry[]>(`/guilds/${encodeURIComponent(id)}/events`),
  guildBoard: (id: string, page = 1) =>
    get<(PostInfo & { pinned: boolean; authorRole: GuildRole | null })[]>(
      `/guilds/${encodeURIComponent(id)}/board?page=${page}`,
    ),
  createGuildPost: (id: string, body: string, isSpoiler?: boolean) =>
    request<{ id: string }>(`/guilds/${encodeURIComponent(id)}/board`, "POST", {
      body,
      isSpoiler,
    }),
  pinGuildPost: (postId: string) =>
    request<{ ok: boolean; pinned: boolean }>(
      `/posts/${encodeURIComponent(postId)}/pin`,
      "POST",
    ),
  arenaEvents: () => get<ArenaEventsResponse>("/arena/events"),
  arenaEvent: (id: string) =>
    get<ArenaQuizDetail | ArenaPollDetail>(`/arena/events/${encodeURIComponent(id)}`),
  arenaQuizEntry: (id: string, answers: number[], ms: number) =>
    request<{
      ok: boolean;
      score: number;
      total: number;
      answers: number[];
      xpAwarded: number;
      levelUp: number | null;
      completedQuests: QuestCompletion[];
    }>(`/arena/events/${encodeURIComponent(id)}/entry`, "POST", { answers, ms }),
  arenaPollVote: (id: string, option: number) =>
    request<{ ok: boolean; myVote: number; xpAwarded: number }>(
      `/arena/events/${encodeURIComponent(id)}/entry`,
      "POST",
      { option },
    ),
  weeklyBoard: () => get<WeeklyBoardResponse>("/arena/leaderboards/weekly_xp"),

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
  reactToComment: (id: string, type: ReactionType) =>
    request<{
      reactions: Record<string, number>;
      myReaction: string | null;
      completedQuests: QuestCompletion[];
      levelUp: number | null;
    }>(`/comments/${encodeURIComponent(id)}/react`, "POST", { type }),

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
