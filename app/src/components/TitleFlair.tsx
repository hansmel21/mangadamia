import { StyleSheet, Text, View } from "react-native";
import type { PublicIdentity } from "../api";
import { normalizeRarity, rarityColors } from "../rarity";

export function TitleFlair({
  title,
  compact = false,
}: {
  title: NonNullable<PublicIdentity["title"]>;
  compact?: boolean;
}) {
  const tone = rarityColors[normalizeRarity(title.rarity)];
  return (
    <View
      style={[
        styles.flair,
        compact && styles.compact,
        { borderColor: tone.main, backgroundColor: tone.soft, shadowColor: tone.main },
      ]}
    >
      <Text style={[styles.text, compact && styles.compactText, { color: tone.text }]} numberOfLines={1}>
        {title.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flair: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    shadowOpacity: 0.13,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  compact: { paddingHorizontal: 5, paddingVertical: 1 },
  text: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  compactText: { fontSize: 8.5, letterSpacing: 0.5 },
});
