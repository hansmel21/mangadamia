// DUNGEON — the social wall, System Protocol layout: in-screen bracketed
// title + ARENA key, a single-row filter deck (kind chips + sort cycle key),
// System Record cards, and the gradient NEW RECORD key. Tap a post to open
// the full thread.
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Plus, Trophy, X } from "lucide-react-native";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSwitchFade } from "../../src/anim";
import { api, type PostInfo, type ReactionType } from "../../src/api";
import { PostCard } from "../../src/components/PostCard";
import { PostComposer } from "../../src/components/PostComposer";
import { ReportModal, type ReportTarget } from "../../src/components/ReportModal";
import { ScreenTitle, SystemKey } from "../../src/components/SystemUI";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

function openThread(post: PostInfo) {
  router.push({ pathname: "/post/[id]", params: { id: post.id } });
}

const SORT_ORDER = ["hot", "top", "new"] as const;

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { topic: routeTopic } = useLocalSearchParams<{ topic?: string }>();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<PostInfo | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [feedMode, setFeedMode] = useState<"global" | "following">("global");
  const [typeFilter, setTypeFilter] = useState<"all" | "theory" | "review">("all");
  const [sort, setSort] = useState<"new" | "top" | "hot">("new");
  const [topic, setTopic] = useState("");
  useEffect(() => {
    if (typeof routeTopic === "string" && /^[a-zA-Z0-9_]{2,40}$/.test(routeTopic)) {
      setTopic(routeTopic);
    }
  }, [routeTopic]);
  const queryKey = ["feed", feedMode, typeFilter, sort, topic] as const;

  const feed = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.feed(
        pageParam,
        undefined,
        feedMode,
        typeFilter === "all" ? undefined : typeFilter,
        sort,
        topic || undefined,
      ),
    getNextPageParam: (last, pages) => (last.length > 0 ? pages.length + 1 : undefined),
  });

  const posts = feed.data?.pages.flat() ?? [];
  // Cross-fade + rise the list whenever the type/scope/sort changes.
  const listFade = useSwitchFade(`${feedMode}:${typeFilter}:${sort}`);

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
      removeFromFeed(p.id);
    } catch {
      /* ignore */
    }
  };

  const cycleSort = () => setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* header — bracketed title + ARENA key */}
      <View style={styles.header}>
        <ScreenTitle>DUNGEON</ScreenTitle>
        <Pressable
          style={({ pressed }) => [styles.arenaKey, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/arena")}
          accessibilityRole="button"
          accessibilityLabel="Arena"
        >
          <Trophy color={colors.foil} size={13} strokeWidth={2} />
          <Text style={styles.arenaText}>ARENA</Text>
        </Pressable>
      </View>

      {/* filter deck — kind chips + FOLLOWING scope + sort cycle key */}
      <View style={styles.deck}>
        {(["all", "theory", "review"] as const).map((f) => (
          <SystemKey
            key={f}
            variant="chip"
            label={f === "all" ? "ALL" : f === "theory" ? "THEORIES" : "REVIEWS"}
            active={typeFilter === f && feedMode === "global"}
            onPress={() => {
              setTypeFilter(f);
              setFeedMode("global");
            }}
          />
        ))}
        <SystemKey
          variant="chip"
          label="FOLLOWING"
          active={feedMode === "following"}
          disabled={!user}
          onPress={() => {
            setFeedMode("following");
            setTypeFilter("all");
          }}
        />
        <Pressable
          style={({ pressed }) => [styles.sortKey, pressed && { opacity: 0.7 }]}
          onPress={cycleSort}
          accessibilityRole="button"
          accessibilityLabel="Cycle sort order"
        >
          <Text style={styles.sortText}>{sort.toUpperCase()} ▾</Text>
        </Pressable>
      </View>

      {topic ? (
        <View style={styles.topicRow}>
          <Text style={styles.topicText}>TOPIC #{topic}</Text>
          <Pressable
            style={styles.topicClear}
            hitSlop={10}
            onPress={() => {
              setTopic("");
              router.setParams({ topic: undefined });
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear topic filter"
          >
            <X color={colors.muted} size={14} strokeWidth={2.2} />
            <Text style={styles.topicClearText}>CLEAR</Text>
          </Pressable>
        </View>
      ) : null}

      {feed.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <Animated.View style={[{ flex: 1 }, listFade]}>
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                preview
                onOpen={openThread}
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
            contentContainerStyle={{ paddingBottom: 96, paddingTop: 2 }}
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => feed.refetch()}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {topic
                  ? `No records for #${topic} yet.\nStart the topic.`
                  : "The dungeon is silent.\nBe the first to post something."}
              </Text>
            }
          />
        </Animated.View>
      )}

      {user ? (
        <SystemKey
          label="NEW RECORD"
          icon={<Plus color="#fff" size={15} strokeWidth={2.4} />}
          arrow={false}
          onPress={() => {
            setQuoteTarget(null);
            setComposerOpen(true);
          }}
          style={styles.fab}
        />
      ) : (
        <View style={styles.signedOut}>
          <Text style={styles.signedOutText}>Sign in from the Status tab to post.</Text>
        </View>
      )}

      <PostComposer
        visible={composerOpen}
        quote={quoteTarget ?? undefined}
        onClose={() => {
          setComposerOpen(false);
          setQuoteTarget(null);
        }}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  arenaKey: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  arenaText: { color: colors.foilSoft, fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
  deck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 16,
    marginTop: 10,
  },
  sortKey: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  sortText: { color: colors.accentBright, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(76,195,138,0.35)",
    borderRadius: 3,
    backgroundColor: "rgba(76,195,138,0.08)",
  },
  topicText: { color: colors.fresh, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  topicClear: { flexDirection: "row", alignItems: "center", gap: 4 },
  topicClearText: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 60, lineHeight: 22 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
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
