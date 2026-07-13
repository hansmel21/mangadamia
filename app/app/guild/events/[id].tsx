// GUILD EVENTS — everything time-boxed lives here, off the main Guild tab:
// this week's WAR window (with history), the shared RAID, and the rotating
// weekly co-op EVENT. One screen to understand "what's running right now".
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type GuildWarInfo } from "../../../src/api";
import { ScreenTitle } from "../../../src/components/SystemUI";
import { colors, fonts } from "../../../src/theme";

function endsIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "NOW";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}D ${h}H` : `${h}H ${Math.floor((ms % 3_600_000) / 60_000)}M`;
}

export default function GuildEventsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const war = useQuery({
    queryKey: ["guildWar", id],
    queryFn: () => api.guildWar(id),
    enabled: !!id,
    refetchInterval: 120_000,
  });
  const raid = useQuery({
    queryKey: ["guildRaid", id],
    queryFn: () => api.guildRaid(id),
    enabled: !!id,
  });
  const event = useQuery({
    queryKey: ["guildEvent", id],
    queryFn: () => api.guildEvent(id),
    enabled: !!id,
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle tone="danger">GUILD EVENTS</ScreenTitle>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={war.isRefetching || raid.isRefetching || event.isRefetching}
            onRefresh={() => {
              void war.refetch();
              void raid.refetch();
              void event.refetch();
            }}
            tintColor={colors.muted}
          />
        }
      >
        {/* war window */}
        <WarWindow guildId={id} war={war.data?.war ?? null} loading={war.isLoading} />

        {/* raid card */}
        {raid.data ? (
          <View style={styles.raid}>
            <View style={styles.raidHead}>
              <Text style={styles.raidEyebrow}>◆ GUILD RAID · WEEKLY</Text>
              <Text style={styles.raidResets}>
                {raid.data.completed ? "CLEARED ✓" : `RESETS ${endsIn(raid.data.resetsAt)}`}
              </Text>
            </View>
            <Text style={styles.raidTitle}>Clear {raid.data.target} chapters together</Text>
            <View style={styles.raidTrack}>
              <View
                style={[
                  styles.raidFill,
                  {
                    width: `${Math.min(100, (raid.data.progress / Math.max(1, raid.data.target)) * 100)}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.raidMeta}>
              <Text style={styles.raidCount}>
                {Math.min(raid.data.progress, raid.data.target)} / {raid.data.target}
                {raid.data.myShare != null ? (
                  <Text>
                    {" "}
                    · your share <Text style={styles.raidShare}>{raid.data.myShare}</Text>
                  </Text>
                ) : null}
              </Text>
              <Text style={styles.raidReward}>
                {raid.data.completed
                  ? `+${raid.data.bonusXp} GUILD XP PAID`
                  : `☐ +${raid.data.bonusXp} GUILD XP`}
              </Text>
            </View>
          </View>
        ) : null}

        {/* weekly event card — the rotating co-op side quest */}
        {event.data ? (
          <View style={styles.eventCard}>
            <View style={styles.raidHead}>
              <Text style={styles.eventEyebrow}>◇ GUILD EVENT · WEEK {event.data.weekNo}</Text>
              <Text style={styles.raidResets}>
                {event.data.completed ? "CLEARED ✓" : `RESETS ${endsIn(event.data.resetsAt)}`}
              </Text>
            </View>
            <Text style={styles.raidTitle}>{event.data.title}</Text>
            <View style={styles.raidTrack}>
              <View
                style={[
                  styles.eventFill,
                  {
                    width: `${Math.min(100, (event.data.progress / Math.max(1, event.data.target)) * 100)}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.raidMeta}>
              <Text style={styles.raidCount}>
                {event.data.progress} / {event.data.target}
                {event.data.myShare != null ? (
                  <Text>
                    {" "}
                    · your share <Text style={styles.eventShare}>{event.data.myShare}</Text>
                  </Text>
                ) : null}
              </Text>
              <Text style={styles.eventReward}>
                {event.data.completed
                  ? `+${event.data.bonusXp} GUILD XP PAID`
                  : `☐ +${event.data.bonusXp} GUILD XP`}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// This week's head-to-head. Red System window; scores are each side's summed
// weekly contribution, so reading/posting is contributing.
function WarWindow({
  guildId,
  war,
  loading,
}: {
  guildId: string;
  war: GuildWarInfo | null;
  loading: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useQuery({
    queryKey: ["guildWars", guildId],
    queryFn: () => api.guildWars(guildId),
    enabled: historyOpen,
  });

  if (loading) {
    return (
      <View style={styles.war}>
        <ActivityIndicator color={colors.danger} style={{ marginVertical: 10 }} />
      </View>
    );
  }
  if (!war) {
    return (
      <View style={styles.warQuiet}>
        <Text style={styles.warQuietText}>
          ⚔ NO RIVAL GATE THIS WEEK — no opposing guild is available yet.
        </Text>
      </View>
    );
  }
  const mine = war.sideA.id === guildId ? war.sideA : war.sideB;
  const theirs = war.sideA.id === guildId ? war.sideB : war.sideA;
  const total = Math.max(1, mine.score + theirs.score);
  const minePct = mine.score + theirs.score === 0 ? 50 : (mine.score / total) * 100;

  return (
    <View style={styles.war}>
      <View style={[styles.warTick, styles.warTickTL]} pointerEvents="none" />
      <View style={[styles.warTick, styles.warTickTR]} pointerEvents="none" />
      <View style={[styles.warTick, styles.warTickBL]} pointerEvents="none" />
      <View style={[styles.warTick, styles.warTickBR]} pointerEvents="none" />
      <Text style={styles.warTitle}>⚔ GUILD WAR · WEEK {war.weekNo}</Text>
      <View style={styles.warRule} />
      <View style={styles.warScores}>
        <View style={styles.warSide}>
          <Text style={styles.warScore}>{mine.score.toLocaleString()}</Text>
          <Text style={[styles.warTag, { color: colors.danger }]}>{mine.tag}</Text>
        </View>
        <View style={styles.warCenter}>
          <View style={styles.warBar}>
            <View style={[styles.warBarMine, { width: `${minePct}%` }]} />
            <View style={styles.warBarGap} />
            <View style={[styles.warBarTheirs, { width: `${100 - minePct}%` }]} />
          </View>
          <Text style={styles.warEnds}>ENDS IN {endsIn(war.endsAt)}</Text>
        </View>
        <View style={styles.warSide}>
          <Text style={styles.warScore}>{theirs.score.toLocaleString()}</Text>
          <Text style={[styles.warTag, { color: colors.info }]}>{theirs.tag}</Text>
        </View>
      </View>
      <View style={styles.warKeys}>
        <Pressable
          style={({ pressed }) => [styles.contributeKey, pressed && { opacity: 0.8 }]}
          onPress={() => router.push("/feed")}
        >
          <Text style={styles.contributeText}>CONTRIBUTE — READ &amp; POST</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.historyKey, pressed && { opacity: 0.7 }]}
          onPress={() => setHistoryOpen((v) => !v)}
        >
          <Text style={styles.historyText}>{historyOpen ? "HIDE" : "HISTORY"}</Text>
        </Pressable>
      </View>
      {historyOpen ? (
        history.isLoading ? (
          <ActivityIndicator color={colors.danger} style={{ marginTop: 10 }} />
        ) : (history.data ?? []).length === 0 ? (
          <Text style={styles.historyEmpty}>No finished wars yet — this is your first campaign.</Text>
        ) : (
          (history.data ?? []).map((w) => (
            <View key={w.id} style={styles.historyRow}>
              <Text
                style={[
                  styles.historyResult,
                  { color: w.result === "won" ? colors.fresh : w.result === "lost" ? colors.danger : colors.muted },
                ]}
              >
                {w.result.toUpperCase()}
              </Text>
              <Text style={styles.historyWeek}>W{w.weekNo}</Text>
              <Text style={styles.historyVs} numberOfLines={1}>
                vs [{w.opponent.tag}] {w.opponent.name}
              </Text>
              <Text style={styles.historyScore}>
                {w.myScore.toLocaleString()} — {w.theirScore.toLocaleString()}
              </Text>
            </View>
          ))
        )
      ) : null}
    </View>
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
  body: { padding: 16, gap: 12, paddingBottom: 48 },

  war: {
    position: "relative",
    backgroundColor: "rgba(13,15,20,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(206,81,83,0.55)",
    borderRadius: 4,
    padding: 14,
    shadowColor: colors.danger,
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  warTick: { position: "absolute", width: 11, height: 11, borderColor: colors.danger },
  warTickTL: { top: -2, left: -2, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  warTickTR: { top: -2, right: -2, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  warTickBL: { bottom: -2, left: -2, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  warTickBR: { bottom: -2, right: -2, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  warTitle: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
    textAlign: "center",
  },
  warRule: { height: 1, backgroundColor: "rgba(206,81,83,0.3)", marginVertical: 11 },
  warScores: { flexDirection: "row", alignItems: "center", gap: 10 },
  warSide: { alignItems: "center" },
  warScore: { color: colors.text, fontFamily: fonts.display, fontSize: 24, fontWeight: "800" },
  warTag: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  warCenter: { flex: 1, gap: 4 },
  warBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bg,
    overflow: "hidden",
    flexDirection: "row",
  },
  warBarMine: { backgroundColor: colors.danger },
  warBarGap: { width: 3 },
  warBarTheirs: { backgroundColor: colors.info },
  warEnds: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  warKeys: { flexDirection: "row", gap: 8, marginTop: 10 },
  contributeKey: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    backgroundColor: "rgba(206,81,83,0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(206,81,83,0.6)",
    borderRadius: 3,
  },
  contributeText: { color: "#e09a9c", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  historyKey: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
  },
  historyText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  historyEmpty: { color: colors.muted, fontSize: 11, marginTop: 10, textAlign: "center" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 },
  historyResult: { fontSize: 9, fontWeight: "900", letterSpacing: 1, width: 38 },
  historyWeek: { color: colors.muted, fontSize: 9.5, fontWeight: "800", width: 30 },
  historyVs: { color: colors.text, fontSize: 11.5, fontWeight: "700", flex: 1 },
  historyScore: { color: colors.muted, fontSize: 10.5, fontVariant: ["tabular-nums"] },
  warQuiet: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 4,
    padding: 12,
  },
  warQuietText: { color: colors.muted, fontSize: 11, lineHeight: 16 },

  raid: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.4)",
    borderRadius: 4,
    padding: 14,
  },
  raidHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  raidEyebrow: { color: colors.foil, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.6 },
  raidResets: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  raidTitle: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 6 },
  raidTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.bg,
    overflow: "hidden",
    marginTop: 8,
  },
  raidFill: { height: "100%", backgroundColor: colors.foil },
  raidMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
  },
  raidCount: { color: colors.muted, fontSize: 10.5 },
  raidShare: { color: colors.foilSoft, fontWeight: "800" },
  raidReward: { color: colors.foilSoft, fontSize: 10, fontWeight: "800" },

  eventCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.4)",
    borderRadius: 4,
    padding: 14,
  },
  eventEyebrow: { color: colors.accentSoft, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.6 },
  eventFill: { height: "100%", backgroundColor: colors.accent },
  eventShare: { color: colors.accentSoft, fontWeight: "800" },
  eventReward: { color: colors.accentSoft, fontSize: 10, fontWeight: "800" },
});
