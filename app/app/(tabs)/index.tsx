// Browse home:
//  - auto-advancing full-width HERO carousel (top-10 popular)
//  - System rails: LATEST / NEW SERIES / RANKS / RECOMMENDED
//  - infinite POPULAR grid underneath
//  - floating search bar that slips away on scroll-down, springs back on
//    scroll-up (translate + fade + slight compress — the System receding)
// Searching swaps to a detail LIST (cover, title, genres, synopsis) with
// recent-search chips and ALL / ONGOING / COMPLETED status filters.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { pressFx, useSwitchFade } from "../../src/anim";
import { api, type RankedCard, type UnifiedCard } from "../../src/api";
import { SeriesGrid } from "../../src/components/SeriesGrid";
import {
  addRecentSearch,
  clearRecentSearches,
  listRecentSearches,
} from "../../src/library";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

type StatusFilter = "" | "ongoing" | "completed";

const HERO_AUTO_MS = 3000; // auto-advance cadence (paused briefly after touch)

function openCard(card: UnifiedCard) {
  const first = card.sources[0];
  if (!first) return;
  router.push({
    pathname: "/series/[src]/[id]",
    params: {
      src: first.src,
      id: first.sourceSeriesId,
      title: card.title,
      servers: JSON.stringify(card.sources),
    },
  });
}

// ── Hero carousel — top 10 popular, full-bleed, self-advancing ──────────────
function Hero({ cards }: { cards: UnifiedCard[] }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<UnifiedCard>>(null);
  const pageRef = useRef(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (cards.length < 2) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const next = (pageRef.current + 1) % cards.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      pageRef.current = next;
      setPage(next);
    }, HERO_AUTO_MS);
    return () => clearInterval(timer);
  }, [cards.length]);

  if (cards.length === 0) return null;
  const height = Math.round(width * 0.88);

  return (
    <View style={{ marginHorizontal: -16, marginBottom: 4 }}>
      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={cards}
        keyExtractor={(c, i) => c.canonicalId ?? `hero-${i}`}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollBeginDrag={() => {
          pausedUntil.current = Date.now() + 6000; // user is browsing — hold off
        }}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / width);
          pageRef.current = p;
          setPage(p);
        }}
        renderItem={({ item, index }) => (
          <Pressable
            style={(s) => [{ width, height }, s.pressed && { opacity: 0.85 }]}
            onPress={() => openCard(item)}
          >
            <Image
              source={{ uri: item.coverUrl ?? undefined }}
              style={{ width, height }}
              contentFit="cover"
              transition={250}
            />
            <LinearGradient
              colors={["rgba(13,15,20,0.05)", "rgba(13,15,20,0.55)", "rgba(13,15,20,0.97)"]}
              locations={[0.35, 0.65, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroInfo}>
              <Text style={styles.heroTop}>◆ TOP {index + 1}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.tags && item.tags.length > 0 ? (
                <Text style={styles.heroTags} numberOfLines={1}>
                  {item.tags.slice(0, 4).join(" · ")}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      <View style={styles.heroDots}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.heroDot, i === page && styles.heroDotActive]} />
        ))}
      </View>
    </View>
  );
}

// ── Horizontal rail ──────────────────────────────────────────────────────────
function Rail({
  title,
  cards,
  rankMode,
}: {
  title: string;
  cards?: (UnifiedCard | RankedCard)[];
  rankMode?: boolean;
}) {
  if (!cards || cards.length === 0) return null;
  return (
    <View style={styles.rail}>
      <Text style={styles.railTitle}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={cards}
        keyExtractor={(c, i) =>
          c.canonicalId ?? `${c.sources[0]?.src}:${c.sources[0]?.sourceSeriesId}:${i}`
        }
        contentContainerStyle={styles.railContent}
        renderItem={({ item }) => (
          <Pressable
            style={(s) => [styles.railCard, pressFx(s)]}
            onPress={() => openCard(item)}
          >
            <View style={styles.railCoverWrap}>
              {item.coverUrl ? (
                <Image
                  source={{ uri: item.coverUrl }}
                  style={styles.railCover}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.railCover, styles.railPlaceholder]}>
                  <Text style={styles.railPlaceholderText}>
                    {item.title.trim()[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              {rankMode && "rank" in item ? (
                <Text style={styles.rankNum}>{item.rank}</Text>
              ) : null}
            </View>
            <Text style={styles.railCardTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

// ── Search result row — cover + title + genres + synopsis ───────────────────
function SearchRow({ card }: { card: UnifiedCard }) {
  return (
    <Pressable style={(s) => [styles.resultRow, pressFx(s)]} onPress={() => openCard(card)}>
      {card.coverUrl ? (
        <Image source={{ uri: card.coverUrl }} style={styles.resultCover} contentFit="cover" />
      ) : (
        <View style={[styles.resultCover, styles.railPlaceholder]}>
          <Text style={styles.railPlaceholderText}>
            {card.title.trim()[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle} numberOfLines={2}>
          {card.title}
        </Text>
        {(card.tags?.length || card.status) ? (
          <Text style={styles.resultTags} numberOfLines={1}>
            {[card.status, ...(card.tags?.slice(0, 3) ?? [])].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {card.description ? (
          <Text style={styles.resultDesc} numberOfLines={3}>
            {card.description}
          </Text>
        ) : (
          <Text style={styles.resultDescMissing}>
            Open to load details from {card.sources.length} server
            {card.sources.length === 1 ? "" : "s"}.
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function BrowseScreen() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); // only set on submit
  const [status, setStatus] = useState<StatusFilter>("");
  const [recents, setRecents] = useState<string[]>(() => listRecentSearches());
  const [headerH, setHeaderH] = useState(0);
  const user = useSyncExternalStore(subscribeSession, getSessionUser);

  const searching = query.length > 0 || input.length > 0;
  const hasResults = query.length > 0;

  // Floating search bar — "System window" collapse: squeeze flat into a
  // light line, the line contracts to center, puff — gone. Opening reverses.
  const barSX = useRef(new Animated.Value(1)).current;
  const barSY = useRef(new Animated.Value(1)).current;
  const barOp = useRef(new Animated.Value(1)).current;
  const [barGone, setBarGone] = useState(false);
  const lastY = useRef(0);
  const barHidden = useRef(false);

  const showBar = () => {
    if (!barHidden.current) return;
    barHidden.current = false;
    setBarGone(false);
    Animated.sequence([
      // the light line stretches back out…
      Animated.parallel([
        Animated.timing(barOp, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(barSX, {
          toValue: 1,
          duration: 170,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // …then the window springs open
      Animated.spring(barSY, { toValue: 1, damping: 13, stiffness: 160, useNativeDriver: true }),
    ]).start();
  };
  const hideBar = () => {
    if (barHidden.current) return;
    barHidden.current = true;
    Animated.sequence([
      // collapse to a thin light line…
      Animated.timing(barSY, {
        toValue: 0.045,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      // …the line contracts and puffs out
      Animated.parallel([
        Animated.timing(barSX, {
          toValue: 0.08,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(barOp, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished && barHidden.current) setBarGone(true);
    });
  };
  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < 50) return showBar();
    if (dy > 10) hideBar();
    else if (dy < -10) showBar();
  };
  // Content region cross-fades when switching home ↔ results or filters
  const contentFade = useSwitchFade(`${hasResults}:${status}`);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setInput(trimmed);
    setQuery(trimmed);
    addRecentSearch(trimmed);
    setRecents(listRecentSearches());
    showBar();
  };

  const clearSearch = () => {
    setInput("");
    setQuery("");
    setStatus("");
    showBar();
  };

  const latest = useQuery({
    queryKey: ["home", "latest"],
    queryFn: () => api.browseLatest(1),
    staleTime: 5 * 60 * 1000,
    enabled: !hasResults,
  });
  const newest = useQuery({
    queryKey: ["home", "new"],
    queryFn: () => api.browseNew(1),
    staleTime: 10 * 60 * 1000,
    enabled: !hasResults,
  });
  const ranks = useQuery({
    queryKey: ["home", "ranks"],
    queryFn: api.ranks,
    staleTime: 10 * 60 * 1000,
    enabled: !hasResults,
  });
  const recommended = useQuery({
    queryKey: ["home", "recommended", user?.id],
    queryFn: api.recommended,
    staleTime: 10 * 60 * 1000,
    enabled: !hasResults && !!user,
  });

  const list = useInfiniteQuery({
    queryKey: ["browse", query, status],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      query ? api.searchAll(query, pageParam, status || undefined) : api.browse(pageParam),
    getNextPageParam: (lastPage, pages) => (lastPage.length > 0 ? pages.length + 1 : undefined),
  });

  const cards = list.data?.pages.flat() ?? [];
  const gridItems = cards.map((card) => ({
    src: card.sources[0]?.src ?? "",
    seriesId: card.sources[0]?.sourceSeriesId ?? "",
    title: card.title,
    coverUrl: card.coverUrl ?? undefined,
    servers: card.sources,
  }));

  const contentTop = headerH + 8;

  return (
    <View style={styles.screen}>
      <Animated.View style={[{ flex: 1 }, contentFade]}>
      {hasResults ? (
        list.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: contentTop + 32 }} />
        ) : (
          <FlatList
            data={cards}
            keyExtractor={(c, i) =>
              c.canonicalId ?? `${c.sources[0]?.src}:${c.sources[0]?.sourceSeriesId}:${i}`
            }
            renderItem={({ item }) => <SearchRow card={item} />}
            contentContainerStyle={{ paddingTop: contentTop, paddingBottom: 24 }}
            onScroll={onListScroll}
            scrollEventThrottle={16}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No results for "{query}"</Text>
            }
          />
        )
      ) : list.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: contentTop + 32 }} />
      ) : list.isError ? (
        <View style={[styles.center, { marginTop: contentTop + 24 }]}>
          <Text style={styles.errorText}>{(list.error as Error).message}</Text>
          <Pressable style={(s) => [styles.retry, pressFx(s)]} onPress={() => list.refetch()}>
            <Text style={styles.retryText}>RETRY</Text>
          </Pressable>
        </View>
      ) : (
        <SeriesGrid
          items={gridItems}
          contentTopPadding={contentTop}
          onScroll={onListScroll}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => list.refetch()}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
          }}
          ListHeaderComponent={
            <View>
              <Hero cards={cards.slice(0, 10)} />
              <Rail title="◆ Latest" cards={latest.data} />
              <Rail title="◆ New Series" cards={newest.data} />
              <Rail title="◆ Ranks — Most Read" cards={ranks.data} rankMode />
              {user ? <Rail title="◆ Recommended for You" cards={recommended.data} /> : null}
              <Text style={styles.popularTitle}>◆ Popular</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Nothing here yet</Text>}
        />
      )}
      </Animated.View>

      <Animated.View
        pointerEvents={barGone ? "none" : "box-none"}
        style={[
          styles.floatingHeader,
          {
            opacity: barOp,
            transform: [{ scaleX: barSX }, { scaleY: barSY }],
          },
        ]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="Search MangaDex…"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => submit(input)}
            onFocus={showBar}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searching && (
            <Pressable
              style={(s) => [styles.clearBtn, pressFx(s)]}
              hitSlop={8}
              onPress={clearSearch}
            >
              <X color={colors.text} size={15} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>

        {searching && recents.length > 0 && (
          <View style={styles.recentsWrap}>
            <View style={styles.recentsHeader}>
              <Text style={styles.recentsTitle}>Recent Searches</Text>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  clearRecentSearches();
                  setRecents([]);
                }}
              >
                <Text style={styles.recentsClear}>CLEAR</Text>
              </Pressable>
            </View>
            <View style={styles.recentsRow}>
              {recents.map((r) => (
                <Pressable
                  key={r}
                  style={(s) => [styles.recentChip, pressFx(s)]}
                  onPress={() => submit(r)}
                >
                  <Text style={styles.recentChipText} numberOfLines={1}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {hasResults && (
          <View style={styles.filterRow}>
            {(
              [
                ["", "All"],
                ["ongoing", "Ongoing"],
                ["completed", "Completed"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                style={(s) => [
                  styles.filterChip,
                  status === value && styles.filterChipActive,
                  pressFx(s),
                ]}
                onPress={() => setStatus(value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    status === value && styles.filterChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    paddingBottom: 8,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.35)",
    marginHorizontal: 16,
    marginTop: 12,
    paddingRight: 6,
  },
  search: {
    flex: 1,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.border,
  },
  recentsWrap: { paddingHorizontal: 16, paddingTop: 10 },
  recentsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recentsTitle: {
    color: colors.accentSoft,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  recentsClear: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  recentsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  recentChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    maxWidth: 180,
  },
  recentChipText: { color: colors.text, fontSize: 12 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  filterChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  filterChipActive: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderColor: "rgba(124,92,255,0.7)",
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  filterChipTextActive: { color: colors.accentSoft },
  heroInfo: { position: "absolute", left: 16, right: 16, bottom: 18 },
  heroTop: { color: colors.foil, fontSize: 11, fontWeight: "800", letterSpacing: 2.5 },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 31,
    marginTop: 4,
  },
  heroTags: { color: colors.muted, fontSize: 12, marginTop: 5 },
  heroDots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8 },
  heroDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(124,92,255,0.25)" },
  heroDotActive: { backgroundColor: colors.accentSoft, width: 14 },
  rail: { marginTop: 14, marginHorizontal: -16 },
  railTitle: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  railContent: { paddingHorizontal: 16, gap: 10 },
  railCard: { width: 104 },
  railCoverWrap: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  railCover: { width: "100%", aspectRatio: 0.7 },
  railPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,92,255,0.08)",
  },
  railPlaceholderText: { color: "rgba(124,92,255,0.55)", fontSize: 34, fontWeight: "900" },
  rankNum: {
    position: "absolute",
    bottom: -6,
    left: 4,
    fontFamily: fonts.display,
    fontSize: 44,
    color: colors.foil,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  railCardTitle: { color: colors.text, fontSize: 11, marginTop: 6, lineHeight: 15 },
  popularTitle: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 2,
  },
  resultRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultCover: {
    width: 64,
    aspectRatio: 0.7,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  resultInfo: { flex: 1 },
  resultTitle: { color: colors.text, fontSize: 15, fontWeight: "700", lineHeight: 20 },
  resultTags: {
    color: colors.accentSoft,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    textTransform: "capitalize",
  },
  resultDesc: { color: colors.muted, fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  resultDescMissing: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
    opacity: 0.7,
  },
  center: { alignItems: "center", paddingHorizontal: 24 },
  errorText: { color: colors.danger, textAlign: "center", marginBottom: 12 },
  retry: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.6)",
    borderRadius: 4,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  retryText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  emptyText: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
