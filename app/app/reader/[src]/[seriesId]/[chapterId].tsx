// The reader. Two modes:
//  - "vertical": continuous scroll, images at full width with natural height
//    (the right way to read manhwa/webtoons)
//  - "paged": one page per screen, swipe horizontally (classic manga)
// Tapping the screen toggles an overlay with the mode switch and
// next/previous chapter buttons. Progress is saved locally on open.
import { useQuery } from "@tanstack/react-query";
import * as Brightness from "expo-brightness";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { MessageCircle, Send, Sun } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pressFx } from "../../../../src/anim";
import { api, type PageInfo } from "../../../../src/api";
import { celebrateBadges } from "../../../../src/badges";
import { CommentsSheet } from "../../../../src/components/CommentsSheet";
import { showLevelUp } from "../../../../src/components/LevelUp";
import { showQuestCompletions } from "../../../../src/components/QuestToast";
import { PostComposer } from "../../../../src/components/PostComposer";
import { Slider } from "../../../../src/components/Slider";
import { getSessionUser } from "../../../../src/session";
import { pushProgress } from "../../../../src/sync";
import {
  getLastRead,
  markCanonicalRead,
  markChapterRead,
  setCanonicalProgress,
  setLastRead,
} from "../../../../src/library";
import { colors } from "../../../../src/theme";

type Mode = "vertical" | "paged";

export default function ReaderScreen() {
  const { src, seriesId, chapterId, openComments } = useLocalSearchParams<{
    src: string;
    seriesId: string;
    chapterId: string;
    openComments?: string;
  }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>("vertical");
  const [overlay, setOverlay] = useState(true);
  const [pageNo, setPageNo] = useState(1);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  // Arriving from a reply notification: open the thread once, automatically
  const autoOpenedComments = useRef(false);
  useEffect(() => {
    if (openComments === "1" && !autoOpenedComments.current && series?.data?.canonicalId) {
      autoOpenedComments.current = true;
      setCommentsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  // Where the reader currently is — the cascade loader re-anchors to it
  const currentIndexRef = useRef(0);
  const completionReportedRef = useRef(false);
  // Registered by the active reader; jumps the list to a page (slider)
  const jumpRef = useRef<((index: number) => void) | null>(null);

  // Resume where the reader left off, if this is the same chapter as last time
  const initialIndex = useMemo(() => {
    const last = getLastRead(src, seriesId);
    return last?.chapterId === chapterId ? last.pageIndex : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, seriesId, chapterId]);

  // Screen brightness (persists until the phone is locked)
  const [brightness, setBrightness] = useState(0.5);
  useEffect(() => {
    Brightness.getBrightnessAsync().then(setBrightness).catch(() => {});
  }, []);
  const applyBrightness = (v: number) => {
    setBrightness(v);
    void Brightness.setBrightnessAsync(v).catch(() => {});
  };

  const pages = useQuery({
    queryKey: ["pages", src, seriesId, chapterId],
    queryFn: () => api.pages(src, seriesId, chapterId),
    staleTime: 10 * 60 * 1000, // reuse the list prefetched by the series screen
  });
  // Series is already cached by the screen we came from; used for prev/next
  const series = useQuery({
    queryKey: ["series", src, seriesId],
    queryFn: () => api.series(src, seriesId),
  });

  const { chapter, prev, next } = useMemo(() => {
    const chapters = series.data?.chapters ?? [];
    const i = chapters.findIndex((c) => c.sourceChapterId === chapterId);
    return { chapter: chapters[i], prev: chapters[i - 1], next: chapters[i + 1] };
  }, [series.data, chapterId]);

  // Page changes: drive the cascade anchor, the overlay label, and saved
  // progress (chapter + page, so History and "Continue" resume exactly here).
  const onPage = (n: number) => {
    currentIndexRef.current = n - 1;
    setPageNo(n);
    if (chapter) {
      const pageCount = pages.data?.length;
      setLastRead(
        src,
        seriesId,
        chapterId,
        chapter.number,
        n - 1,
        series.data?.title,
        series.data?.coverUrl ?? undefined,
        pageCount,
      );
      const canonicalId = series.data?.canonicalId;
      if (canonicalId) {
        setCanonicalProgress(canonicalId, chapter.number, n - 1, pageCount);
        pushProgress(canonicalId, chapter.number, n - 1, pageCount);
        if (
          getSessionUser() &&
          pageCount &&
          n >= pageCount &&
          !completionReportedRef.current
        ) {
          completionReportedRef.current = true;
          api.reportRead(canonicalId, chapter.number, "completed").then((result) => {
            showQuestCompletions(result.completedQuests);
            if (result.levelUp) showLevelUp(result.levelUp);
          }).catch(() => {
            completionReportedRef.current = false;
          });
        }
      }
    }
  };

  // Record progress as soon as the chapter is opened
  useEffect(() => {
    if (chapter) {
      const pageCount = pages.data?.length;
      markChapterRead(src, seriesId, chapterId);
      setLastRead(
        src,
        seriesId,
        chapterId,
        chapter.number,
        initialIndex,
        series.data?.title,
        series.data?.coverUrl ?? undefined,
        pageCount,
      );
      const canonicalId = series.data?.canonicalId;
      if (canonicalId) {
        markCanonicalRead(canonicalId, chapter.number);
        setCanonicalProgress(canonicalId, chapter.number, initialIndex, pageCount);
        pushProgress(canonicalId, chapter.number, initialIndex, pageCount);
        // Signed-in readers earn XP/badges for reading (server dedupes)
        if (getSessionUser()) {
          api
            .reportRead(canonicalId, chapter.number)
            .then((r) => {
              celebrateBadges(r.newBadges);
              showQuestCompletions(r.completedQuests);
              if (r.levelUp) showLevelUp(r.levelUp);
            })
            .catch(() => {});
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, seriesId, chapterId, chapter]);

  useEffect(() => {
    completionReportedRef.current = false;
  }, [chapterId]);

  // Start the cascade (and the page counter) from the resume point
  useEffect(() => {
    currentIndexRef.current = initialIndex;
    if (initialIndex > 0) setPageNo(initialIndex + 1);
  }, [initialIndex]);

  // Cascade loader: load pages in order (1, 2, 3…) into the image cache,
  // re-anchoring to the reader's position — if you scroll to page 6 before
  // it's ready, page 6 and the ones after it jump the queue; skipped earlier
  // pages are filled in last.
  useEffect(() => {
    const data = pages.data;
    if (!data) return;
    let cancelled = false;
    const fetched = new Set<number>();
    (async () => {
      while (!cancelled && fetched.size < data.length) {
        const cur = currentIndexRef.current;
        const target =
          data.find((p) => p.index >= cur && !fetched.has(p.index)) ??
          data.find((p) => !fetched.has(p.index));
        if (!target) return;
        fetched.add(target.index);
        try {
          await Image.prefetch(target.imageUrl);
        } catch {
          // a failed prefetch is fine — the visible <Image> will retry it
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pages.data]);

  const goTo = (targetId: string) =>
    router.replace({
      pathname: "/reader/[src]/[seriesId]/[chapterId]",
      params: { src, seriesId, chapterId: targetId },
    });

  if (pages.isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (pages.isError || !pages.data?.length) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.error}>
          {(pages.error as Error)?.message ?? "No pages found for this chapter."}
        </Text>
        <Pressable style={styles.btn} onPress={() => pages.refetch()}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.back()}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const data = pages.data;
  const chapterLabel = chapter ? `Chapter ${formatNum(chapter.number)}` : "";

  return (
    <View style={styles.screen}>
      {mode === "vertical" ? (
        <VerticalReader
          pages={data}
          width={width}
          initialIndex={initialIndex}
          registerJump={(fn) => (jumpRef.current = fn)}
          onTap={() => setOverlay((v) => !v)}
          onPage={onPage}
        />
      ) : (
        <PagedReader
          pages={data}
          width={width}
          height={height}
          initialIndex={initialIndex}
          registerJump={(fn) => (jumpRef.current = fn)}
          onTap={() => setOverlay((v) => !v)}
          onPage={onPage}
        />
      )}

      {overlay && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.topBarText}>‹ Back</Text>
            </Pressable>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {chapterLabel}
            </Text>
            <View style={styles.topBarActions}>
              {series.data?.canonicalId && getSessionUser() ? (
                <Pressable onPress={() => setPostOpen(true)} hitSlop={12}>
                  <Send color={colors.text} size={19} strokeWidth={1.8} />
                </Pressable>
              ) : null}
              {series.data?.canonicalId ? (
                <Pressable onPress={() => setCommentsOpen(true)} hitSlop={12}>
                  <MessageCircle color={colors.text} size={20} strokeWidth={1.8} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setMode((m) => (m === "vertical" ? "paged" : "vertical"))}
                hitSlop={12}
              >
                <Text style={styles.topBarText}>
                  {mode === "vertical" ? "⇆ Paged" : "⇅ Scroll"}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.sliderRow}>
              <View style={styles.controlLabelRow}>
                <Sun color={colors.muted} size={14} strokeWidth={2} />
                <Text style={styles.controlLabelText}>Brightness</Text>
              </View>
              <Slider value={brightness} onChange={applyBrightness} />
            </View>
            <View style={styles.divider} />
            <View style={styles.sliderRow}>
              <Text style={styles.controlLabel}>
                Page {pageNo} / {data.length}
              </Text>
              <Slider
                value={pageNo}
                min={1}
                max={data.length}
                onChange={(v) => setPageNo(Math.round(v))}
                onChangeEnd={(v) => {
                  const index = Math.round(v) - 1;
                  jumpRef.current?.(index);
                  onPage(index + 1);
                }}
              />
            </View>
            <View style={styles.navRow}>
              <Pressable
                style={(s) => [styles.navBtn, !prev && styles.navBtnDisabled, pressFx(s)]}
                disabled={!prev}
                onPress={() => prev && goTo(prev.sourceChapterId)}
              >
                <Text style={styles.btnText}>‹ Prev</Text>
              </Pressable>
              <Pressable
                style={(s) => [styles.navBtn, !next && styles.navBtnDisabled, pressFx(s)]}
                disabled={!next}
                onPress={() => next && goTo(next.sourceChapterId)}
              >
                <Text style={styles.btnText}>Next ›</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {series.data?.canonicalId && chapter ? (
        <>
          <CommentsSheet
            visible={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            canonicalId={series.data.canonicalId}
            chapterNumber={chapter.number}
            chapterLabel={chapterLabel}
          />
          <PostComposer
            visible={postOpen}
            onClose={() => setPostOpen(false)}
            context={{
              canonicalId: series.data.canonicalId,
              title: series.data.title,
              chapterNumber: chapter.number,
            }}
          />
        </>
      ) : null}
    </View>
  );
}

// Overlay shown on a page slot while its image loads: "Page N" + a bar.
function PageLoadingOverlay({ index, progress }: { index: number; progress: number }) {
  return (
    <View style={styles.pageLoading} pointerEvents="none">
      <Text style={styles.pageLoadingText}>Page {index + 1}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

// Each page owns its loading state so progress ticks only re-render that page.
function ReaderPage({
  item,
  onTap,
  imageStyle,
  contentFit,
  onRatio,
}: {
  item: PageInfo;
  onTap: () => void;
  imageStyle: { width: number; height: number };
  contentFit: "cover" | "contain";
  onRatio?: (index: number, ratio: number) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  return (
    <Pressable onPress={onTap}>
      <Image
        source={{ uri: item.imageUrl }}
        style={imageStyle}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        priority={item.index < 2 ? "high" : "normal"}
        onProgress={(e) => {
          if (e.total > 0) setProgress(e.loaded / e.total);
        }}
        onLoad={(e) => {
          setLoaded(true);
          const { width: w, height: h } = e.source;
          if (w && h) onRatio?.(item.index, w / h);
        }}
      />
      {!loaded && <PageLoadingOverlay index={item.index} progress={progress} />}
    </Pressable>
  );
}

function VerticalReader({
  pages,
  width,
  initialIndex,
  registerJump,
  onTap,
  onPage,
}: {
  pages: PageInfo[];
  width: number;
  initialIndex: number;
  registerJump: (fn: (index: number) => void) => void;
  onTap: () => void;
  onPage: (n: number) => void;
}) {
  // Natural image heights aren't known until each image loads, so keep a map
  // of aspect ratios and let items grow when their image arrives.
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const listRef = useRef<FlatList<PageInfo>>(null);

  // "Current page" = the page dominating the screen (≥50% of the viewport),
  // NOT the last one with a pixel peeking in at the bottom — that off-by-one
  // leaked into saved progress and made History resume one page ahead.
  // Both viewability props must be referentially stable across renders.
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  const viewability = useRef({
    viewabilityConfig: { viewAreaCoveragePercentThreshold: 50 },
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const current = viewableItems[0];
      if (current?.item) onPageRef.current((current.item as PageInfo).index + 1);
    },
  }).current;

  const jump = (index: number) =>
    listRef.current?.scrollToIndex({ index, animated: false });
  useEffect(() => {
    registerJump(jump);
    // Resume the saved reading position once, shortly after mount
    if (initialIndex > 0) setTimeout(() => jump(initialIndex), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(p) => String(p.index)}
      // Heights are dynamic, so far jumps need the estimate-then-retry dance
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
        setTimeout(
          () => listRef.current?.scrollToIndex({ index: info.index, animated: false }),
          250,
        );
      }}
      // Pages are multi-MB full-width strips; with FlatList's defaults the
      // phone requests ~10 of them at once and the visible one crawls.
      // Render only what's near the viewport so bandwidth goes to it.
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={5}
      viewabilityConfig={viewability.viewabilityConfig}
      onViewableItemsChanged={viewability.onViewableItemsChanged}
      renderItem={({ item }) => (
        <ReaderPage
          item={item}
          onTap={onTap}
          imageStyle={{ width, height: width / (ratios[item.index] ?? 0.7) }}
          contentFit="cover"
          onRatio={(index, ratio) => setRatios((r) => ({ ...r, [index]: ratio }))}
        />
      )}
    />
  );
}

function PagedReader({
  pages,
  width,
  height,
  initialIndex,
  registerJump,
  onTap,
  onPage,
}: {
  pages: PageInfo[];
  width: number;
  height: number;
  initialIndex: number;
  registerJump: (fn: (index: number) => void) => void;
  onTap: () => void;
  onPage: (n: number) => void;
}) {
  const listRef = useRef<FlatList<PageInfo>>(null);
  useEffect(() => {
    registerJump((index) => listRef.current?.scrollToIndex({ index, animated: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <FlatList
      ref={listRef}
      data={pages}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={5}
      initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
      keyExtractor={(p) => String(p.index)}
      onMomentumScrollEnd={(e) => onPage(Math.round(e.nativeEvent.contentOffset.x / width) + 1)}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      renderItem={({ item }) => (
        <ReaderPage
          item={item}
          onTap={onTap}
          imageStyle={{ width, height }}
          contentFit="contain"
        />
      )}
    />
  );
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  error: { color: colors.danger, textAlign: "center", marginBottom: 8 },
  btn: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.6)",
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  btnGhost: { backgroundColor: "transparent", borderColor: colors.border },
  btnText: {
    color: colors.accentSoft,
    fontWeight: "800",
    letterSpacing: 1.4,
    fontSize: 12,
    textTransform: "uppercase",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(15,17,21,0.92)",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topBarText: { color: colors.text, fontSize: 15 },
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  topBarTitle: { color: colors.text, fontWeight: "700", flex: 1, textAlign: "center" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15,17,21,0.92)",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  controlLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    width: 104,
    fontVariant: ["tabular-nums"],
  },
  controlLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, width: 104 },
  controlLabelText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.15)" },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  navBtn: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.6)",
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navBtnDisabled: { opacity: 0.3 },
  pageLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  pageLoadingText: { color: colors.muted, fontSize: 13 },
  progressTrack: {
    width: "45%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: colors.accent },
});
