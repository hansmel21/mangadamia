// Post thread — the full conversation for one post, System Protocol layout:
// kind-colored bracketed title, the root post as a full System window, a
// TOP ◆ / NEW reply sort row, one visible indent level (deeper replies expand
// on demand), and a sticky avatar + input + gradient-send reply bar.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Flag, Send } from "lucide-react-native";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type PostInfo, type ReactionType } from "../../src/api";
import { HunterAvatar } from "../../src/components/HunterAvatar";
import { PostCard } from "../../src/components/PostCard";
import { PostComposer } from "../../src/components/PostComposer";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
import { ScreenTitle } from "../../src/components/SystemUI";
import { POST_KINDS } from "../../src/ranks";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

// Apply fn to the matching node anywhere in the nested thread.
function patchPost(post: PostInfo, id: string, fn: (p: PostInfo) => PostInfo): PostInfo {
  if (post.id === id) return fn(post);
  return { ...post, replies: post.replies.map((r) => patchPost(r, id, fn)) };
}

// Remove a node (and its sub-thread) from anywhere in the tree.
function removeFromReplies(replies: PostInfo[], id: string): PostInfo[] {
  return replies
    .filter((r) => r.id !== id)
    .map((r) => ({ ...r, replies: removeFromReplies(r.replies, id) }));
}

function countComments(p: PostInfo): number {
  return p.replies.reduce((n, r) => n + 1 + countComments(r), 0);
}

function reactionTotal(p: PostInfo): number {
  return Object.values(p.reactions ?? {}).reduce((n, c) => n + c, 0);
}

export default function PostThreadScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<PostInfo | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<PostInfo | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [replySort, setReplySort] = useState<"top" | "new">("top");
  const queryKey = ["post", id] as const;

  const startReply = (target: PostInfo) => {
    setQuoteTarget(null);
    setReplyTarget(target);
    setComposerOpen(true);
  };
  const startQuote = (target: PostInfo) => {
    setReplyTarget(null);
    setQuoteTarget(target);
    setComposerOpen(true);
  };

  const thread = useQuery({ queryKey, queryFn: () => api.post(id), enabled: !!id });
  const post = thread.data;
  // Viewer identity for the sticky reply bar's avatar (shares the "me" cache).
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: !!user, staleTime: 60_000 });

  // Top-level comments sorted client-side: TOP by reactions, NEW by recency.
  const sortedComments = useMemo(() => {
    const replies = post?.replies ?? [];
    return [...replies].sort((a, b) =>
      replySort === "top"
        ? reactionTotal(b) - reactionTotal(a) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [post?.replies, replySort]);

  const patch = (targetId: string, fn: (p: PostInfo) => PostInfo) =>
    queryClient.setQueryData<PostInfo>(queryKey, (old) => (old ? patchPost(old, targetId, fn) : old));

  const react = async (p: PostInfo, type: ReactionType) => {
    if (!user) return;
    try {
      const res = await api.reactToPost(p.id, type);
      patch(p.id, (x) => ({ ...x, reactions: res.reactions, myReaction: res.myReaction }));
    } catch {
      /* ignore */
    }
  };
  const vote = async (p: PostInfo, optionId: string) => {
    if (!user) return;
    try {
      const poll = await api.votePoll(p.id, optionId);
      patch(p.id, (x) => ({ ...x, poll }));
    } catch {
      /* ignore */
    }
  };

  const remove = async (p: PostInfo) => {
    try {
      await api.deletePost(p.id);
      if (p.id === post?.id) {
        // The root post is gone — leave the thread.
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        router.back();
        return;
      }
      queryClient.setQueryData<PostInfo>(queryKey, (old) =>
        old ? { ...old, replies: removeFromReplies(old.replies, p.id) } : old,
      );
    } catch {
      /* ignore */
    }
  };

  const kindMeta = post ? (POST_KINDS[post.kind] ?? POST_KINDS.record) : POST_KINDS.record;
  const total = post ? (post.commentCount ?? countComments(post)) : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* header — back + kind-colored thread title + report */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle color={kindMeta.color} size={15}>
          {kindMeta.label} THREAD
        </ScreenTitle>
        {post && !post.mine ? (
          <Pressable
            style={styles.headerReport}
            hitSlop={10}
            onPress={() => setReportTarget({ type: "post", id: post.id, username: post.username })}
            accessibilityLabel="Report post"
          >
            <Flag color={colors.muted} size={16} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {thread.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : thread.isError || !post ? (
        <View style={styles.missing}>
          <Text style={styles.missingText}>This post is no longer available.</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>GO BACK</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 110, paddingTop: 0 }}>
          <PostCard
            post={post}
            root
            hideReplies
            onReact={react}
            onVote={vote}
            onReply={startReply}
            onQuote={startQuote}
            onDelete={remove}
            onReport={(p) => setReportTarget({ type: "post", id: p.id, username: p.username })}
            viewerSignedIn={!!user}
          />

          {/* replies rule — REPLIES ——— TOP ◆ / NEW */}
          <View style={styles.repliesRule}>
            <Text style={styles.repliesLabel}>
              {total > 0 ? `REPLIES · ${total}` : "NO REPLIES YET"}
            </Text>
            <View style={styles.ruleLine} />
            <Pressable hitSlop={8} onPress={() => setReplySort("top")}>
              <Text style={[styles.sortOption, replySort === "top" && styles.sortOptionOn]}>
                TOP {replySort === "top" ? "◆" : ""}
              </Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => setReplySort("new")}>
              <Text style={[styles.sortOption, replySort === "new" && styles.sortOptionOn]}>
                NEW {replySort === "new" ? "◆" : ""}
              </Text>
            </Pressable>
          </View>

          {sortedComments.map((comment) => (
            <View key={comment.id} style={styles.commentThread}>
              <PostCard
                post={comment}
                isReply
                onReact={react}
                onVote={vote}
                onReply={startReply}
                onDelete={remove}
                onReport={(p) => setReportTarget({ type: "post", id: p.id, username: p.username })}
                viewerSignedIn={!!user}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {/* sticky reply bar — avatar + input + gradient send key */}
      {user && post ? (
        <View style={[styles.replyBar, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
          {me.data?.identity ? (
            <HunterAvatar identity={me.data.identity} size={30} showRank={false} />
          ) : null}
          <Pressable style={styles.replyInput} onPress={() => startReply(post)}>
            <Text style={styles.replyInputText}>Add to the record…</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.sendKey, pressed && { transform: [{ scale: 0.94 }] }]}
            onPress={() => startReply(post)}
            accessibilityRole="button"
            accessibilityLabel="Reply"
          >
            <Send color="#fff" size={16} strokeWidth={2} />
          </Pressable>
        </View>
      ) : !user ? (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Status tab to join in.</Text>
        </View>
      ) : null}

      {post ? (
        <PostComposer
          visible={composerOpen}
          onClose={() => {
            setComposerOpen(false);
            setReplyTarget(null);
            setQuoteTarget(null);
          }}
          replyTo={quoteTarget ? undefined : (replyTarget ?? post)}
          quote={quoteTarget ?? undefined}
          onPosted={() => {
            queryClient.invalidateQueries({ queryKey });
            queryClient.invalidateQueries({ queryKey: ["feed"] });
          }}
        />
      ) : null}
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerReport: { marginLeft: "auto" },
  repliesRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
  },
  repliesLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  ruleLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  sortOption: { color: colors.muted, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  sortOptionOn: { color: colors.accentBright, fontWeight: "900" },
  // Each top-level comment thread is its own contrasting card, so it's obvious
  // where one thread ends and the next begins.
  commentThread: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 12,
  },
  missing: { alignItems: "center", marginTop: 72, gap: 16, paddingHorizontal: 24 },
  missingText: { color: colors.muted, textAlign: "center", lineHeight: 22 },
  backBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 3,
    paddingVertical: 9,
    paddingHorizontal: 20,
  },
  backText: { color: colors.accentSoft, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  replyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.4)",
    borderRadius: 3,
    backgroundColor: colors.card,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  replyInputText: { color: colors.muted, fontSize: 12.5 },
  sendKey: {
    width: 38,
    height: 38,
    borderRadius: 3,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  signedOut: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  signedOutText: { color: colors.muted, textAlign: "center", fontSize: 13 },
});
