import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api";
import { normalizeRarity, rarityColors } from "../src/rarity";
import { colors } from "../src/theme";

export default function QuestsScreen() {
  const quests = useQuery({ queryKey: ["quests"], queryFn: api.quests, refetchInterval: 30_000 });
  if (quests.isLoading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Objectives reset on UTC time. Rewards unlock instantly and are never auto-equipped.</Text>
      {(quests.data ?? []).map((quest) => {
        const done = !!quest.completedAt;
        const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
        return (
          <View key={quest.id} style={[styles.card, done && styles.done]}>
            <View style={styles.heading}>
              <Text style={styles.cadence}>{quest.cadence.toUpperCase()}</Text>
              <Text style={[styles.state, done && { color: colors.foil }]}>{done ? "COMPLETE" : `${quest.progress}/${quest.target}`}</Text>
            </View>
            <Text style={styles.name}>{quest.name}</Text>
            <Text style={styles.description}>{quest.description}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            <View style={styles.rewards}>
              {quest.rewards.map((reward, index) => {
                const tone = rarityColors[normalizeRarity(reward.rarity)];
                return <Text key={`${reward.type}-${reward.id ?? index}`} style={[styles.reward, { color: tone.text, borderColor: tone.main }]}>{reward.name}</Text>;
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, gap: 12, paddingBottom: 48 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14 },
  done: { borderColor: "rgba(245,184,76,0.55)", backgroundColor: "rgba(245,184,76,0.06)" },
  heading: { flexDirection: "row", justifyContent: "space-between" },
  cadence: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  state: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  name: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 8 },
  description: { color: colors.muted, fontSize: 12, marginTop: 3 },
  track: { height: 6, backgroundColor: colors.bg, marginTop: 12, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent },
  rewards: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  reward: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, fontSize: 9, fontWeight: "800" },
});
