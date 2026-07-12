// QUEST LOG — System Protocol layout: bracketed title + live reset countdown,
// cadence chips filtering the list client-side, gold CLAIMED cards for done
// quests, corner-ticked active cards with a GO ▸ deep link, and rarity-tinted
// seasonal/epic cards. Detail modal stays on SystemModal.
import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type QuestInfo, type RewardInfo } from "../src/api";
import { SystemKey, ScreenTitle } from "../src/components/SystemUI";
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

type CadenceFilter = "all" | "daily" | "weekly" | "seasonal" | "permanent";

// Until the server ships a per-quest deepLink, route by what the quest asks:
// social objectives point at the Dungeon, reading objectives at Home.
function questRoute(q: QuestInfo): { label: string; path: string } | null {
  if (q.completedAt) return null;
  const text = `${q.name} ${q.description}`.toLowerCase();
  if (/comment|post|record|react|reply|like|endorse/.test(text)) {
    return { label: "GO TO DUNGEON ▸", path: "/feed" };
  }
  if (/read|chapter|series|finish/.test(text)) {
    return { label: "GO READ ▸", path: "/" };
  }
  return null;
}

function RewardChip({ reward }: { reward: RewardInfo }) {
  const tone = rarityColors[normalizeRarity(reward.rarity)];
  return (
    <Text style={[styles.reward, { color: tone.text, borderColor: tone.main }]}>{reward.name}</Text>
  );
}

// Live HH:MM:SS until the soonest reset among incomplete quests.
function useResetCountdown(quests: QuestInfo[] | undefined): string | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const next = (quests ?? [])
    .filter((q) => q.resetsAt && !q.completedAt)
    .map((q) => new Date(q.resetsAt as string).getTime())
    .filter((t) => t > now)
    .sort((a, b) => a - b)[0];
  if (!next) return null;
  const s = Math.floor((next - now) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
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
  const [filter, setFilter] = useState<CadenceFilter>("all");
  const countdown = useResetCountdown(quests.data);

  const all = quests.data ?? [];
  const dailies = all.filter((q) => q.cadence === "daily");
  const dailiesDone = dailies.filter((q) => !!q.completedAt).length;
  const list =
    filter === "all"
      ? all
      : all.filter((q) => (filter === "permanent" ? q.cadence === "permanent" || q.cadence === "hidden" : q.cadence === filter));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle tone="foil">QUEST LOG</ScreenTitle>
        {countdown ? <Text style={styles.countdown}>RESET {countdown}</Text> : null}
      </View>

      <View style={styles.chips}>
        <SystemKey variant="chip" label="ALL" active={filter === "all"} onPress={() => setFilter("all")} />
        <SystemKey
          variant="chip"
          label={dailies.length > 0 ? `DAILY ${dailiesDone}/${dailies.length}` : "DAILY"}
          active={filter === "daily"}
          onPress={() => setFilter("daily")}
        />
        <SystemKey variant="chip" label="WEEKLY" active={filter === "weekly"} onPress={() => setFilter("weekly")} />
        <SystemKey variant="chip" label="SEASON" active={filter === "seasonal"} onPress={() => setFilter("seasonal")} />
        <SystemKey
          variant="chip"
          label="MILESTONE"
          active={filter === "permanent"}
          onPress={() => setFilter("permanent")}
        />
      </View>

      {quests.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {list.map((quest) => (
            <QuestCard key={quest.id} quest={quest} onPress={() => setSelected(quest)} />
          ))}
          {list.length === 0 ? (
            <Text style={styles.empty}>No quests in this log yet.</Text>
          ) : null}
        </ScrollView>
      )}
      <QuestDetailModal quest={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function QuestCard({ quest, onPress }: { quest: QuestInfo; onPress: () => void }) {
  const done = !!quest.completedAt;
  const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  const route = questRoute(quest);
  // Seasonal/epic quests carry a rarity tint from their best reward.
  const bestRarity = quest.rewards
    .map((r) => normalizeRarity(r.rarity))
    .sort((a, b) => ["common", "rare", "epic", "legendary"].indexOf(b) - ["common", "rare", "epic", "legendary"].indexOf(a))[0];
  const tinted = quest.cadence === "seasonal" || bestRarity === "epic" || bestRarity === "legendary";
  const tintTone = bestRarity ? rarityColors[bestRarity] : undefined;
  const xpReward = quest.rewards.find((r) => r.type === "xp");

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        done && styles.cardDone,
        tinted && !done && tintTone && { borderColor: tintTone.main + "80", backgroundColor: tintTone.main + "0F" },
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${quest.name} quest details`}
    >
      {!done ? (
        <>
          <View style={[styles.cardTick, styles.cardTickTL]} pointerEvents="none" />
          <View style={[styles.cardTick, styles.cardTickBR]} pointerEvents="none" />
        </>
      ) : null}
      <View style={styles.heading}>
        <Text style={[styles.cadence, tinted && !done && tintTone && { color: tintTone.text }]}>
          {quest.cadence === "permanent" ? "MILESTONE" : quest.cadence.toUpperCase()}
          {tinted && !done ? " · EPIC REWARD" : ""}
        </Text>
        <Text style={[styles.state, done && { color: colors.foil }]}>
          {done ? `CLAIMED${xpReward ? ` ${xpReward.name.toUpperCase()}` : ""}` : resetLabel(quest)?.toUpperCase() ?? ""}
        </Text>
      </View>
      <Text style={[styles.name, done && styles.nameDone]}>{quest.name}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {quest.description}
      </Text>
      {!done ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      ) : null}
      <View style={styles.rewards}>
        {!done ? (
          <Text style={styles.progressNums}>
            {Math.min(quest.progress, quest.target)} / {quest.target}
          </Text>
        ) : null}
        {quest.rewards.map((reward, index) => (
          <RewardChip key={`${reward.type}-${reward.id ?? index}`} reward={reward} />
        ))}
        {route ? (
          <Pressable
            style={({ pressed }) => [styles.goKey, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(route.path as never)}
            hitSlop={6}
          >
            <Text style={styles.goKeyText}>{route.label}</Text>
          </Pressable>
        ) : (
          <Text style={styles.detailsHint}>DETAILS ▸</Text>
        )}
      </View>
    </Pressable>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  countdown: {
    marginLeft: "auto",
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  chips: { flexDirection: "row", gap: 4, paddingHorizontal: 16, marginTop: 10 },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, lineHeight: 22 },
  card: {
    position: "relative",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 3,
    padding: 14,
  },
  cardPressed: { opacity: 0.92 },
  cardDone: { borderColor: "rgba(245,184,76,0.5)", backgroundColor: "rgba(245,184,76,0.05)" },
  cardTick: { position: "absolute", width: 9, height: 9, borderColor: colors.accentBright },
  cardTickTL: { top: -1.5, left: -1.5, borderTopWidth: 2, borderLeftWidth: 2 },
  cardTickBR: { bottom: -1.5, right: -1.5, borderBottomWidth: 2, borderRightWidth: 2 },
  heading: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cadence: { color: colors.accentSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  state: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  name: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 7 },
  nameDone: { textDecorationLine: "line-through", opacity: 0.7 },
  description: { color: colors.muted, fontSize: 11.5, marginTop: 3, lineHeight: 16 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 10, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent },
  progressNums: { color: colors.accentBright, fontSize: 11, fontWeight: "900" },
  rewards: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" },
  reward: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 2,
    fontSize: 9,
    fontWeight: "800",
  },
  goKey: {
    marginLeft: "auto",
    backgroundColor: "rgba(124,92,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.55)",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  goKeyText: { color: colors.accentBright, fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
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
    borderRadius: 3,
    paddingVertical: 9,
    paddingHorizontal: 32,
  },
  modalCloseText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
});
