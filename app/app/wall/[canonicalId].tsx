// A single series' wall — posts filtered to one canonical series.
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
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

export default function SeriesWallScreen() {
  const { canonicalId, title } = useLocalSearchParams<{ canonicalId: string; title?: string }>();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<PostInfo | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const feed = useInfiniteQuery({
    queryKey: ["wall", canonicalId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.feed(pageParam, canonicalId),
    getNextPageParam: (last, pages) => (last.length > 0 ? pages.length + 1 : undefined),
  });
  const posts = feed.data?.pages.flat() ?? [];

  const key = ["wall", canonicalId];
  const patch = (id: string, fn: (p: PostInfo) => PostInfo) => {
    queryClient.setQueryData<{ pages: PostInfo[][]; pageParams: unknown[] }>(key, (old) => {
      if (!old) return old;
      const walk = (l: PostInfo[]): PostInfo[] =>
        l.map((p) => (p.id === id ? fn(p) : p.replies.length ? { ...p, replies: walk(p.replies) } : p));
      return { ...old, pages: old.pages.map(walk) };
    });
  };
  const drop = (id: string) => {
    queryClient.setQueryData<{ pages: PostInfo[][]; pageParams: unknown[] }>(key, (old) => {
      if (!old) return old;
      const walk = (l: PostInfo[]): PostInfo[] =>
        l.filter((p) => p.id !== id).map((p) => ({ ...p, replies: walk(p.replies) }));
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
      drop(p.id);
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: title ? `${title} · Wall` : "Wall" }} />
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
              onOpen={(p) => router.push({ pathname: "/post/[id]", params: { id: p.id } })}
              onReact={react}
              onVote={vote}
              onQuote={(p) => {
                setQuoteTarget(p);
                setComposerOpen(true);
              }}
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
            <Text style={styles.empty}>No posts about this series yet.{"\n"}Start the conversation.</Text>
          }
        />
      )}

      {user ? (
        <Pressable
          style={(s) => [styles.fab, pressFx(s)]}
          onPress={() => {
            setQuoteTarget(null);
            setComposerOpen(true);
          }}
        >
          <Plus color={colors.accentText} size={26} strokeWidth={2.4} />
        </Pressable>
      ) : null}

      <PostComposer
        visible={composerOpen}
        quote={quoteTarget ?? undefined}
        onClose={() => {
          setComposerOpen(false);
          setQuoteTarget(null);
        }}
        context={
          quoteTarget || !canonicalId
            ? undefined
            : { canonicalId, title: title ?? "this series" }
        }
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
});
