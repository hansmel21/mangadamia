// Dungeons tab — the social wall. Reader posts newest-first via the shared
// PostCard in preview mode: tap a post to open the full conversation. The +
// button opens the composer for a new post.
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../../src/anim";
import { api, type PostInfo, type ReactionType } from "../../src/api";
import { PostCard } from "../../src/components/PostCard";
import { PostComposer } from "../../src/components/PostComposer";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

function openThread(post: PostInfo) {
  router.push({ pathname: "/post/[id]", params: { id: post.id } });
}

export default function FeedScreen() {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [feedMode, setFeedMode] = useState<"global" | "following">("global");
  const [typeFilter, setTypeFilter] = useState<"all" | "theory" | "review">("all");
  const queryKey = ["feed", feedMode, typeFilter] as const;

  const feed = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.feed(pageParam, undefined, feedMode, typeFilter === "all" ? undefined : typeFilter),
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
      <View style={styles.filterRow}>
        {(["all", "theory", "review"] as const).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, typeFilter === f && styles.filterChipOn]}
            onPress={() => setTypeFilter(f)}
          >
            <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextOn]}>
              {f === "all" ? "ALL" : f === "theory" ? "THEORIES" : "REVIEWS"}
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
              preview
              onOpen={openThread}
              onReact={react}
              onDelete={remove}
              onReport={(post) =>
                setReportTarget({ type: "post", id: post.id, username: post.username })
              }
              viewerSignedIn={!!user}
            />
          )}
          contentContainerStyle={{ paddingBottom: 90, paddingTop: 2 }}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => feed.refetch()}
          ListEmptyComponent={
            <Text style={styles.empty}>
              The dungeon is silent.{"\n"}Be the first to post something.
            </Text>
          }
        />
      )}

      {user ? (
        <Pressable
          style={(s) => [styles.fab, pressFx(s)]}
          onPress={() => setComposerOpen(true)}
        >
          <Plus color={colors.accentText} size={26} strokeWidth={2.4} />
        </Pressable>
      ) : (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Account tab to post.</Text>
        </View>
      )}

      <PostComposer visible={composerOpen} onClose={() => setComposerOpen(false)} />
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
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipOn: { borderColor: "rgba(124,92,255,0.7)", backgroundColor: "rgba(124,92,255,0.14)" },
  filterChipText: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
  filterChipTextOn: { color: colors.accentSoft },
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
