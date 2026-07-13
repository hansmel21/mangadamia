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
import { useQuery } from "@tanstack/react-query";
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
  const [feedMode, setFeedMode] = useState<"global" | "following" | "guild">("global");
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

  const feedPosts = feed.data?.pages.flat() ?? [];
  // Cross-fade + rise the list whenever the type/scope/sort changes.
  const listKey = `${feedMode}:${typeFilter}:${sort}:${topic}`;
  const listFade = useSwitchFade(listKey);

  // Guild-war rally card: pinned above the feed while the viewer's guild has
  // an active war — reading and posting here is contributing.
  const myGuild = useQuery({ queryKey: ["myGuild"], queryFn: api.myGuild, enabled: !!user });
  const myGuildId = myGuild.data?.guildId ?? null;
  const war = useQuery({
    queryKey: ["guildWar", myGuildId],
    queryFn: () => api.guildWar(myGuildId as string),
    enabled: !!myGuildId,
    staleTime: 120_000,
  });

  // Hot-thread ticker: the top trending thread right now.
  const trending = useQuery({
    queryKey: ["trending", 1],
    queryFn: () => api.trending(1),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const hotThread = trending.data?.threads[0] ?? null;

  // THE SYSTEM's pinned announcements — always at the top of the dungeon.
  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: api.activeAnnouncements,
    staleTime: 120_000,
  });
  // Pinned notices render in the header — drop them from the stream so a
  // fresh announcement doesn't show twice on page 1.
  const pinnedIds = new Set((announcements.data ?? []).map((a) => a.id));
  const posts = feedPosts.filter((p) => !pinnedIds.has(p.id));

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

  const clearFeedPages = () => {
    queryClient.removeQueries({ queryKey: ["feed"], exact: false });
  };
  const selectTypeFilter = (next: "all" | "theory" | "review") => {
    clearFeedPages();
    setTypeFilter(next);
    setFeedMode("global");
  };
  const selectFollowing = () => {
    clearFeedPages();
    setFeedMode("following");
    setTypeFilter("all");
  };
  const selectGuild = () => {
    clearFeedPages();
    setFeedMode("guild");
    setTypeFilter("all");
  };

  // Scope dropdown (replaces the chip row): what the feed shows.
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeLabel =
    feedMode === "following"
      ? "FOLLOWING"
      : feedMode === "guild"
        ? "GUILD"
        : typeFilter === "theory"
          ? "THEORIES"
          : typeFilter === "review"
            ? "REVIEWS"
            : "ALL RECORDS";
  const scopeOptions = [
    {
      key: "all",
      label: "ALL RECORDS",
      active: feedMode === "global" && typeFilter === "all",
      disabled: false,
      select: () => selectTypeFilter("all"),
    },
    {
      key: "theory",
      label: "THEORIES",
      active: feedMode === "global" && typeFilter === "theory",
      disabled: false,
      select: () => selectTypeFilter("theory"),
    },
    {
      key: "review",
      label: "REVIEWS",
      active: feedMode === "global" && typeFilter === "review",
      disabled: false,
      select: () => selectTypeFilter("review"),
    },
    {
      key: "following",
      label: "FOLLOWING",
      active: feedMode === "following",
      disabled: !user,
      select: selectFollowing,
    },
    ...(myGuildId
      ? [
          {
            key: "guild",
            label: "GUILD",
            active: feedMode === "guild",
            disabled: false,
            select: selectGuild,
          },
        ]
      : []),
  ];
  const cycleSort = () => {
    clearFeedPages();
    setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length]);
  };

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

      {/* filter row — one scope dropdown + the sort key. The dropdown keeps
          the row to two calm controls instead of six competing chips. */}
      <View style={styles.deck}>
        <Pressable
          style={({ pressed }) => [styles.scopeKey, pressed && { opacity: 0.75 }]}
          onPress={() => setScopeOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Choose what to show"
        >
          <Text style={styles.scopeText}>◆ {scopeLabel}</Text>
          <Text style={styles.scopeCaret}>{scopeOpen ? "▴" : "▾"}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.sortKey, pressed && { opacity: 0.7 }]}
          onPress={cycleSort}
          accessibilityRole="button"
          accessibilityLabel="Cycle sort order"
        >
          <Text style={styles.sortText}>{sort.toUpperCase()} ▾</Text>
        </Pressable>

        {scopeOpen ? (
          <View style={styles.scopeMenu}>
            {scopeOptions.map((opt) => (
              <Pressable
                key={opt.key}
                style={({ pressed }) => [
                  styles.scopeOption,
                  opt.active && styles.scopeOptionActive,
                  pressed && { backgroundColor: colors.accentGhost },
                ]}
                disabled={opt.disabled}
                onPress={() => {
                  setScopeOpen(false);
                  opt.select();
                }}
              >
                <Text
                  style={[
                    styles.scopeOptionText,
                    opt.active && { color: colors.accentSoft },
                    opt.disabled && { color: colors.border },
                  ]}
                >
                  {opt.active ? "◆ " : ""}
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {hotThread ? (
        <Pressable
          style={({ pressed }) => [styles.ticker, pressed && { opacity: 0.75 }]}
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: hotThread.id } })}
          accessibilityRole="button"
          accessibilityLabel="Open the hottest thread"
        >
          <Text style={styles.tickerLabel}>◆ HOT</Text>
          <Text style={styles.tickerBody} numberOfLines={1}>
            {hotThread.username ? `@${hotThread.username}: ` : ""}
            {hotThread.isSpoiler ? "⚠ Spoiler thread" : hotThread.body}
          </Text>
          <Text style={styles.tickerArrow}>▸</Text>
        </Pressable>
      ) : null}

      {topic ? (
        <View style={styles.topicRow}>
          <Text style={styles.topicText}>TOPIC #{topic}</Text>
          <Pressable
            style={styles.topicClear}
            hitSlop={10}
            onPress={() => {
              clearFeedPages();
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
            key={listKey}
            data={posts}
            keyExtractor={(p) => p.id}
            ListHeaderComponent={
              <>
                {(announcements.data ?? []).map((a) => (
                  <PostCard
                    key={a.id}
                    post={a}
                    preview
                    onOpen={openThread}
                    onReact={react}
                    onVote={vote}
                    onQuote={(p) => {
                      setQuoteTarget(p);
                      setComposerOpen(true);
                    }}
                    onDelete={remove}
                    onReport={(p) =>
                      setReportTarget({ type: "post", id: p.id, username: p.username })
                    }
                    viewerSignedIn={!!user}
                  />
                ))}
                {war.data?.war && myGuildId ? (
                  <WarRallyCard war={war.data.war} myGuildId={myGuildId} />
                ) : null}
              </>
            }
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
            onScrollBeginDrag={() => setScopeOpen(false)}
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

// Red-tinted rally strip: both tags, the live score bar, and the countdown.
// Tapping opens the Guild hall.
function WarRallyCard({
  war,
  myGuildId,
}: {
  war: NonNullable<Awaited<ReturnType<typeof api.guildWar>>["war"]>;
  myGuildId: string;
}) {
  const mine = war.sideA.id === myGuildId ? war.sideA : war.sideB;
  const theirs = war.sideA.id === myGuildId ? war.sideB : war.sideA;
  const total = Math.max(1, mine.score + theirs.score);
  const minePct = mine.score + theirs.score === 0 ? 50 : (mine.score / total) * 100;
  const ms = new Date(war.endsAt).getTime() - Date.now();
  const d = Math.max(0, Math.floor(ms / 86_400_000));
  const h = Math.max(0, Math.floor((ms % 86_400_000) / 3_600_000));
  return (
    <Pressable
      style={({ pressed }) => [styles.rally, pressed && { borderColor: "rgba(206,81,83,0.8)" }]}
      onPress={() => router.push("/guild")}
      accessibilityRole="button"
      accessibilityLabel="Guild war"
    >
      <View style={styles.rallyNotch} pointerEvents="none">
        <Text style={styles.rallyNotchText}>⚔ GUILD WAR</Text>
      </View>
      <View style={styles.rallyRow}>
        <Text style={[styles.rallyTag, { color: colors.danger }]}>{mine.tag}</Text>
        <View style={styles.rallyCenter}>
          <View style={styles.rallyBar}>
            <View style={[styles.rallyBarMine, { width: `${minePct}%` }]} />
            <View style={{ width: 3 }} />
            <View style={[styles.rallyBarTheirs, { width: `${100 - minePct}%` }]} />
          </View>
          <View style={styles.rallyScores}>
            <Text style={[styles.rallyScore, { color: colors.danger }]}>
              {mine.score.toLocaleString()}
            </Text>
            <Text style={styles.rallyEnds}>
              ENDS IN {d > 0 ? `${d}D ${h}H` : `${h}H`}
            </Text>
            <Text style={[styles.rallyScore, { color: colors.info }]}>
              {theirs.score.toLocaleString()}
            </Text>
          </View>
        </View>
        <Text style={[styles.rallyTag, { color: colors.info }]}>{theirs.tag}</Text>
      </View>
      <Text style={styles.rallyHint}>reads &amp; records contribute — tap for the war room</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  rally: {
    position: "relative",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 13,
    paddingTop: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(206,81,83,0.45)",
    borderRadius: 4,
  },
  rallyNotch: {
    position: "absolute",
    top: -9,
    left: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  rallyNotchText: { color: colors.danger, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  rallyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  rallyTag: { fontFamily: undefined, fontSize: 15, fontWeight: "800" },
  rallyCenter: { flex: 1, gap: 3 },
  rallyBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg,
    overflow: "hidden",
    flexDirection: "row",
  },
  rallyBarMine: { backgroundColor: colors.danger },
  rallyBarTheirs: { backgroundColor: colors.info },
  rallyScores: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rallyScore: { fontSize: 10, fontWeight: "900" },
  rallyEnds: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  rallyHint: { color: colors.muted, fontSize: 11, marginTop: 8 },
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
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    zIndex: 40,
  },
  scopeKey: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.card,
  },
  scopeText: { color: colors.accentSoft, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  scopeCaret: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  scopeMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 76,
    marginTop: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 4,
    paddingVertical: 4,
    zIndex: 50,
    elevation: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  scopeOption: { paddingHorizontal: 14, paddingVertical: 10 },
  scopeOptionActive: { backgroundColor: colors.accentGhost },
  scopeOptionText: { color: colors.mutedStrong, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  ticker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.35)",
    borderRadius: 3,
    backgroundColor: "rgba(205,164,94,0.05)",
  },
  tickerLabel: { color: colors.foil, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  tickerBody: { color: colors.mutedStrong, fontSize: 11.5, flex: 1 },
  tickerArrow: { color: colors.foil, fontSize: 11, fontWeight: "900" },
  sortKey: {
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
    borderColor: "rgba(86,168,123,0.35)",
    borderRadius: 3,
    backgroundColor: "rgba(86,168,123,0.08)",
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
