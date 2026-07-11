// Reusable 3-column cover grid used by Browse and Library.
import { Image } from "expo-image";
import { router } from "expo-router";
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
  // All sources that carry this series ("servers"), best-first. When absent
  // (e.g. library entries), the series screen falls back to src/seriesId.
  servers?: { src: string; sourceSeriesId: string }[];
}

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
}) {
  const { width } = useWindowDimensions();
  const itemWidth = (width - 16 * 2 - 10 * 2) / 3;

  return (
    <FlatList
      data={items}
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
      keyExtractor={(it) => `${it.src}:${it.seriesId}`}
      contentContainerStyle={[
        styles.container,
        contentTopPadding !== undefined && { paddingTop: contentTopPadding },
      ]}
      columnWrapperStyle={{ gap: 10 }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={ListEmptyComponent}
      ListHeaderComponent={ListHeaderComponent}
      renderItem={({ item }) => (
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
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  coverWrap: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: { width: "100%", aspectRatio: 0.7 },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,92,255,0.08)",
  },
  coverPlaceholderText: {
    color: "rgba(124,92,255,0.55)",
    fontSize: 40,
    fontWeight: "900",
  },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeQuiet: {
    backgroundColor: "rgba(13,15,20,0.82)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { color: colors.accentText, fontSize: 10, fontWeight: "700" },
  badgeQuietText: { color: colors.muted },
  title: { color: colors.text, fontSize: 12, marginTop: 6, lineHeight: 16 },
});
