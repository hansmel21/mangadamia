// ARCHIVE — the shelf, System Protocol layout: in-screen bracketed title +
// HISTORY key + sync state, a RESUME EXPEDITION window for the most recent
// read, shelf chips (ALL / READING / CAUGHT UP / DONE) filtering the grid,
// unread "+n" badges + progress hairlines on covers, and a dashed ADD SERIES
// tile. HISTORY flips to the EXPEDITION LOG view.
import { useQueries } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ArrowLeft, History, Play } from "lucide-react-native";
import { useCallback, useState, useSyncExternalStore } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { SeriesGrid, type GridItem } from "../../src/components/SeriesGrid";
import { ScreenTitle, SystemKey } from "../../src/components/SystemUI";
import {
  listHistory,
  listLibrary,
  type HistoryEntry,
  type LibraryEntry,
} from "../../src/library";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

type Shelf = "all" | "reading" | "caught" | "done";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const [view, setView] = useState<"shelf" | "history">("shelf");

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {view === "shelf" ? (
        <View style={styles.header}>
          <ScreenTitle>ARCHIVE</ScreenTitle>
          <Pressable
            style={({ pressed }) => [styles.historyKey, pressed && { opacity: 0.7 }]}
            onPress={() => setView("history")}
            accessibilityRole="button"
            accessibilityLabel="Reading history"
          >
            <History color={colors.accentBright} size={13} strokeWidth={2} />
            <Text style={styles.historyKeyText}>HISTORY</Text>
          </Pressable>
          <View style={styles.syncState}>
            <View style={[styles.syncDot, { backgroundColor: user ? colors.fresh : colors.muted }]} />
            <Text style={[styles.syncText, { color: user ? colors.fresh : colors.muted }]}>
              {user ? "SYNCED" : "LOCAL"}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable hitSlop={10} onPress={() => setView("shelf")} accessibilityLabel="Back to shelf">
            <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
          </Pressable>
          <ScreenTitle>EXPEDITION LOG</ScreenTitle>
        </View>
      )}
      {view === "shelf" ? <ShelfView /> : <HistoryView />}
    </View>
  );
}

function ShelfView() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [resume, setResume] = useState<HistoryEntry | null>(null);
  const [shelf, setShelf] = useState<Shelf>("all");
  useFocusEffect(
    useCallback(() => {
      setEntries(listLibrary());
      setResume(listHistory(1)[0] ?? null);
    }, []),
  );

  const seriesQueries = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ["series", entry.src, entry.seriesId],
      queryFn: () => api.series(entry.src, entry.seriesId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Bucket each entry by reading state, from local progress + series detail.
  const decorated = entries.map((entry, index) => {
    const detail = seriesQueries[index]?.data;
    const lastRead = entry.lastReadChapterNumber ?? null;
    const maxChapter = detail?.chapters.length
      ? Math.max(...detail.chapters.map((c) => c.number))
      : null;
    const unread =
      detail && lastRead != null
        ? detail.chapters.filter((c) => c.number > lastRead).length
        : 0;
    const caughtUp = lastRead != null && maxChapter != null && lastRead >= maxChapter;
    const done = (detail?.status ?? "").toLowerCase().includes("complet");
    const bucket: Shelf =
      done && caughtUp ? "done" : caughtUp ? "caught" : lastRead != null ? "reading" : "all";
    const progress =
      lastRead != null && maxChapter != null && maxChapter > 0
        ? Math.min(100, (lastRead / maxChapter) * 100)
        : undefined;
    return { entry, unread, bucket, caughtUp, progress };
  });

  const counts = {
    reading: decorated.filter((d) => d.bucket === "reading").length,
    caught: decorated.filter((d) => d.bucket === "caught").length,
    done: decorated.filter((d) => d.bucket === "done").length,
  };
  const visible = shelf === "all" ? decorated : decorated.filter((d) => d.bucket === shelf);

  const items: GridItem[] = visible.map(({ entry, unread, caughtUp, progress }) => ({
    src: entry.src,
    seriesId: entry.seriesId,
    title: entry.title,
    coverUrl: entry.coverUrl,
    badge:
      entry.lastReadChapterNumber != null
        ? `Ch. ${formatNum(entry.lastReadChapterNumber)}`
        : undefined,
    badgeTone: "progress",
    unread,
    progress,
    progressColor: caughtUp ? colors.fresh : colors.accent,
  }));

  return (
    <SeriesGrid
      items={items}
      onAddPress={() => router.navigate("/")}
      ListHeaderComponent={
        <View>
          {resume ? <ResumeWindow entry={resume} /> : null}
          <View style={styles.chips}>
            <SystemKey variant="chip" label="ALL" active={shelf === "all"} onPress={() => setShelf("all")} />
            <SystemKey
              variant="chip"
              label={`READING ${counts.reading}`}
              active={shelf === "reading"}
              onPress={() => setShelf("reading")}
            />
            <SystemKey
              variant="chip"
              label="CAUGHT UP"
              active={shelf === "caught"}
              onPress={() => setShelf("caught")}
            />
            <SystemKey variant="chip" label="DONE" active={shelf === "done"} onPress={() => setShelf("done")} />
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {shelf === "all"
            ? 'Your archive is empty.\nFind a series on Home and tap "+ LIBRARY".'
            : "Nothing on this shelf yet."}
        </Text>
      }
    />
  );
}

// The most recent read position as a framed System window with a play key.
function ResumeWindow({ entry }: { entry: HistoryEntry }) {
  const pct =
    entry.pageCount && entry.pageCount > 0
      ? Math.min(100, ((entry.pageIndex + 1) / entry.pageCount) * 100)
      : 0;
  const open = () =>
    router.push({
      pathname: "/reader/[src]/[seriesId]/[chapterId]",
      params: { src: entry.src, seriesId: entry.seriesId, chapterId: entry.chapterId },
    });
  return (
    <Pressable
      style={({ pressed }) => [styles.resume, pressed && { borderColor: "rgba(124,92,255,0.8)" }]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel="Resume reading"
    >
      <View style={[styles.resumeTick, styles.resumeTickTL]} pointerEvents="none" />
      <View style={[styles.resumeTick, styles.resumeTickBR]} pointerEvents="none" />
      {entry.coverUrl ? (
        <Image source={{ uri: entry.coverUrl }} style={styles.resumeCover} contentFit="cover" />
      ) : (
        <View style={[styles.resumeCover, styles.resumeCoverEmpty]} />
      )}
      <View style={styles.resumeBody}>
        <Text style={styles.resumeEyebrow}>RESUME EXPEDITION</Text>
        <Text style={styles.resumeTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.resumeMeta}>
          Ch.{formatNum(entry.chapterNumber)} · page {entry.pageIndex + 1}
          {entry.pageCount ? ` of ${entry.pageCount}` : ""} · {timeAgo(entry.updatedAt)}
        </Text>
        <View style={styles.resumeTrack}>
          <View style={[styles.resumeFill, { width: `${pct}%` }]} />
        </View>
      </View>
      <View style={styles.playKey}>
        <Play color="#fff" size={16} strokeWidth={2} fill="#fff" />
      </View>
    </Pressable>
  );
}

function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      setEntries(listHistory());
    }, []),
  );

  return (
    <FlatList
      style={styles.historyList}
      data={entries}
      keyExtractor={(e) => `${e.src}:${e.seriesId}`}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListEmptyComponent={
        <Text style={styles.empty}>Nothing read yet — chapters you open show up here.</Text>
      }
      renderItem={({ item }) => {
        const pct =
          item.pageCount && item.pageCount > 0
            ? Math.min(100, Math.round(((item.pageIndex + 1) / item.pageCount) * 100))
            : 0;
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { borderColor: colors.accentLine }]}
            onPress={() =>
              router.push({
                pathname: "/reader/[src]/[seriesId]/[chapterId]",
                params: { src: item.src, seriesId: item.seriesId, chapterId: item.chapterId },
              })
            }
            onLongPress={() =>
              router.push({
                pathname: "/series/[src]/[id]",
                params: { src: item.src, id: item.seriesId, title: item.title },
              })
            }
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.resumeCoverEmpty]} />
            )}
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.meta}>
                Ch.{formatNum(item.chapterNumber)} · page {item.pageIndex + 1}
                {item.pageCount ? `/${item.pageCount}` : ""}
              </Text>
              <View style={styles.rowTrack}>
                <View style={[styles.rowFill, { width: `${pct}%` }]} />
              </View>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.when}>{timeAgo(item.updatedAt)}</Text>
              <Text style={styles.resumeLink}>RESUME ▸</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  historyKey: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  historyKeyText: { color: colors.accentBright, fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
  syncState: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  chips: { flexDirection: "row", gap: 4, marginTop: 12, marginBottom: 2 },
  empty: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 60,
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  resume: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.5)",
    borderRadius: 3,
    padding: 12,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  resumeTick: { position: "absolute", width: 9, height: 9, borderColor: colors.accentBright },
  resumeTickTL: { top: -2, left: -2, borderTopWidth: 2, borderLeftWidth: 2 },
  resumeTickBR: { bottom: -2, right: -2, borderBottomWidth: 2, borderRightWidth: 2 },
  resumeCover: {
    width: 48,
    height: 66,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
  },
  resumeCoverEmpty: { backgroundColor: "rgba(124,92,255,0.08)" },
  resumeBody: { flex: 1, gap: 2 },
  resumeEyebrow: { color: colors.accentBright, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.6 },
  resumeTitle: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 1 },
  resumeMeta: { color: colors.muted, fontSize: 11 },
  resumeTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bg,
    overflow: "hidden",
    marginTop: 4,
  },
  resumeFill: { height: "100%", backgroundColor: colors.accent },
  playKey: {
    width: 42,
    height: 42,
    borderRadius: 3,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  historyList: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 11,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 3,
  },
  cover: {
    width: 34,
    height: 46,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
  },
  info: { flex: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 10.5, marginTop: 2 },
  rowTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.bg,
    overflow: "hidden",
    marginTop: 6,
    maxWidth: 160,
  },
  rowFill: { height: "100%", backgroundColor: colors.accent },
  rowRight: { alignItems: "flex-end", gap: 6 },
  when: { color: colors.muted, fontSize: 9.5 },
  resumeLink: { color: colors.data, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
});
