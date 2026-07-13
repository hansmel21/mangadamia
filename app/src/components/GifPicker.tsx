// Meta-style GIF picker: opens from the composer's GIF key, shows trending
// immediately, searches as you type (debounced), infinite-scrolls, and returns
// the tapped GIF's hosted URL. Search goes through our API proxy
// (/gifs/search) so the provider key stays server-side and the content rating
// is pinned there. If no key is configured the sheet explains instead.
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { Search, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type GifResult } from "../api";
import { colors, fonts } from "../theme";

export function GifPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce typing → query so we don't hammer the provider per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  // Fresh sheet every open.
  useEffect(() => {
    if (visible) {
      setInput("");
      setQuery("");
    }
  }, [visible]);

  const search = useInfiniteQuery({
    queryKey: ["gifSearch", query],
    queryFn: ({ pageParam }) => api.searchGifs(query, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: visible,
    staleTime: 60_000,
  });

  const configured = search.data?.pages[0]?.configured ?? true;
  const gifs = search.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>SELECT GIF</Text>
          <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Close GIF picker">
            <X color={colors.text} size={22} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Search color={colors.muted} size={16} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            value={input}
            onChangeText={setInput}
            placeholder="Search GIFs…"
            placeholderTextColor={colors.muted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {input ? (
            <Pressable hitSlop={8} onPress={() => setInput("")} accessibilityLabel="Clear search">
              <X color={colors.muted} size={16} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {!configured ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>GIF SEARCH OFFLINE</Text>
            <Text style={styles.noticeBody}>
              The server has no GIF provider key yet. Add GIPHY_API_KEY or TENOR_API_KEY to the
              API's .env and restart it.
            </Text>
          </View>
        ) : search.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
        ) : search.isError ? (
          <View style={styles.notice}>
            <Text style={styles.noticeBody}>{(search.error as Error).message}</Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 16 }}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.6}
            onEndReached={() => {
              if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query ? "Nothing for that search." : "No GIFs right now."}
              </Text>
            }
            ListFooterComponent={
              search.isFetchingNextPage ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 14 }} />
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.cell}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                accessibilityRole="imagebutton"
                accessibilityLabel="Attach this GIF"
              >
                <ExpoImage
                  source={{ uri: item.previewUrl }}
                  style={[styles.gif, { aspectRatio: Math.max(0.6, item.width / item.height) }]}
                  contentFit="cover"
                  transition={100}
                />
              </Pressable>
            )}
          />
        )}
        <Text style={styles.attribution}>
          {search.data?.pages[0]?.provider === "tenor" ? "Via Tenor" : "Powered by GIPHY"}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 16, letterSpacing: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.4)",
    borderRadius: 3,
    backgroundColor: colors.card,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  cell: { flex: 1, borderRadius: 3, overflow: "hidden", backgroundColor: colors.card },
  gif: { width: "100%" },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
  notice: { alignItems: "center", gap: 8, marginTop: 48, paddingHorizontal: 32 },
  noticeTitle: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  noticeBody: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  attribution: {
    color: colors.muted,
    fontSize: 9,
    textAlign: "center",
    paddingVertical: 6,
    letterSpacing: 0.5,
  },
});
