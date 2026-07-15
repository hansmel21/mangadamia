// The reader. Two modes:
//  - "vertical": continuous scroll. Reaching the end of a chapter loads the
//    next one right below, so you keep scrolling straight into it (webtoons).
//  - "paged": one page per screen, swipe horizontally (classic manga).
// Tapping toggles an overlay with the mode switch and next/previous buttons.
// Progress is saved per chapter; a chapter counts as "completed" the moment you
// scroll past its last page (or reach the very end of the list).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Brightness from "expo-brightness";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, MessageCircle, Send, Sun } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pressFx } from "../../../../src/anim";
import { api, type ChapterInfo, type PageInfo } from "../../../../src/api";
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

type PageReaderItem = {
  kind: "page";
  key: string;
  chapterId: string;
  chapterNumber: number;
  chapterPageCount: number;
  pageIndex: number;
  imageUrl: string;
  headers?: Record<string, string>;
};
type ReaderItem = PageReaderItem | { kind: "divider"; key: string; chapterNumber: number };

export default function ReaderScreen() {
  const { src, seriesId, chapterId, openComments } = useLocalSearchParams<{
    src: string;
    seriesId: string;
    chapterId: string;
    openComments?: string;
  }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("vertical");
  const [overlay, setOverlay] = useState(true);
  const [pageNo, setPageNo] = useState(1);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);

  const pages = useQuery({
    queryKey: ["pages", src, seriesId, chapterId],
    queryFn: () => api.pages(src, seriesId, chapterId),
    staleTime: 10 * 60 * 1000, // reuse the list prefetched by the series screen
  });
  // Series is already cached by the screen we came from; used for chapter order
  const series = useQuery({
    queryKey: ["series", src, seriesId],
    queryFn: () => api.series(src, seriesId),
  });

  const chapters = useMemo(() => series.data?.chapters ?? [], [series.data]);
  const chapterById = (id?: string | null): ChapterInfo | undefined =>
    chapters.find((c) => c.sourceChapterId === id);
  const entryChapter = chapterById(chapterId);
  const canonicalId = series.data?.canonicalId ?? undefined;

  // Continuous-reading chapter queue (vertical mode). Starts at the entry
  // chapter; the next chapter is appended when the reader nears the bottom.
  const [queueIds, setQueueIds] = useState<string[]>([chapterId]);
  const [pagesByChapter, setPagesByChapter] = useState<Record<string, PageInfo[]>>({});
  const loadingRef = useRef<Set<string>>(new Set());

  // Per-chapter bookkeeping guards (reset when the route chapter changes).
  const openedRef = useRef<Set<string>>(new Set());
  const completedRef = useRef<Set<number>>(new Set());
  const currentIdRef = useRef<string | null>(null);
  const currentGlobalRef = useRef(0);
  const jumpRef = useRef<((index: number) => void) | null>(null);
  const [current, setCurrent] = useState<{ id: string; number: number; pageCount: number } | null>(
    null,
  );

  // Resume where the reader left off, if this is the same chapter as last time
  const initialIndex = useMemo(() => {
    const last = getLastRead(src, seriesId);
    return last?.chapterId === chapterId ? last.pageIndex : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, seriesId, chapterId]);

  // Arriving from a reply notification: open the thread once, automatically
  const autoOpenedComments = useRef(false);
  useEffect(() => {
    if (openComments === "1" && !autoOpenedComments.current && canonicalId) {
      autoOpenedComments.current = true;
      setCommentsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Reset the queue + guards whenever the route chapter changes (Prev/Next).
  useEffect(() => {
    setQueueIds([chapterId]);
    openedRef.current = new Set();
    completedRef.current = new Set();
    currentIdRef.current = null;
    currentGlobalRef.current = 0;
    setCurrent(null);
    setPageNo(initialIndex + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  // Load pages for every queued chapter (the entry chapter shares the `pages`
  // query cache, so this dedupes with it).
  useEffect(() => {
    for (const id of queueIds) {
      if (pagesByChapter[id] || loadingRef.current.has(id)) continue;
      loadingRef.current.add(id);
      queryClient
        .fetchQuery({
          queryKey: ["pages", src, seriesId, id],
          queryFn: () => api.pages(src, seriesId, id),
          staleTime: 10 * 60 * 1000,
        })
        .then((data) => setPagesByChapter((prev) => ({ ...prev, [id]: data })))
        .catch(() => {})
        .finally(() => loadingRef.current.delete(id));
    }
  }, [queueIds, pagesByChapter, src, seriesId, queryClient]);

  // Screen brightness (persists until the phone is locked)
  const [brightness, setBrightness] = useState(0.5);
  useEffect(() => {
    Brightness.getBrightnessAsync().then(setBrightness).catch(() => {});
  }, []);
  const applyBrightness = (v: number) => {
    setBrightness(v);
    void Brightness.setBrightnessAsync(v).catch(() => {});
  };

  // ── Reading bookkeeping ────────────────────────────────────────────────
  const enterChapter = (id: string, number: number) => {
    if (openedRef.current.has(id)) return;
    openedRef.current.add(id);
    markChapterRead(src, seriesId, id);
    if (canonicalId) markCanonicalRead(canonicalId, number);
    // Signed-in readers earn XP/badges for opening a chapter (server dedupes)
    if (getSessionUser() && canonicalId) {
      api
        .reportRead(canonicalId, number)
        .then((r) => {
          celebrateBadges(r.newBadges);
          showQuestCompletions(r.completedQuests);
          if (r.levelUp) showLevelUp(r.levelUp);
        })
        .catch(() => {});
    }
  };

  const reportCompleted = (number: number) => {
    if (completedRef.current.has(number)) return;
    completedRef.current.add(number);
    if (getSessionUser() && canonicalId) {
      api
        .reportRead(canonicalId, number, "completed")
        .then((r) => {
          showQuestCompletions(r.completedQuests);
          if (r.levelUp) showLevelUp(r.levelUp);
        })
        .catch(() => {
          completedRef.current.delete(number);
        });
    }
  };

  const saveProgress = (id: string, number: number, pageIndex: number, pageCount: number) => {
    setLastRead(
      src,
      seriesId,
      id,
      number,
      pageIndex,
      series.data?.title,
      series.data?.coverUrl ?? undefined,
      pageCount,
    );
    if (canonicalId) {
      setCanonicalProgress(canonicalId, number, pageIndex, pageCount);
      pushProgress(canonicalId, number, pageIndex, pageCount);
    }
  };

  // Report progress/opened for the entry chapter as soon as its pages arrive,
  // even before the first scroll fires viewability.
  useEffect(() => {
    const pgs = pagesByChapter[chapterId];
    if (!entryChapter || !pgs) return;
    if (currentIdRef.current === null) {
      currentIdRef.current = chapterId;
      setCurrent({ id: chapterId, number: entryChapter.number, pageCount: pgs.length });
    }
    enterChapter(chapterId, entryChapter.number);
    saveProgress(chapterId, entryChapter.number, initialIndex, pgs.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesByChapter, chapterId, entryChapter]);

  // The page that currently dominates the viewport, from the vertical reader.
  const onVisiblePage = (item: PageReaderItem, globalIndex: number) => {
    currentGlobalRef.current = globalIndex;
    setPageNo(item.pageIndex + 1);
    if (currentIdRef.current !== item.chapterId) {
      const leavingId = currentIdRef.current;
      currentIdRef.current = item.chapterId;
      setCurrent({ id: item.chapterId, number: item.chapterNumber, pageCount: item.chapterPageCount });
      enterChapter(item.chapterId, item.chapterNumber);
      const leaving = chapterById(leavingId);
      // Only crossing FORWARD into the next chapter completes the one left —
      // scrolling UP into the previous chapter (recap) must not mark the
      // current chapter as finished.
      if (leaving && leaving.number < item.chapterNumber) reportCompleted(leaving.number);
    }
    saveProgress(item.chapterId, item.chapterNumber, item.pageIndex, item.chapterPageCount);
    if (item.pageIndex >= item.chapterPageCount - 1) reportCompleted(item.chapterNumber);
  };

  // Vertical items: pages of every loaded chapter, separated by dividers.
  const items = useMemo<ReaderItem[]>(() => {
    const out: ReaderItem[] = [];
    for (const id of queueIds) {
      const ch = chapterById(id);
      const pgs = pagesByChapter[id];
      if (!ch || !pgs) break; // keep order — wait for this chapter to load
      if (out.length > 0) out.push({ kind: "divider", key: `div:${id}`, chapterNumber: ch.number });
      for (const p of pgs) {
        out.push({
          kind: "page",
          key: `${id}:${p.index}`,
          chapterId: id,
          chapterNumber: ch.number,
          chapterPageCount: pgs.length,
          pageIndex: p.index,
          imageUrl: p.imageUrl,
          headers: p.headers,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueIds, pagesByChapter, chapters]);

  const chapterOffsets = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((it, i) => {
      if (it.kind === "page" && map[it.chapterId] === undefined) map[it.chapterId] = i;
    });
    return map;
  }, [items]);

  // Reaching the bottom: append the next chapter, or (if there is none) mark
  // the final chapter complete.
  const loadNextOrFinish = () => {
    const lastPage = [...items].reverse().find((it): it is PageReaderItem => it.kind === "page");
    const lastLoadedId = lastPage?.chapterId ?? chapterId;
    const idx = chapters.findIndex((c) => c.sourceChapterId === lastLoadedId);
    const nextCh = chapters[idx + 1];
    if (nextCh && !queueIds.includes(nextCh.sourceChapterId)) {
      setQueueIds((prev) =>
        prev.includes(nextCh.sourceChapterId) ? prev : [...prev, nextCh.sourceChapterId],
      );
    } else if (!nextCh && lastPage) {
      reportCompleted(lastPage.chapterNumber);
    }
  };

  // Reaching the top: prepend the PREVIOUS chapter (scroll up to recap what
  // happened). Pages are fetched BEFORE the id enters the queue — the items
  // builder halts at the first unloaded chapter, so prepending an unloaded id
  // would blank the list. maintainVisibleContentPosition keeps the viewport
  // anchored when the items appear above.
  const prependingRef = useRef(false);
  const loadPrevious = () => {
    if (prependingRef.current) return;
    const firstPage = items.find((it): it is PageReaderItem => it.kind === "page");
    const firstLoadedId = firstPage?.chapterId ?? chapterId;
    const idx = chapters.findIndex((c) => c.sourceChapterId === firstLoadedId);
    const prevCh = idx > 0 ? chapters[idx - 1] : undefined;
    if (!prevCh || queueIds.includes(prevCh.sourceChapterId)) return;
    prependingRef.current = true;
    const prevId = prevCh.sourceChapterId;
    queryClient
      .fetchQuery({
        queryKey: ["pages", src, seriesId, prevId],
        queryFn: () => api.pages(src, seriesId, prevId),
        staleTime: 10 * 60 * 1000,
      })
      .then((data) => {
        setPagesByChapter((prev) => ({ ...prev, [prevId]: data }));
        setQueueIds((prev) => (prev.includes(prevId) ? prev : [prevId, ...prev]));
      })
      .catch(() => {
        // fetch failed (offline / scraper down) — the next attempt retries
      })
      .finally(() => {
        prependingRef.current = false;
      });
  };

  // Cascade prefetch: warm page images in order from the reader's position, so
  // bandwidth goes to what's coming up next (across loaded chapters).
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    const fetched = new Set<string>();
    const total = items.reduce((n, it) => (it.kind === "page" ? n + 1 : n), 0);
    (async () => {
      while (!cancelled && fetched.size < total) {
        const cur = currentGlobalRef.current;
        const target =
          items.find((it, i): it is PageReaderItem => it.kind === "page" && i >= cur && !fetched.has(it.key)) ??
          items.find((it): it is PageReaderItem => it.kind === "page" && !fetched.has(it.key));
        if (!target) return;
        fetched.add(target.key);
        try {
          await Image.prefetch(target.imageUrl, { headers: target.headers });
        } catch {
          // a failed prefetch is fine — the visible <Image> will retry it
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const goTo = (targetId: string) =>
    router.replace({
      pathname: "/reader/[src]/[seriesId]/[chapterId]",
      params: { src, seriesId, chapterId: targetId },
    });

  const pagedPages = pagesByChapter[chapterId] ?? pages.data ?? [];
  const onPagePaged = (n: number) => {
    setPageNo(n);
    if (!entryChapter) return;
    saveProgress(chapterId, entryChapter.number, n - 1, pagedPages.length);
    if (pagedPages.length > 0 && n >= pagedPages.length) reportCompleted(entryChapter.number);
  };

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

  const activeChapter = current ? chapterById(current.id) ?? entryChapter : entryChapter;
  const chapterLabel = activeChapter ? `Chapter ${formatNum(activeChapter.number)}` : "";
  const sliderMax = current?.pageCount ?? pages.data.length;

  // Prev/Next relative to the chapter you're actually reading.
  const navIdx = chapters.findIndex((c) => c.sourceChapterId === (current?.id ?? chapterId));
  const prev = chapters[navIdx - 1];
  const next = chapters[navIdx + 1];
  const goNext = () => {
    if (!next) return;
    // Already loaded below — just scroll into it. Otherwise navigate.
    if (mode === "vertical" && chapterOffsets[next.sourceChapterId] !== undefined) {
      jumpRef.current?.(chapterOffsets[next.sourceChapterId]);
    } else {
      goTo(next.sourceChapterId);
    }
  };
  const goPrev = () => {
    if (!prev) return;
    // Already prepended above — just scroll back up to it. Otherwise navigate.
    if (mode === "vertical" && chapterOffsets[prev.sourceChapterId] !== undefined) {
      jumpRef.current?.(chapterOffsets[prev.sourceChapterId]);
    } else {
      goTo(prev.sourceChapterId);
    }
  };

  return (
    <View style={styles.screen}>
      {mode === "vertical" ? (
        <VerticalReader
          items={items}
          width={width}
          initialIndex={initialIndex}
          registerJump={(fn) => (jumpRef.current = fn)}
          onTap={() => setOverlay((v) => !v)}
          onVisiblePage={onVisiblePage}
          onEndReached={loadNextOrFinish}
          onStartReached={loadPrevious}
        />
      ) : (
        <PagedReader
          pages={pagedPages}
          width={width}
          height={height}
          initialIndex={initialIndex}
          registerJump={(fn) => (jumpRef.current = fn)}
          onTap={() => setOverlay((v) => !v)}
          onPage={onPagePaged}
        />
      )}

      {overlay && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
              <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
            </Pressable>
            <View style={styles.topBarTitleWrap}>
              <Text style={styles.topBarTitle} numberOfLines={1}>
                {series.data?.title ?? ""}
              </Text>
              <Text style={styles.topBarChapter} numberOfLines={1}>
                {chapterLabel.toUpperCase()}
              </Text>
            </View>
            <View style={styles.topBarActions}>
              {canonicalId && getSessionUser() ? (
                <Pressable onPress={() => setPostOpen(true)} hitSlop={12}>
                  <Send color={colors.text} size={19} strokeWidth={1.8} />
                </Pressable>
              ) : null}
              {canonicalId ? (
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
                Page {Math.min(pageNo, sliderMax)} / {sliderMax}
              </Text>
              <Slider
                value={Math.min(pageNo, sliderMax)}
                min={1}
                max={sliderMax}
                onChange={(v) => setPageNo(Math.round(v))}
                onChangeEnd={(v) => {
                  const pageIndex = Math.round(v) - 1;
                  if (mode === "vertical") {
                    const base = current ? chapterOffsets[current.id] ?? 0 : 0;
                    jumpRef.current?.(base + pageIndex);
                  } else {
                    jumpRef.current?.(pageIndex);
                    onPagePaged(pageIndex + 1);
                  }
                }}
              />
            </View>
            <View style={styles.navRow}>
              <Pressable
                style={(s) => [styles.navBtn, !prev && styles.navBtnDisabled, pressFx(s)]}
                disabled={!prev}
                onPress={goPrev}
              >
                <Text style={styles.btnText}>‹ Prev</Text>
              </Pressable>
              <Pressable hitSlop={10} onPress={() => router.back()}>
                <Text style={styles.saveExit}>SAVE &amp; EXIT ▸</Text>
              </Pressable>
              <Pressable
                style={(s) => [styles.navBtn, !next && styles.navBtnDisabled, pressFx(s)]}
                disabled={!next}
                onPress={goNext}
              >
                <Text style={styles.btnText}>Next ›</Text>
              </Pressable>
            </View>
            <Text style={styles.autoSaveHint}>
              progress auto-saves · +XP on chapter clear
            </Text>
          </View>
        </>
      )}

      {canonicalId && activeChapter ? (
        <>
          <CommentsSheet
            visible={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            canonicalId={canonicalId}
            chapterNumber={activeChapter.number}
            chapterLabel={chapterLabel}
          />
          <PostComposer
            visible={postOpen}
            onClose={() => setPostOpen(false)}
            context={{
              canonicalId,
              title: series.data?.title ?? "this series",
              chapterNumber: activeChapter.number,
            }}
          />
        </>
      ) : null}
    </View>
  );
}

// Overlay shown on a page slot while its image loads: "Page N" + a bar.
function PageLoadingOverlay({ label, progress }: { label: string; progress: number }) {
  return (
    <View style={styles.pageLoading} pointerEvents="none">
      <Text style={styles.pageLoadingText}>{label}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

// Each page owns its loading state so progress ticks only re-render that page.
function ReaderPage({
  imageUrl,
  headers,
  label,
  onTap,
  imageStyle,
  contentFit,
  priority,
  onRatio,
}: {
  imageUrl: string;
  headers?: Record<string, string>;
  label: string;
  onTap: () => void;
  imageStyle: { width: number; height: number };
  contentFit: "cover" | "contain";
  priority?: "high" | "normal";
  onRatio?: (ratio: number) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  return (
    <Pressable onPress={onTap}>
      <Image
        source={{ uri: imageUrl, headers }}
        style={imageStyle}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        priority={priority ?? "normal"}
        onProgress={(e) => {
          if (e.total > 0) setProgress(e.loaded / e.total);
        }}
        onLoad={(e) => {
          setLoaded(true);
          const { width: w, height: h } = e.source;
          if (w && h) onRatio?.(w / h);
        }}
      />
      {!loaded && <PageLoadingOverlay label={label} progress={progress} />}
    </Pressable>
  );
}

function ChapterDivider({ chapterNumber }: { chapterNumber: number }) {
  return (
    <View style={styles.chapterDivider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>CHAPTER {formatNum(chapterNumber)}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function VerticalReader({
  items,
  width,
  initialIndex,
  registerJump,
  onTap,
  onVisiblePage,
  onEndReached,
  onStartReached,
}: {
  items: ReaderItem[];
  width: number;
  initialIndex: number;
  registerJump: (fn: (index: number) => void) => void;
  onTap: () => void;
  onVisiblePage: (item: PageReaderItem, globalIndex: number) => void;
  onEndReached: () => void;
  onStartReached: () => void;
}) {
  // Natural image heights aren't known until each image loads, so keep a map
  // of aspect ratios (keyed by item key) and let items grow when they arrive.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const listRef = useRef<FlatList<ReaderItem>>(null);

  // Previous-chapter loading requires a REAL upward scroll gesture near the
  // top. onStartReached is deliberately NOT used: it re-fires on every content
  // size change (which happens constantly while page images load in), so it
  // silently prepended the previous chapter on plain chapter opens and the
  // anchor drift landed the reader on a random page.
  // armedRef: also wait out the mount (the resume jump fires ~150ms in;
  // prepending before it would shift its target index).
  const armedRef = useRef(false);
  const lastYRef = useRef(0);
  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastYRef.current;
    lastYRef.current = y;
    // Moving upward within a viewport of the top (or into the iOS bounce)
    // is the "show me the previous chapter" gesture. Prepends adjust the
    // offset DOWNWARD-positive via maintainVisibleContentPosition, so they
    // can't re-trigger this themselves.
    if (armedRef.current && dy < -1 && y < e.nativeEvent.layoutMeasurement.height * 0.75) {
      onStartReached();
    }
  };

  // "Current page" = the page dominating the screen (≥50% of the viewport),
  // skipping chapter dividers. Both viewability props must be referentially
  // stable across renders.
  const onVisibleRef = useRef(onVisiblePage);
  onVisibleRef.current = onVisiblePage;
  const viewability = useRef({
    viewabilityConfig: { viewAreaCoveragePercentThreshold: 50 },
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const token = viewableItems.find((t) => (t.item as ReaderItem)?.kind === "page");
      if (token?.item) onVisibleRef.current(token.item as PageReaderItem, token.index ?? 0);
    },
  }).current;

  const jump = (index: number) => listRef.current?.scrollToIndex({ index, animated: false });
  useEffect(() => {
    registerJump(jump);
    // Resume the saved reading position once, shortly after mount
    if (initialIndex > 0) setTimeout(() => jump(initialIndex), 150);
    const arm = setTimeout(() => (armedRef.current = true), 600);
    return () => clearTimeout(arm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(it) => it.key}
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
      // Pages are multi-MB full-width strips; render only what's near the
      // viewport so bandwidth goes to it.
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={5}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      // Scrolling up near the top loads the PREVIOUS chapter above; keeping
      // the visible page anchored stops the prepend from jumping the viewport.
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onScroll={onListScroll}
      scrollEventThrottle={32}
      viewabilityConfig={viewability.viewabilityConfig}
      onViewableItemsChanged={viewability.onViewableItemsChanged}
      renderItem={({ item }) =>
        item.kind === "divider" ? (
          <ChapterDivider chapterNumber={item.chapterNumber} />
        ) : (
          <ReaderPage
            imageUrl={item.imageUrl}
            headers={item.headers}
            label={`Page ${item.pageIndex + 1}`}
            onTap={onTap}
            imageStyle={{ width, height: width / (ratios[item.key] ?? 0.7) }}
            contentFit="cover"
            priority={item.pageIndex < 2 ? "high" : "normal"}
            onRatio={(ratio) => setRatios((r) => ({ ...r, [item.key]: ratio }))}
          />
        )
      }
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
          imageUrl={item.imageUrl}
          headers={item.headers}
          label={`Page ${item.index + 1}`}
          onTap={onTap}
          imageStyle={{ width, height }}
          contentFit="contain"
          priority={item.index < 2 ? "high" : "normal"}
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
    backgroundColor: "rgba(107,94,204,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.6)",
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
  chapterDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 28,
    paddingVertical: 30,
    backgroundColor: "#000",
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(107,94,204,0.4)" },
  dividerText: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(10,11,16,0.94)",
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topBarText: { color: colors.text, fontSize: 15 },
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  topBarTitleWrap: { flex: 1, alignItems: "center", gap: 1 },
  topBarTitle: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "center" },
  topBarChapter: {
    color: colors.accentBright,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(10,11,16,0.94)",
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  saveExit: { color: colors.data, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2 },
  autoSaveHint: {
    color: colors.muted,
    fontSize: 9,
    textAlign: "center",
    marginTop: -2,
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
    backgroundColor: "rgba(107,94,204,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.6)",
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
