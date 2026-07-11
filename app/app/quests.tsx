import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type QuestInfo, type RewardInfo } from "../src/api";
import { SystemModal } from "../src/components/SystemModal";
import { normalizeRarity, rarityColors } from "../src/rarity";
import { colors } from "../src/theme";

function resetLabel(quest: QuestInfo): string | null {
  if (!quest.resetsAt) return null;
  const ms = new Date(quest.resetsAt).getTime() - Date.now();
  if (ms <= 0) return "Resets soon";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `Resets in ${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (hours < 24) return `Resets in ${hours}h`;
  return `Resets in ${Math.floor(hours / 24)}d`;
}

const cadenceBlurb: Record<QuestInfo["cadence"], string> = {
  daily: "A daily objective. Progress resets every day at 00:00 UTC.",
  weekly: "A weekly objective. Progress resets every Monday at 00:00 UTC.",
  permanent: "A permanent milestone — complete it once, keep it forever.",
  seasonal: "A limited-time event objective. Finish it before the season ends.",
  hidden: "A hidden objective you've started to uncover.",
};

const rewardKindLabel: Record<RewardInfo["type"], string> = {
  xp: "Experience",
  badge: "Badge",
  title: "Title",
  cosmetic: "Cosmetic",
};

function RewardChip({ reward, index }: { reward: RewardInfo; index: number }) {
  const tone = rarityColors[normalizeRarity(reward.rarity)];
  return (
    <Text
      key={`${reward.type}-${reward.id ?? index}`}
      style={[styles.reward, { color: tone.text, borderColor: tone.main }]}
    >
      {reward.name}
    </Text>
  );
}

export default function QuestsScreen() {
  // Always refetch on open (and every 30s while open) so a quest you just
  // finished never shows stale, pre-completion progress.
  const quests = useQuery({
    queryKey: ["quests"],
    queryFn: api.quests,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState<QuestInfo | null>(null);

  if (quests.isLoading)
    return <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />;

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Objectives reset on UTC time. Tap a quest to see what it asks and what it pays out. Rewards
          unlock instantly and are never auto-equipped.
        </Text>
        {(quests.data ?? []).map((quest) => {
          const done = !!quest.completedAt;
          const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
          return (
            <Pressable
              key={quest.id}
              style={({ pressed }) => [styles.card, done && styles.done, pressed && styles.cardPressed]}
              onPress={() => setSelected(quest)}
              accessibilityRole="button"
              accessibilityLabel={`${quest.name} quest details`}
            >
              <View style={styles.heading}>
                <Text style={styles.cadence}>{quest.cadence.toUpperCase()}</Text>
                <Text style={[styles.state, done && { color: colors.foil }]}>
                  {done ? "COMPLETE" : `${quest.progress}/${quest.target}`}
                </Text>
              </View>
              <Text style={styles.name}>{quest.name}</Text>
              <Text style={styles.description} numberOfLines={2}>
                {quest.description}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }, done && { backgroundColor: colors.foil }]} />
              </View>
              <View style={styles.rewards}>
                {quest.rewards.map((reward, index) => (
                  <RewardChip key={`${reward.type}-${reward.id ?? index}`} reward={reward} index={index} />
                ))}
                <Text style={styles.detailsHint}>DETAILS ›</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <QuestDetailModal quest={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function QuestDetailModal({ quest, onClose }: { quest: QuestInfo | null; onClose: () => void }) {
  // Keep the last quest mounted through the close animation.
  const [current, setCurrent] = useState<QuestInfo | null>(quest);
  useEffect(() => {
    if (quest) setCurrent(quest);
  }, [quest]);
  const q = quest ?? current;
  if (!q) return null;

  const done = !!q.completedAt;
  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
  const resets = resetLabel(q);

  return (
    <SystemModal visible={!!quest} onClose={onClose} title="Quest">
      <Text style={styles.modalCadence}>{q.cadence.toUpperCase()} OBJECTIVE</Text>
      <Text style={styles.modalName}>{q.name}</Text>
      <Text style={styles.modalDesc}>{q.description}</Text>
      <Text style={styles.modalBlurb}>{cadenceBlurb[q.cadence]}</Text>

      <View style={styles.modalProgressRow}>
        <Text style={styles.modalProgressLabel}>{done ? "COMPLETE" : "PROGRESS"}</Text>
        <Text style={styles.modalProgressNums}>
          {Math.min(q.progress, q.target)} / {q.target}
        </Text>
      </View>
      <View style={styles.modalTrack}>
        <View style={[styles.modalFill, { width: `${pct}%` }, done && { backgroundColor: colors.foil }]} />
      </View>
      {resets && !done ? <Text style={styles.modalResets}>{resets}</Text> : null}

      <Text style={styles.modalRewardsTitle}>REWARDS</Text>
      {q.rewards.length > 0 ? (
        <View style={styles.modalRewards}>
          {q.rewards.map((reward, index) => {
            const tone = rarityColors[normalizeRarity(reward.rarity)];
            return (
              <View key={`${reward.type}-${reward.id ?? index}`} style={styles.modalRewardRow}>
                <View style={[styles.rewardDot, { backgroundColor: tone.main }]} />
                <Text style={[styles.modalRewardName, { color: tone.text }]}>{reward.name}</Text>
                <Text style={styles.modalRewardKind}>{rewardKindLabel[reward.type]}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.modalNoReward}>Completion progress only — no unlockable reward.</Text>
      )}

      <View style={{ alignItems: "center" }}>
        <Pressable style={styles.modalClose} onPress={onClose} hitSlop={8}>
          <Text style={styles.modalCloseText}>CLOSE</Text>
        </Pressable>
      </View>
    </SystemModal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, gap: 12, paddingBottom: 48 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  cardPressed: { borderColor: "rgba(124,92,255,0.5)", opacity: 0.95 },
  done: { borderColor: "rgba(245,184,76,0.55)", backgroundColor: "rgba(245,184,76,0.06)" },
  heading: { flexDirection: "row", justifyContent: "space-between" },
  cadence: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  state: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  name: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 8 },
  description: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 12, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent },
  rewards: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" },
  reward: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, fontSize: 9, fontWeight: "800" },
  detailsHint: { marginLeft: "auto", color: colors.accentSoft, fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },

  modalCadence: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  modalName: { color: colors.text, fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 6 },
  modalDesc: { color: colors.text, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 },
  modalBlurb: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 8 },
  modalProgressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18, marginBottom: 6 },
  modalProgressLabel: { color: colors.accentSoft, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  modalProgressNums: { color: colors.text, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  modalTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  modalFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  modalResets: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 6 },
  modalRewardsTitle: { color: colors.accentSoft, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: 20 },
  modalRewards: { marginTop: 10, gap: 10 },
  modalRewardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rewardDot: { width: 10, height: 10, borderRadius: 5 },
  modalRewardName: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  modalRewardKind: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginLeft: "auto" },
  modalNoReward: { color: colors.muted, fontSize: 12, marginTop: 10, lineHeight: 17 },
  modalClose: {
    marginTop: 22,
    borderColor: "rgba(124,92,255,0.55)",
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 32,
  },
  modalCloseText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
});
