// Followed series and new-chapter indicators. Offline chapter storage is
// intentionally not supported in the Play-distributed app.
import { useQueries } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { api } from "../../src/api";
import { SeriesGrid, type GridItem } from "../../src/components/SeriesGrid";
import { listLibrary, type LibraryEntry } from "../../src/library";
import { colors } from "../../src/theme";

export default function LibraryScreen() {
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

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, textAlign: "center", marginTop: 60, lineHeight: 22 },
});
