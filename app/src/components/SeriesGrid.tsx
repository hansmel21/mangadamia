// Reusable 3-column cover grid used by Browse and the Archive. System Protocol
// treatment: square corners, an optional purple "+n" unread badge pinned
// top-right, a bottom progress hairline, and an optional dashed ADD SERIES
// tile appended to the grid.
import { Image } from "expo-image";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { pressFx } from "../anim";
import { colors } from "../theme";

export interface GridItem {
  src: string;
  seriesId: string;
  title: string;
  coverUrl?: string;
  badge?: string;
  // "new" = Ultraviolet pill (unread chapters); "progress" = quiet Tone pill
  badgeTone?: "new" | "progress";
  // Chapters ahead of reading progress — renders the purple "+n" corner badge.
  unread?: number;
  // 0–100 reading progress for the bottom hairline.
  progress?: number;
  // Hairline color: reading = ultraviolet, caught up = fresh green.
  progressColor?: string;
  // All sources that carry this series ("servers"), best-first. When absent
  // (e.g. library entries), the series screen falls back to src/seriesId.
  servers?: { src: string; sourceSeriesId: string }[];
}

type Cell = { type: "series"; item: GridItem } | { type: "add" };

export function SeriesGrid({
  items,
  onEndReached,
  ListEmptyComponent,
  ListHeaderComponent,
  refreshing,
  onRefresh,
  onItemPress,
  onScroll,
  contentTopPadding,
  onAddPress,
}: {
  items: GridItem[];
  onEndReached?: () => void;
  ListEmptyComponent?: React.ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
  // Overrides the default navigation to the series screen
  onItemPress?: (item: GridItem) => void;
  ListHeaderComponent?: React.ReactElement;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  contentTopPadding?: number;
  // Appends the dashed "ADD SERIES" tile after the last cover.
  onAddPress?: () => void;
}) {
  const { width } = useWindowDimensions();
  const itemWidth = (width - 16 * 2 - 10 * 2) / 3;

  const cells: Cell[] = [
    ...items.map((item) => ({ type: "series", item }) as Cell),
    ...(onAddPress && items.length > 0 ? [{ type: "add" } as Cell] : []),
  ];

  return (
    <FlatList
      data={cells}
      numColumns={3}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.muted}
          />
        ) : undefined
      }
      keyExtractor={(cell) =>
        cell.type === "add" ? "::add" : `${cell.item.src}:${cell.item.seriesId}`
      }
      contentContainerStyle={[
        styles.container,
        contentTopPadding !== undefined && { paddingTop: contentTopPadding },
      ]}
      columnWrapperStyle={{ gap: 10 }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={ListEmptyComponent}
      ListHeaderComponent={ListHeaderComponent}
      renderItem={({ item: cell }) => {
        if (cell.type === "add") {
          return (
            <Pressable
              style={(s) => [{ width: itemWidth, marginBottom: 14 }, pressFx(s)]}
              onPress={onAddPress}
              accessibilityRole="button"
              accessibilityLabel="Add series"
            >
              <View style={styles.addTile}>
                <Plus color={colors.muted} size={20} strokeWidth={2} />
                <Text style={styles.addText}>ADD SERIES</Text>
              </View>
            </Pressable>
          );
        }
        const item = cell.item;
        return (
          <Pressable
            style={(s) => [{ width: itemWidth, marginBottom: 14 }, pressFx(s)]}
            onPress={() =>
              onItemPress
                ? onItemPress(item)
                : router.push({
                    pathname: "/series/[src]/[id]",
                    params: {
                      src: item.src,
                      id: item.seriesId,
                      title: item.title,
                      servers: item.servers ? JSON.stringify(item.servers) : undefined,
                    },
                  })
            }
          >
            <View style={styles.coverWrap}>
              {item.coverUrl ? (
                <Image
                  source={{ uri: item.coverUrl }}
                  style={styles.cover}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Text style={styles.coverPlaceholderText}>
                    {item.title.trim()[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              {item.badge ? (
                <View style={[styles.badge, item.badgeTone === "progress" && styles.badgeQuiet]}>
                  <Text
                    style={[
                      styles.badgeText,
                      item.badgeTone === "progress" && styles.badgeQuietText,
                    ]}
                  >
                    {item.badge}
                  </Text>
                </View>
              ) : null}
              {item.progress != null ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(0, Math.min(100, item.progress))}%`,
                        backgroundColor: item.progressColor ?? colors.accent,
                      },
                    ]}
                  />
                </View>
              ) : null}
            </View>
            {item.unread && item.unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>+{item.unread > 99 ? "99" : item.unread}</Text>
              </View>
            ) : null}
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  coverWrap: {
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: { width: "100%", aspectRatio: 0.7 },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107,94,204,0.08)",
  },
  coverPlaceholderText: {
    color: "rgba(107,94,204,0.55)",
    fontSize: 40,
    fontWeight: "900",
  },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: colors.accent,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeQuiet: {
    backgroundColor: "rgba(10,11,16,0.82)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { color: colors.accentText, fontSize: 10, fontWeight: "700" },
  badgeQuietText: { color: colors.muted },
  // Purple "+n" unread badge riding the cover's top-right corner.
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
    zIndex: 2,
  },
  unreadText: { color: "#fff", fontSize: 9.5, fontWeight: "900" },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.bg,
  },
  progressFill: { height: "100%" },
  addTile: {
    width: "100%",
    aspectRatio: 0.7,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addText: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 12, marginTop: 6, lineHeight: 16 },
});
