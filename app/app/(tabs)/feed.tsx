// Feed tab — the social wall. Reader posts newest-first via the shared
// PostCard (tappable users, spoiler shields, like/reply/report). The + button
// (or a chapter's Post button) opens the composer.
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../../src/anim";
import { api, type PostInfo } from "../../src/api";
import { PostCard } from "../../src/components/PostCard";
import { PostComposer } from "../../src/components/PostComposer";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

export default function FeedScreen() {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<PostInfo | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [feedMode, setFeedMode] = useState<"global" | "following">("global");
  const queryKey = ["feed", feedMode] as const;

  const feed = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.feed(pageParam, undefined, feedMode),
    getNextPageParam: (last, pages) => (last.length > 0 ? pages.length + 1 : undefined),
  });

  const posts = feed.data?.pages.flat() ?? [];

  const patch = (id: string, fn: (p: PostInfo) => PostInfo) => {
    queryClient.setQueryData<{ pages: PostInfo[][]; pageParams: unknown[] }>(queryKey, (old) => {
      if (!old) return old;
      const walk = (list: PostInfo[]): PostInfo[] =>
        list.map((p) =>
          p.id === id ? fn(p) : p.replies.length ? { ...p, replies: walk(p.replies) } : p,
        );
      return { ...old, pages: old.pages.map(walk) };
    });
  };
  const removeFromFeed = (id: string) => {
    queryClient.setQueryData<{ pages: PostInfo[][]; pageParams: unknown[] }>(queryKey, (old) => {
      if (!old) return old;
      const walk = (list: PostInfo[]): PostInfo[] =>
        list.filter((p) => p.id !== id).map((p) => ({ ...p, replies: walk(p.replies) }));
      return { ...old, pages: old.pages.map(walk) };
    });
  };

  const like = async (p: PostInfo) => {
    if (!user) return;
    try {
      const res = await api.togglePostLike(p.id);
      patch(p.id, (x) => ({ ...x, likedByMe: res.liked, likeCount: res.likeCount }));
    } catch {
      /* ignore */
    }
  };
  const remove = async (p: PostInfo) => {
    try {
      await api.deletePost(p.id);
      removeFromFeed(p.id);
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.feedTabs}>
        {(["global", "following"] as const).map((mode) => (
          <Pressable
            key={mode}
            disabled={mode === "following" && !user}
            style={[
              styles.feedTab,
              feedMode === mode && styles.feedTabActive,
              mode === "following" && !user && { opacity: 0.35 },
            ]}
            onPress={() => setFeedMode(mode)}
          >
            <Text style={[styles.feedTabText, feedMode === mode && styles.feedTabTextActive]}>
              {mode.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {feed.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={like}
              onReply={(p) => {
                setReplyTo(p);
                setComposerOpen(true);
              }}
              onDelete={remove}
              onReport={(post) =>
                setReportTarget({ type: "post", id: post.id, username: post.username })
              }
              viewerSignedIn={!!user}
            />
          )}
          contentContainerStyle={{ paddingBottom: 90 }}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => feed.refetch()}
          ListEmptyComponent={
            <Text style={styles.empty}>
              The wall is quiet.{"\n"}Be the first to post something.
            </Text>
          }
        />
      )}

      {user ? (
        <Pressable
          style={(s) => [styles.fab, pressFx(s)]}
          onPress={() => {
            setReplyTo(null);
            setComposerOpen(true);
          }}
        >
          <Plus color={colors.accentText} size={26} strokeWidth={2.4} />
        </Pressable>
      ) : (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Account tab to post.</Text>
        </View>
      )}

      <PostComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        replyTo={replyTo ?? undefined}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  feedTabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  feedTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  feedTabActive: { borderBottomColor: colors.accent },
  feedTabText: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  feedTabTextActive: { color: colors.accentSoft },
  empty: { color: colors.muted, textAlign: "center", marginTop: 60, lineHeight: 22 },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
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
