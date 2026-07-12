// Compact embed of a quoted post, shown inside a quote-repost. Tap to open the
// original thread.
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { QuotedPostInfo } from "../api";
import { POST_KINDS } from "../ranks";
import { colors } from "../theme";
import { LinkedText } from "./LinkedText";
import { UserIdentity } from "./UserIdentity";

export function QuotedPost({ quoted }: { quoted: QuotedPostInfo }) {
  const kindMeta = POST_KINDS[quoted.kind] ?? POST_KINDS.record;
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: quoted.id } })}
      accessibilityRole="button"
      accessibilityLabel="Open quoted post"
    >
      <View style={styles.head}>
        {quoted.author ? (
          <UserIdentity identity={quoted.author} compact />
        ) : (
          <Text style={styles.removed}>Removed Reader</Text>
        )}
        {quoted.kind !== "record" ? (
          <Text style={[styles.kind, { color: kindMeta.color }]}>
            {kindMeta.icon} {kindMeta.label}
          </Text>
        ) : null}
      </View>
      <LinkedText style={styles.body} numberOfLines={5}>
        {quoted.isSpoiler ? "⚠ Spoiler — tap to view" : quoted.body}
      </LinkedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 6,
  },
  pressed: { borderColor: "rgba(124,92,255,0.5)", opacity: 0.95 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kind: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  removed: { color: colors.muted, fontSize: 13, fontStyle: "italic" },
  body: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
});
