// History tab: recently read chapters, newest first. Tapping a row reopens
// the reader exactly where the reader left off (chapter + page).
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { listHistory, type HistoryEntry } from "../../src/library";
import { colors } from "../../src/theme";

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

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      setEntries(listHistory());
    }, []),
  );

  return (
    <FlatList
      style={styles.screen}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48, paddingHorizontal: 32 },
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
  chevron: { color: colors.muted, fontSize: 22 },
});
