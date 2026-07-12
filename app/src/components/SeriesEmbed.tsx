// Richer series embed used inside System Record cards — a tappable cover +
// title + chapter card, instead of the tiny chip that made posts look like
// comments.
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { pressFx } from "../anim";
import { colors } from "../theme";

export function SeriesEmbed({
  canonicalId,
  title,
  coverUrl,
  chapterNumber,
}: {
  canonicalId: string;
  title: string;
  coverUrl?: string | null;
  chapterNumber?: number | null;
}) {
  return (
    <Pressable
      style={(s) => [styles.embed, pressFx(s)]}
      onPress={() =>
        router.push({
          pathname: "/series/[src]/[id]",
          params: { src: "", id: "", title, canonicalOnly: canonicalId },
        })
      }
    >
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverInitial}>{title.trim()[0]?.toUpperCase() ?? "?"}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.label}>SERIES</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {chapterNumber != null ? (
          <Text style={styles.chapter}>Chapter {chapterNumber}</Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  embed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.3)",
  },
  cover: { width: 42, height: 58, borderRadius: 5, backgroundColor: colors.card },
  coverPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(124,92,255,0.1)" },
  coverInitial: { color: "rgba(124,92,255,0.7)", fontSize: 20, fontWeight: "900" },
  body: { flex: 1, gap: 2 },
  label: { color: colors.muted, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 13.5, fontWeight: "800", lineHeight: 18 },
  chapter: { color: colors.accentSoft, fontSize: 11.5, fontWeight: "700" },
  chevron: { color: colors.muted, fontSize: 22, paddingHorizontal: 4 },
});
