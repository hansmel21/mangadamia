import { StyleSheet, Text, View } from "react-native";
import type { PublicIdentity } from "../api";
import { normalizeRarity, rarityColors } from "../rarity";
import { colors } from "../theme";

export function ReaderAvatar({ identity, size = 36 }: { identity: PublicIdentity; size?: number }) {
  const avatarRarity = normalizeRarity(identity.avatar?.rarity);
  const frameRarity = normalizeRarity(identity.frame?.rarity);
  const avatarTone = rarityColors[avatarRarity];
  const frameTone = rarityColors[frameRarity];
  const initial = identity.username[0]?.toUpperCase() ?? "?";
  const hasFrame = !!identity.frame;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: hasFrame ? frameTone.main : "transparent",
          shadowColor: hasFrame ? frameTone.main : "transparent",
        },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            borderRadius: size / 2,
            backgroundColor: identity.avatar?.primaryColor ?? avatarTone.main ?? colors.accent,
          },
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
      </View>
      {identity.frame?.assetKey === "crown" ? (
        <Text style={[styles.crown, { fontSize: size * 0.34, top: -size * 0.25 }]}>♛</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2,
    padding: 2,
    shadowOpacity: 0.65,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  avatar: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { color: "#0B0B11", fontWeight: "900" },
  crown: { position: "absolute", alignSelf: "center", color: "#FFE09A", fontWeight: "900" },
});
