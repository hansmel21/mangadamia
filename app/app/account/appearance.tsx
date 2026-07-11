import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { ReaderAvatar } from "../../src/components/ReaderAvatar";
import { UserIdentity } from "../../src/components/UserIdentity";
import { normalizeRarity, rarityColors } from "../../src/rarity";
import { colors } from "../../src/theme";

export default function AppearanceScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (!me.data?.identity) return <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />;
  const equip = async (slot: "avatar" | "frame", id: string | null) => {
    await api.equipCosmetic(slot, id);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.preview}><UserIdentity identity={me.data.identity} profile /></View>
      <Text style={styles.section}>UNLOCKED AVATARS</Text>
      <View style={styles.grid}>
        {me.data.cosmetics.filter((item) => item.kind === "avatar").map((item) => {
          const identity = { ...me.data.identity!, avatar: item };
          const equipped = me.data.equippedAvatarId === item.id;
          return (
            <Pressable key={item.id} style={[styles.card, equipped && styles.equipped]} onPress={() => equip("avatar", item.id)}>
              <ReaderAvatar identity={identity} size={58} />
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.rarity, { color: rarityColors[normalizeRarity(item.rarity)].text }]}>{item.rarity.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.section}>UNLOCKED FRAMES</Text>
      <View style={styles.grid}>
        <Pressable style={[styles.card, !me.data.equippedFrameId && styles.equipped]} onPress={() => equip("frame", null)}>
          <View style={styles.none}><Text style={styles.noneText}>NONE</Text></View>
          <Text style={styles.name}>No frame</Text>
        </Pressable>
        {me.data.cosmetics.filter((item) => item.kind === "frame").map((item) => {
          const identity = { ...me.data.identity!, frame: item };
          const equipped = me.data.equippedFrameId === item.id;
          return (
            <Pressable key={item.id} style={[styles.card, equipped && styles.equipped]} onPress={() => equip("frame", item.id)}>
              <ReaderAvatar identity={identity} size={58} />
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.rarity, { color: rarityColors[normalizeRarity(item.rarity)].text }]}>{item.rarity.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Custom image uploads are intentionally disabled until image moderation is ready.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 48 },
  preview: { alignItems: "center", padding: 18, borderWidth: 1, borderColor: colors.border },
  section: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 24, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "30%", minHeight: 112, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 8 },
  equipped: { borderColor: colors.foil, backgroundColor: "rgba(245,184,76,0.07)" },
  name: { color: colors.text, fontSize: 10, fontWeight: "800", marginTop: 7, textAlign: "center" },
  rarity: { fontSize: 8, fontWeight: "900", marginTop: 3 },
  none: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  noneText: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 24 },
});
