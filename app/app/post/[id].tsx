// Post thread — the full conversation for one post. Opened by tapping a card
// in the Dungeons feed or a series wall. Shows the root post with every reply
// nested beneath it, plus an always-available reply bar.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type PostInfo, type ReactionType } from "../../src/api";
import { PostCard } from "../../src/components/PostCard";
import { PostComposer } from "../../src/components/PostComposer";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
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

export default function PostThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<PostInfo | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const queryKey = ["post", id] as const;

  const startReply = (target: PostInfo) => {
    setReplyTarget(target);
    setComposerOpen(true);
  };

  const thread = useQuery({ queryKey, queryFn: () => api.post(id), enabled: !!id });
  const post = thread.data;

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

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: post ? `@${post.username}'s post` : "Thread" }} />
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
        <ScrollView contentContainerStyle={{ paddingBottom: 110, paddingTop: 4 }}>
          <PostCard
            post={post}
            onReact={react}
            onReply={startReply}
            onDelete={remove}
            onReport={(p) => setReportTarget({ type: "post", id: p.id, username: p.username })}
            viewerSignedIn={!!user}
          />
          <View style={styles.repliesHeader}>
            {(() => {
              const total = post.commentCount ?? countComments(post);
              return (
                <Text style={styles.repliesHeaderText}>
                  {total > 0
                    ? `${total} ${total === 1 ? "COMMENT" : "COMMENTS"}`
                    : "NO COMMENTS YET · BE THE FIRST"}
                </Text>
              );
            })()}
          </View>
        </ScrollView>
      )}

      {user && post ? (
        <Pressable style={styles.replyBar} onPress={() => startReply(post)}>
          <Text style={styles.replyBarText}>Add a comment…</Text>
        </Pressable>
      ) : !user ? (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Account tab to join in.</Text>
        </View>
      ) : null}

      {post ? (
        <PostComposer
          visible={composerOpen}
          onClose={() => {
            setComposerOpen(false);
            setReplyTarget(null);
          }}
          replyTo={replyTarget ?? post}
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
  repliesHeader: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 4 },
  repliesHeaderText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  missing: { alignItems: "center", marginTop: 72, gap: 16, paddingHorizontal: 24 },
  missingText: { color: colors.muted, textAlign: "center", lineHeight: 22 },
  backBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 20 },
  backText: { color: colors.accentSoft, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  replyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: "rgba(124,92,255,0.4)",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  replyBarText: { color: colors.muted, fontSize: 14 },
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
