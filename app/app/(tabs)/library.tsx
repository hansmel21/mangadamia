// Library + History in one tab. A top switcher flips between your saved series
// (Library) and recently read chapters (History) — same surface, two views.
import { useQueries } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { SeriesGrid, type GridItem } from "../../src/components/SeriesGrid";
import {
  listHistory,
  listLibrary,
  type HistoryEntry,
  type LibraryEntry,
} from "../../src/library";
import { colors } from "../../src/theme";

type View_ = "library" | "history";

export default function LibraryScreen() {
  const [view, setView] = useState<View_>("library");
  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(["library", "history"] as const).map((v) => (
          <Pressable
            key={v}
            style={[styles.tab, view === v && styles.tabActive]}
            onPress={() => setView(v)}
          >
            <Text style={[styles.tabText, view === v && styles.tabTextActive]}>
              {v.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {view === "library" ? <LibraryView /> : <HistoryView />}
    </View>
  );
}

function LibraryView() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      setEntries(listLibrary());
    }, []),
  );

  const seriesQueries = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ["series", entry.src, entry.seriesId],
      queryFn: () => api.series(entry.src, entry.seriesId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const items: GridItem[] = entries.map((entry, index) => {
    const detail = seriesQueries[index]?.data;
    let badge =
      entry.lastReadChapterNumber != null
        ? `Ch. ${formatNum(entry.lastReadChapterNumber)}`
        : undefined;
    let badgeTone: "new" | "progress" = "progress";
    if (detail && entry.lastSeenChapter != null) {
      const newCount = detail.chapters.filter(
        (chapter) => chapter.number > (entry.lastSeenChapter ?? -1),
      ).length;
      if (newCount > 0) {
        badge = `+${newCount} new`;
        badgeTone = "new";
      }
    }
    return {
      src: entry.src,
      seriesId: entry.seriesId,
      title: entry.title,
      coverUrl: entry.coverUrl,
      badge,
      badgeTone,
    };
  });

  return (
    <SeriesGrid
      items={items}
      ListEmptyComponent={
        <Text style={styles.empty}>
          Your library is empty.{"\n"}Find a series in Browse and tap "+ LIBRARY".
        </Text>
      }
    />
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
      ListEmptyComponent={
        <Text style={styles.empty}>Nothing read yet — chapters you open show up here.</Text>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
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
          <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              Chapter {formatNum(item.chapterNumber)} · Page {item.pageIndex + 1}
            </Text>
            <Text style={styles.when}>{timeAgo(item.updatedAt)}</Text>
          </View>
          <ChevronRight color={colors.muted} size={20} strokeWidth={1.8} />
        </Pressable>
      )}
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
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  tabTextActive: { color: colors.accentSoft },
  empty: { color: colors.muted, textAlign: "center", marginTop: 60, lineHeight: 22, paddingHorizontal: 32 },
  historyList: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cover: { width: 48, aspectRatio: 0.7, borderRadius: 6, backgroundColor: colors.card },
  info: { flex: 1 },
  title: { color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 3 },
  when: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
