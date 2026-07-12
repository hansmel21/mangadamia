// HOME — System Protocol layout:
//  - bracketed MANGADAMIA wordmark + bell key + hunter chip (LV + micro XP bar)
//  - full-width search key with corner ticks + SAFE badge (CRT hide on scroll)
//  - framed HERO window (corner brackets, TOP-n notch, CONTINUE/OPEN + WALL)
//  - daily-directive strip from the quest log
//  - System rails: LATEST (CH.n badges) / NEW / RANKS / RECOMMENDED
//  - infinite POPULAR grid underneath
// Searching swaps to a result list (RECENT SCANS chips, ALL/ONGOING/DONE
// chips, ± LIBRARY actions on rows).
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bell, Search, Swords, X } from "lucide-react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pressFx, useSwitchFade } from "../../src/anim";
import { api, type RankedCard, type UnifiedCard } from "../../src/api";
import { SeriesGrid } from "../../src/components/SeriesGrid";
import { ScreenTitle, SystemKey } from "../../src/components/SystemUI";
import {
  addRecentSearch,
  addToLibrary,
  clearRecentSearches,
  getCanonicalProgress,
  isInLibrary,
  listRecentSearches,
  removeFromLibrary,
  setLibraryCanonical,
} from "../../src/library";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

type StatusFilter = "" | "ongoing" | "completed";

const HERO_AUTO_MS = 3500; // auto-advance cadence (paused briefly after touch)

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

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ── Hero — framed System window carousel, top 10 popular ────────────────────
function Hero({ cards }: { cards: UnifiedCard[] }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<UnifiedCard>>(null);
  const pageRef = useRef(0);
  const pausedUntil = useRef(0);
  // Inner width: screen minus the grid's 16px gutters and the 1.5px frame
  // borders on each side (so pagingEnabled snaps exactly per card).
  const frameW = width - 32 - 3;

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
  const height = Math.round(frameW * 0.78);

  return (
    <View style={styles.heroFrame}>
      <View style={[styles.heroTick, styles.heroTickTL]} pointerEvents="none" />
      <View style={[styles.heroTick, styles.heroTickTR]} pointerEvents="none" />
      <View style={[styles.heroTick, styles.heroTickBL]} pointerEvents="none" />
      <View style={[styles.heroTick, styles.heroTickBR]} pointerEvents="none" />
      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={cards}
        keyExtractor={(c, i) => c.canonicalId ?? `hero-${i}`}
        getItemLayout={(_, index) => ({ length: frameW, offset: frameW * index, index })}
        onScrollBeginDrag={() => {
          pausedUntil.current = Date.now() + 6000; // user is browsing — hold off
        }}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / frameW);
          pageRef.current = p;
          setPage(p);
        }}
        renderItem={({ item, index }) => {
          const progress = item.canonicalId ? getCanonicalProgress(item.canonicalId) : undefined;
          return (
            <View style={{ width: frameW, height }}>
              <Pressable style={{ flex: 1 }} onPress={() => openCard(item)}>
                <Image
                  source={{ uri: item.coverUrl ?? undefined }}
                  style={{ width: frameW, height }}
                  contentFit="cover"
                  transition={250}
                />
                <LinearGradient
                  colors={["rgba(10,11,16,0)", "rgba(10,11,16,0.55)", "rgba(10,11,16,0.96)"]}
                  locations={[0.3, 0.62, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </Pressable>
              <View style={styles.heroNotch} pointerEvents="none">
                <Text style={styles.heroNotchText}>◆ TOP {index + 1}</Text>
              </View>
              <View style={styles.heroInfo} pointerEvents="box-none">
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.tags && item.tags.length > 0 ? (
                  <Text style={styles.heroTags} numberOfLines={1}>
                    {item.tags.slice(0, 4).join(" · ")}
                  </Text>
                ) : null}
                <View style={styles.heroKeys}>
                  <SystemKey
                    compact
                    label={progress ? `CONTINUE CH.${formatNum(progress.chapterNumber)}` : "OPEN"}
                    onPress={() => openCard(item)}
                  />
                  {item.canonicalId ? (
                    <Pressable
                      style={({ pressed }) => [styles.wallKey, pressed && { opacity: 0.7 }]}
                      onPress={() =>
                        router.push({
                          pathname: "/wall/[canonicalId]",
                          params: { canonicalId: item.canonicalId as string, title: item.title },
                        })
                      }
                    >
                      <Swords color={colors.accentBright} size={12} strokeWidth={2} />
                      <Text style={styles.wallKeyText}>WALL</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.heroDots}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.heroDot, i === page && styles.heroDotActive]} />
        ))}
      </View>
    </View>
  );
}

// ── Daily directive strip — top uncompleted daily quest ─────────────────────
function DailyDirective() {
  const quests = useQuery({ queryKey: ["quests"], queryFn: api.quests, staleTime: 60_000 });
  const daily = (quests.data ?? []).find((q) => q.cadence === "daily" && !q.completedAt);
  if (!daily) return null;
  const pct = Math.min(100, Math.round((daily.progress / daily.target) * 100));
  const xp = daily.rewards.find((r) => r.type === "xp");
  return (
    <Pressable
      style={({ pressed }) => [styles.directive, pressed && { backgroundColor: "rgba(245,184,76,0.06)" }]}
      onPress={() => router.push("/quests")}
      accessibilityRole="button"
      accessibilityLabel="Daily directive"
    >
      <Text style={styles.directiveDiamond}>◆</Text>
      <Text style={styles.directiveLabel}>DAILY DIRECTIVE</Text>
      <Text style={styles.directiveName} numberOfLines={1}>
        {daily.name} — {Math.min(daily.progress, daily.target)}/{daily.target}
      </Text>
      <View style={styles.directiveTrack}>
        <View style={[styles.directiveFill, { width: `${pct}%` }]} />
      </View>
      {xp ? <Text style={styles.directiveXp}>{xp.name}</Text> : null}
    </Pressable>
  );
}

// ── Horizontal rail ──────────────────────────────────────────────────────────
function Rail({
  title,
  cards,
  rankMode,
  chapterBadges,
}: {
  title: string;
  cards?: (UnifiedCard | RankedCard)[];
  rankMode?: boolean;
  // LATEST rail: stamp the newest chapter count on each cover.
  chapterBadges?: boolean;
}) {
  if (!cards || cards.length === 0) return null;
  return (
    <View style={styles.rail}>
      <Text style={styles.railTitle}>◆ {title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={cards}
        keyExtractor={(c, i) =>
          c.canonicalId ?? `${c.sources[0]?.src}:${c.sources[0]?.sourceSeriesId}:${i}`
        }
        contentContainerStyle={styles.railContent}
        renderItem={({ item }) => {
          const chapterCount = chapterBadges ? item.sources[0]?.chapterCount : undefined;
          return (
            <Pressable style={(s) => [styles.railCard, pressFx(s)]} onPress={() => openCard(item)}>
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
                {chapterCount ? (
                  <View style={styles.chBadge}>
                    <Text style={styles.chBadgeText}>CH.{chapterCount}</Text>
                  </View>
                ) : null}
                {rankMode && "rank" in item ? (
                  <Text style={styles.rankNum}>{item.rank}</Text>
                ) : null}
              </View>
              <Text style={styles.railCardTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

// ── Search result row — cover, title, genres, synopsis, ± LIBRARY ───────────
function SearchRow({ card, signedIn }: { card: UnifiedCard; signedIn: boolean }) {
  const first = card.sources[0];
  const [inLib, setInLib] = useState(() =>
    first ? isInLibrary(first.src, first.sourceSeriesId) : false,
  );
  const toggleLibrary = () => {
    if (!first) return;
    if (inLib) {
      removeFromLibrary(first.src, first.sourceSeriesId);
      if (card.canonicalId && signedIn) void api.deleteLibrary(card.canonicalId).catch(() => {});
    } else {
      addToLibrary(first.src, first.sourceSeriesId, card.title, card.coverUrl ?? undefined);
      if (card.canonicalId) {
        setLibraryCanonical(first.src, first.sourceSeriesId, card.canonicalId);
        if (signedIn) {
          void api.putLibrary(card.canonicalId, first.src, first.sourceSeriesId).catch(() => {});
        }
      }
    }
    setInLib(!inLib);
  };

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
          <Text style={styles.resultDesc} numberOfLines={2}>
            {card.description}
          </Text>
        ) : (
          <Text style={styles.resultDescMissing}>
            Open to load details from {card.sources.length} server
            {card.sources.length === 1 ? "" : "s"}.
          </Text>
        )}
        <Pressable hitSlop={8} onPress={toggleLibrary} style={styles.libAction}>
          <Text style={[styles.libActionText, { color: inLib ? colors.data : colors.accentBright }]}>
            {inLib ? "IN LIBRARY" : "+ LIBRARY"}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); // only set on submit
  const [status, setStatus] = useState<StatusFilter>("");
  const [recents, setRecents] = useState<string[]>(() => listRecentSearches());
  const [headerH, setHeaderH] = useState(0);
  const user = useSyncExternalStore(subscribeSession, getSessionUser);

  const searching = query.length > 0 || input.length > 0;
  const hasResults = query.length > 0;

  // Header chips: unread bell count + hunter LV/XP (share app-wide caches).
  const notif = useQuery({
    queryKey: ["notifCount"],
    queryFn: api.notificationCount,
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: !!user, staleTime: 60_000 });
  const unread = user ? (notif.data?.unread ?? 0) : 0;
  const xpFloor = me.data ? (me.data.level - 1) ** 2 * 100 : 0;
  const xpPct = me.data
    ? Math.max(
        0,
        Math.min(100, ((me.data.xp - xpFloor) / Math.max(1, me.data.xpForNextLevel - xpFloor)) * 100),
      )
    : 0;

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
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* static header — wordmark + bell key + hunter chip */}
      <View style={styles.topRow}>
        <ScreenTitle>MANGADAMIA</ScreenTitle>
        <View style={styles.topRight}>
          {user ? (
            <Pressable
              style={({ pressed }) => [styles.bellKey, pressed && { opacity: 0.7 }]}
              onPress={() => router.push("/notifications")}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Bell color={colors.accentBright} size={17} strokeWidth={2} />
              {unread > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unread > 99 ? "99" : unread}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {user && me.data ? (
            <Pressable
              style={({ pressed }) => [styles.hunterChip, pressed && { opacity: 0.8 }]}
              onPress={() => router.navigate("/account")}
              accessibilityRole="button"
              accessibilityLabel="Your status"
            >
              <View style={styles.hunterAvatar}>
                <Text style={styles.hunterInitial}>
                  {user.username[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View>
                <Text style={styles.hunterLv}>LV {me.data.level}</Text>
                <View style={styles.hunterTrack}>
                  <View style={[styles.hunterFill, { width: `${xpPct}%` }]} />
                </View>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1 }}>
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
                renderItem={({ item }) => <SearchRow card={item} signedIn={!!user} />}
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
                  {user ? <DailyDirective /> : null}
                  <Rail title="LATEST DROPS" cards={latest.data} chapterBadges />
                  <Rail title="NEW SERIES" cards={newest.data} />
                  <Rail title="RANKS — MOST READ" cards={ranks.data} rankMode />
                  {user ? <Rail title="RECOMMENDED FOR YOU" cards={recommended.data} /> : null}
                  <Text style={styles.popularTitle}>◆ POPULAR</Text>
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
            <View style={[styles.searchTick, styles.searchTickTL]} pointerEvents="none" />
            <View style={[styles.searchTick, styles.searchTickBR]} pointerEvents="none" />
            <Search color={colors.accentBright} size={16} strokeWidth={2} />
            <TextInput
              style={styles.search}
              placeholder="Search the archive…"
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => submit(input)}
              onFocus={showBar}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {searching ? (
              <Pressable
                style={(s) => [styles.clearBtn, pressFx(s)]}
                hitSlop={8}
                onPress={clearSearch}
              >
                <X color={colors.text} size={13} strokeWidth={2.4} />
              </Pressable>
            ) : (
              <View style={styles.safeBadge}>
                <Text style={styles.safeBadgeText}>SAFE</Text>
              </View>
            )}
          </View>

          {searching && recents.length > 0 && (
            <View style={styles.recentsWrap}>
              <View style={styles.recentsHeader}>
                <Text style={styles.recentsTitle}>RECENT SCANS</Text>
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
              {!hasResults ? (
                <Text style={styles.safeNote}>Results come from the MangaDex safe catalog.</Text>
              ) : null}
            </View>
          )}

          {hasResults && (
            <View style={styles.filterRow}>
              {!list.isLoading ? (
                <Text style={styles.resultCount}>
                  {cards.length}
                  {list.hasNextPage ? "+" : ""} RESULTS
                </Text>
              ) : null}
              <View style={styles.filterChips}>
                {(
                  [
                    ["", "ALL"],
                    ["ongoing", "ONGOING"],
                    ["completed", "DONE"],
                  ] as const
                ).map(([value, label]) => (
                  <SystemKey
                    key={value}
                    variant="chip"
                    label={label}
                    active={status === value}
                    onPress={() => setStatus(value)}
                  />
                ))}
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 10,
  },
  topRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  bellKey: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  hunterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(245,184,76,0.5)",
    borderRadius: 3,
    backgroundColor: "rgba(245,184,76,0.06)",
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 8,
  },
  hunterAvatar: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  hunterInitial: { color: "#0B0B11", fontWeight: "900", fontSize: 10 },
  hunterLv: { color: colors.foil, fontSize: 9, fontWeight: "900", lineHeight: 10 },
  hunterTrack: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.panelRaised,
    marginTop: 2,
    overflow: "hidden",
  },
  hunterFill: { height: "100%", borderRadius: 2, backgroundColor: colors.foil },
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
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.card,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.45)",
    marginHorizontal: 16,
    marginTop: 8,
    paddingLeft: 13,
    paddingRight: 8,
  },
  searchTick: { position: "absolute", width: 8, height: 8, borderColor: colors.accentBright },
  searchTickTL: { top: -2, left: -2, borderTopWidth: 2, borderLeftWidth: 2 },
  searchTickBR: { bottom: -2, right: -2, borderBottomWidth: 2, borderRightWidth: 2 },
  search: {
    flex: 1,
    color: colors.text,
    paddingVertical: 11,
    fontSize: 13.5,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.border,
  },
  safeBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  safeBadgeText: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  recentsWrap: { paddingHorizontal: 16, paddingTop: 10 },
  recentsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recentsTitle: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  recentsClear: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  recentsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  recentChip: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 11,
    paddingVertical: 6,
    maxWidth: 180,
  },
  recentChipText: { color: colors.text, fontSize: 11.5 },
  safeNote: { color: colors.muted, fontSize: 10.5, textAlign: "center", marginTop: 14 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  resultCount: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.4 },
  filterChips: { marginLeft: "auto", flexDirection: "row", gap: 6 },
  heroFrame: {
    position: "relative",
    marginTop: 6,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.5)",
    overflow: "visible",
  },
  heroTick: { position: "absolute", width: 11, height: 11, borderColor: colors.accentBright, zIndex: 2 },
  heroTickTL: { top: -2, left: -2, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  heroTickTR: { top: -2, right: -2, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  heroTickBL: { bottom: -2, left: -2, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  heroTickBR: { bottom: -2, right: -2, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  heroNotch: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.foil,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  heroNotchText: { color: colors.foilSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  heroInfo: { position: "absolute", left: 14, right: 14, bottom: 12 },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 27,
  },
  heroTags: { color: colors.muted, fontSize: 11.5, marginTop: 4 },
  heroKeys: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  wallKey: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10,11,16,0.75)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 3,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  wallKeyText: { color: colors.accentBright, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  heroDots: { flexDirection: "row", justifyContent: "center", gap: 5, paddingVertical: 8 },
  heroDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(124,92,255,0.25)" },
  heroDotActive: { backgroundColor: colors.accentSoft, width: 14 },
  directive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(245,184,76,0.4)",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  directiveDiamond: { color: colors.foil, fontSize: 9 },
  directiveLabel: { color: colors.foilSoft, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.4 },
  directiveName: { color: colors.text, fontSize: 12, fontWeight: "700", flex: 1 },
  directiveTrack: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  directiveFill: { height: "100%", backgroundColor: colors.foil },
  directiveXp: { color: colors.foilSoft, fontSize: 10, fontWeight: "800" },
  rail: { marginTop: 14, marginHorizontal: -16 },
  railTitle: {
    color: colors.accentBright,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  railContent: { paddingHorizontal: 16, gap: 10 },
  railCard: { width: 104 },
  railCoverWrap: {
    borderRadius: 3,
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
  chBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },
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
    color: colors.accentBright,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 2,
  },
  resultRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 11,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 3,
  },
  resultCover: {
    width: 62,
    aspectRatio: 0.7,
    borderRadius: 3,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  resultInfo: { flex: 1 },
  resultTitle: { color: colors.text, fontSize: 14.5, fontWeight: "800", lineHeight: 19 },
  resultTags: {
    color: colors.accentBright,
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 3,
    textTransform: "capitalize",
  },
  resultDesc: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 5 },
  resultDescMissing: {
    color: colors.muted,
    fontSize: 11.5,
    fontStyle: "italic",
    marginTop: 5,
    opacity: 0.7,
  },
  libAction: { alignSelf: "flex-end", marginTop: 7 },
  libActionText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  center: { alignItems: "center", paddingHorizontal: 24 },
  errorText: { color: colors.danger, textAlign: "center", marginBottom: 12 },
  retry: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.6)",
    borderRadius: 3,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  retryText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  emptyText: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
