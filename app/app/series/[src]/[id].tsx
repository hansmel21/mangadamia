// Series detail: cover, info, follow button, source, chapter list, continue.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { pressFx, useSwitchFade } from "../../../src/anim";
import { api, type ChapterInfo } from "../../../src/api";
import { PostComposer } from "../../../src/components/PostComposer";
import { rankColors } from "../../../src/ranks";
import { getSessionUser } from "../../../src/session";
import {
  addToLibrary,
  getCanonicalProgress,
  getCanonicalReadNumbers,
  getLastRead,
  getReadChapterIds,
  isInLibrary,
  removeFromLibrary,
  setLastSeenChapter,
  setLibraryCanonical,
} from "../../../src/library";
import { syncReads } from "../../../src/sync";
import { colors, fonts } from "../../../src/theme";

export default function SeriesScreen() {
  const { src, id, title, servers, canonicalOnly } = useLocalSearchParams<{
    src: string;
    id: string;
    title?: string;
    servers?: string;
    canonicalOnly?: string;
  }>();

  // Arriving from the Feed we only know a canonicalId — resolve its servers.
  const [resolved, setResolved] = useState<{ src: string; sourceSeriesId: string }[] | null>(null);
  useEffect(() => {
    if (canonicalOnly && !src) {
      api
        .canonicalSources(canonicalOnly)
        .then((s) => setResolved(s.length > 0 ? s : []))
        .catch(() => setResolved([]));
    }
  }, [canonicalOnly, src]);

  // Source candidates for this series, best-first. Library entries and deep
  // links arrive without a servers param — they get a single server.
  const cardCandidates = useMemo<{ src: string; sourceSeriesId: string }[]>(() => {
    if (servers) {
      try {
        const parsed = JSON.parse(servers);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fall through to the single-server fallback
      }
    }
    if (resolved && resolved.length > 0) return resolved;
    return [{ src, sourceSeriesId: id }];
  }, [servers, resolved, src, id]);

  // Servers discovered via the canonical link (may exceed what the card knew)
  const [extraServers, setExtraServers] = useState<
    { src: string; sourceSeriesId: string; chapterCount?: number }[]
  >([]);
  const [serverIdx, setServerIdx] = useState(0);
  useEffect(() => {
    setServerIdx(0);
    setExtraServers([]);
  }, [id]);

  const candidates = useMemo(() => {
    const merged: { src: string; sourceSeriesId: string; chapterCount?: number }[] =
      cardCandidates.map((c) => ({ ...c }));
    for (const s of extraServers) {
      const existing = merged.find((c) => c.src === s.src);
      if (existing) existing.chapterCount = s.chapterCount;
      else merged.push(s);
    }
    return merged;
  }, [cardCandidates, extraServers]);

  const active = candidates[Math.min(serverIdx, candidates.length - 1)];
  // Cross-fade the whole sheet when switching servers
  const serverFade = useSwitchFade(`${active.src}:${active.sourceSeriesId}`);

  const series = useQuery({
    queryKey: ["series", active.src, active.sourceSeriesId],
    queryFn: () => api.series(active.src, active.sourceSeriesId),
    // Don't fire on the empty placeholder while a canonical link resolves
    enabled: !!active.src && !!active.sourceSeriesId,
    // Keep the previous server's info on screen while the new one loads
    placeholderData: keepPreviousData,
  });

  const [inLibrary, setInLibrary] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [lastRead, setLastRead] = useState<ReturnType<typeof getLastRead>>();
  const [focusTick, setFocusTick] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Refresh local state when returning from the reader or switching server
  useFocusEffect(
    useCallback(() => {
      setInLibrary(isInLibrary(active.src, active.sourceSeriesId));
      setReadIds(getReadChapterIds(active.src, active.sourceSeriesId));
      setLastRead(getLastRead(active.src, active.sourceSeriesId));
      setFocusTick((t) => t + 1);
    }, [active.src, active.sourceSeriesId]),
  );

  // Canonical (server-independent) progress: read-marks and the continue
  // point survive switching servers because they're keyed by chapter number.
  const canonicalId = series.data?.canonicalId ?? undefined;
  const reviews = useQuery({
    queryKey: ["seriesReviews", canonicalId],
    queryFn: () => api.seriesReviews(canonicalId as string),
    enabled: !!canonicalId,
    staleTime: 30_000,
  });
  const canonicalRead = useMemo(
    () => (canonicalId ? getCanonicalReadNumbers(canonicalId) : new Set<number>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalId, focusTick],
  );
  const canonicalProgress = useMemo(
    () => (canonicalId ? getCanonicalProgress(canonicalId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalId, focusTick],
  );

  // Ask the backend for the full server list for this series — it may know
  // about sources the card didn't (filled in by cross-source discovery).
  useEffect(() => {
    if (!canonicalId) return;
    let cancelled = false;
    api
      .canonicalSources(canonicalId)
      .then((srcs) => {
        if (!cancelled && srcs.length > 0) setExtraServers(srcs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canonicalId]);

  // Cloud sync: anchor the library row to its canonical id and merge
  // read-marks with the account (marks made on another device show up here).
  useEffect(() => {
    if (!canonicalId) return;
    setLibraryCanonical(active.src, active.sourceSeriesId, canonicalId);
    void syncReads(canonicalId).then((changed) => {
      if (changed) setFocusTick((t) => t + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalId]);

  const openChapter = (chapterId: string) =>
    router.push({
      pathname: "/reader/[src]/[seriesId]/[chapterId]",
      params: { src: active.src, seriesId: active.sourceSeriesId, chapterId },
    });

  // Seeing the chapter list clears this series' "new chapters" badge in the
  // library (we record the newest chapter number the user has laid eyes on).
  const chapterCount = series.data?.chapters.length ?? 0;
  useEffect(() => {
    const list = series.data?.chapters;
    if (!inLibrary || !list || list.length === 0) return;
    setLastSeenChapter(
      active.src,
      active.sourceSeriesId,
      Math.max(...list.map((c) => c.number)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inLibrary, chapterCount, active.src, active.sourceSeriesId]);

  const chapters = series.data?.chapters ?? [];
  // "Continue": resume the chapter the reader left off in — unless they
  // actually reached its last page, in which case offer the next chapter.
  // Canonical progress (works across servers) wins over per-server progress.
  const prog = canonicalProgress ?? lastRead;
  const hasProgress = prog !== undefined;
  const finished =
    prog?.pageCount !== undefined && prog.pageIndex >= prog.pageCount - 1;
  const sameChapter = prog
    ? (chapters.find((c) => c.number === prog.chapterNumber) ??
      chapters.find((c) => c.sourceChapterId === lastRead?.chapterId))
    : undefined;
  const nextChapter = prog
    ? chapters.find((c) => c.number > prog.chapterNumber)
    : undefined;
  const continueChapter: ChapterInfo | undefined = !prog
    ? chapters[0]
    : finished
      ? (nextChapter ?? sameChapter)
      : (sameChapter ?? nextChapter);

  // Pre-warm the chapter the user is most likely to open next: fetch its page
  // list (this also fills the backend's cache) and prefetch its first
  // images, so tapping "Continue"/"Start reading" starts instantly.
  const queryClient = useQueryClient();
  const nextChapterId = continueChapter?.sourceChapterId;
  const activeSrc = active.src;
  const activeId = active.sourceSeriesId;
  useEffect(() => {
    if (!nextChapterId) return;
    let cancelled = false;
    (async () => {
      try {
        const pages = await queryClient.fetchQuery({
          queryKey: ["pages", activeSrc, activeId, nextChapterId],
          queryFn: () => api.pages(activeSrc, activeId, nextChapterId),
          staleTime: 10 * 60 * 1000,
        });
        for (const p of pages.slice(0, 3)) {
          if (cancelled) return;
          await Image.prefetch(p.imageUrl);
        }
      } catch {
        // best-effort — opening the reader fetches normally if this failed
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSrc, activeId, nextChapterId, queryClient]);

  if (series.isLoading) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: title ?? "" }} />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }
  if (series.isError || !series.data) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: title ?? "" }} />
        <View style={styles.center}>
          <Text style={styles.error}>{(series.error as Error)?.message ?? "Failed to load"}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => series.refetch()}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const s = series.data;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: s.title }} />
      <Animated.View style={[{ flex: 1 }, serverFade]}>
      <FlatList
        data={chapters.slice().reverse()} // newest chapter first in the list
        keyExtractor={(c) => c.sourceChapterId}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <Image source={{ uri: s.coverUrl ?? undefined }} style={styles.cover} contentFit="cover" />
              <View style={styles.headerInfo}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.meta}>
                  {[s.status, `${chapters.length} chapters`].filter(Boolean).join(" · ")}
                </Text>
                <Text style={styles.tags} numberOfLines={2}>
                  {s.tags.join(" · ")}
                </Text>
                {canonicalId && reviews.data ? (
                  <View style={styles.rankChip}>
                    {reviews.data.rank ? (
                      <>
                        <Text style={[styles.rankLetter, { color: rankColors[reviews.data.rank] }]}>
                          {reviews.data.rank}
                        </Text>
                        <Text style={styles.rankMeta}>
                          COMMUNITY RANK · {reviews.data.count}{" "}
                          {reviews.data.count === 1 ? "review" : "reviews"}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.rankMeta}>UNRANKED · be the first to review</Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                style={(s) => [styles.primaryBtn, { flex: 1 }, pressFx(s)]}
                disabled={!continueChapter}
                onPress={() => continueChapter && openChapter(continueChapter.sourceChapterId)}
              >
                <Text style={styles.primaryBtnText}>
                  {hasProgress
                    ? `▶ CONTINUE · CH. ${formatNum(continueChapter?.number ?? 0)}`
                    : "▶ START READING"}
                </Text>
              </Pressable>
              <Pressable
                style={(s) => [
                  styles.secondaryBtn,
                  inLibrary && styles.secondaryBtnActive,
                  pressFx(s),
                ]}
                onPress={() => {
                  if (inLibrary) {
                    removeFromLibrary(active.src, active.sourceSeriesId);
                    if (canonicalId) void api.deleteLibrary(canonicalId).catch(() => {});
                  } else {
                    addToLibrary(
                      active.src,
                      active.sourceSeriesId,
                      s.title,
                      s.coverUrl ?? undefined,
                    );
                    // Baseline: only chapters published after now count as new
                    if (chapters.length > 0) {
                      setLastSeenChapter(
                        active.src,
                        active.sourceSeriesId,
                        Math.max(...chapters.map((c) => c.number)),
                      );
                    }
                    if (canonicalId) {
                      setLibraryCanonical(active.src, active.sourceSeriesId, canonicalId);
                      void api
                        .putLibrary(canonicalId, active.src, active.sourceSeriesId)
                        .catch(() => {});
                    }
                  }
                  setInLibrary(!inLibrary);
                }}
              >
                <Text style={styles.secondaryBtnText}>
                  {inLibrary ? "✓ IN LIBRARY" : "+ LIBRARY"}
                </Text>
              </Pressable>
            </View>

            {s.description ? (
              <Text style={styles.description} numberOfLines={6}>
                {s.description}
              </Text>
            ) : null}

            <Pressable
              style={styles.attribution}
              onPress={() =>
                Linking.openURL(`https://mangadex.org/title/${active.sourceSeriesId}`).catch(() => {})
              }
            >
              <Text style={styles.attributionText}>
                Content delivered through the MangaDex API. Rights remain with the respective
                creators, publishers, and uploaders. View on MangaDex ↗
              </Text>
            </Pressable>

            {canonicalId ? (
              <View style={styles.socialRow}>
                <Pressable
                  style={(st) => [styles.wallBtn, { flex: 1 }, pressFx(st)]}
                  onPress={() =>
                    router.push({
                      pathname: "/wall/[canonicalId]",
                      params: { canonicalId, title: s.title },
                    })
                  }
                >
                  <Text style={styles.wallBtnText}>◆ VIEW WALL</Text>
                </Pressable>
                {getSessionUser() ? (
                  <Pressable
                    style={(st) => [styles.wallBtn, styles.rateBtn, { flex: 1 }, pressFx(st)]}
                    onPress={() => setReviewOpen(true)}
                  >
                    <Text style={[styles.wallBtnText, { color: colors.foil }]}>
                      {reviews.data?.myReview ? "★ EDIT REVIEW" : "★ RATE SERIES"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Source</Text>
            <View style={styles.serverRow}>
              {candidates.map((c, i) => {
                const activeChip = i === Math.min(serverIdx, candidates.length - 1);
                // Active server shows the live count; others show cached counts
                const count =
                  activeChip && chapters.length > 0 ? chapters.length : c.chapterCount;
                return (
                  <Pressable
                    key={`${c.src}:${c.sourceSeriesId}`}
                    style={(s) => [
                      styles.serverChip,
                      activeChip && styles.serverChipActive,
                      pressFx(s),
                    ]}
                    onPress={() => setServerIdx(i)}
                  >
                    <Text
                      style={[styles.serverChipText, activeChip && styles.serverChipTextActive]}
                    >
                      {c.src === "mangadex" ? "MangaDex" : c.src}
                      {count ? ` · ${count} ch` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Chapters</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyChapters}>
            {candidates.length > 1
              ? "This server has no readable chapters for this series — try another server above."
              : "No readable chapters here (the series may be licensed or hosted elsewhere). Try searching for it in Browse."}
          </Text>
        }
        renderItem={({ item }) => {
          const read = readIds.has(item.sourceChapterId) || canonicalRead.has(item.number);
          return (
            <Pressable style={styles.chapterRow} onPress={() => openChapter(item.sourceChapterId)}>
              <Text style={[styles.chapterText, read && styles.chapterRead]}>
                Chapter {formatNum(item.number)}
                {item.title && item.title !== `Chapter ${formatNum(item.number)}`
                  ? ` — ${item.title}`
                  : ""}
              </Text>
              {item.publishedAt ? (
                <Text style={styles.chapterDate}>
                  {new Date(item.publishedAt).toLocaleDateString()}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
      </Animated.View>
      {canonicalId ? (
        <PostComposer
          visible={reviewOpen}
          onClose={() => setReviewOpen(false)}
          context={{ canonicalId, title: s.title }}
          initialKind="review"
          onPosted={() => void reviews.refetch()}
        />
      ) : null}
    </View>
  );
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: colors.danger, textAlign: "center", marginBottom: 12 },
  headerRow: { flexDirection: "row", padding: 16, gap: 14 },
  cover: { width: 110, aspectRatio: 0.7, borderRadius: 8, backgroundColor: colors.card },
  headerInfo: { flex: 1, justifyContent: "flex-end" },
  title: { color: colors.text, fontSize: 20, fontFamily: fonts.display, lineHeight: 26 },
  meta: { color: colors.muted, marginTop: 6, fontSize: 13, textTransform: "capitalize" },
  tags: { color: colors.muted, marginTop: 6, fontSize: 12 },
  buttonRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  primaryBtn: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.65)",
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
    paddingHorizontal: 16,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  primaryBtnText: {
    color: colors.accentSoft,
    fontWeight: "800",
    letterSpacing: 1.6,
    fontSize: 13,
  },
  secondaryBtn: {
    borderColor: "rgba(124,92,255,0.45)",
    borderWidth: 1.5,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  secondaryBtnActive: { backgroundColor: "rgba(124,92,255,0.12)" },
  secondaryBtnText: {
    color: colors.accentSoft,
    fontWeight: "800",
    letterSpacing: 1.2,
    fontSize: 12,
  },
  description: { color: colors.muted, paddingHorizontal: 16, paddingTop: 14, lineHeight: 20 },
  attribution: { paddingHorizontal: 16, paddingTop: 12 },
  attributionText: { color: colors.accentSoft, fontSize: 11.5, lineHeight: 17 },
  sectionTitle: {
    color: colors.accentSoft,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  chapterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  chapterText: { color: colors.text, fontSize: 14, flex: 1 },
  emptyChapters: { color: colors.muted, paddingHorizontal: 16, paddingVertical: 12, lineHeight: 20 },
  socialRow: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 16 },
  wallBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.4)",
    borderRadius: 4,
    paddingVertical: 11,
    alignItems: "center",
  },
  rateBtn: { borderColor: "rgba(245,184,76,0.5)" },
  wallBtnText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 1.6, fontSize: 12 },
  rankChip: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  rankLetter: { fontFamily: fonts.display, fontSize: 22 },
  rankMeta: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, flexShrink: 1 },
  serverRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  serverChip: {
    backgroundColor: colors.card,
    borderRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  serverChipActive: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderColor: "rgba(124,92,255,0.7)",
  },
  serverChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  serverChipTextActive: { color: colors.accentSoft },
  chapterRead: { color: colors.muted },
  chapterDate: { color: colors.muted, fontSize: 12 },
});
