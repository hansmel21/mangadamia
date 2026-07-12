// GUILD tab — the Hall home base (System Protocol §6). Guildless hunters get
// a recruit window; members get the banner, this week's WAR window (scores
// derived from weekly contribution), the shared RAID card, quick keys, and a
// board preview. Roster + management live on the pushed Hall screen.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { MessageSquare, Settings2, Users } from "lucide-react-native";
import { useState, useSyncExternalStore, type ReactNode } from "react";
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
import { api, type GuildWarInfo } from "../../src/api";
import { GuildEmblem } from "../../src/components/GuildCrest";
import { HunterAvatar } from "../../src/components/HunterAvatar";
import { ScreenTitle, SystemKey, SystemPanel, SystemProgress } from "../../src/components/SystemUI";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

function endsIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "NOW";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}D ${h}H` : `${h}H ${Math.floor((ms % 3_600_000) / 60_000)}M`;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function GuildTab() {
  const insets = useSafeAreaInsets();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const mine = useQuery({ queryKey: ["myGuild"], queryFn: api.myGuild, enabled: !!user });
  const myGuildId = mine.data?.guildId ?? null;
  const detail = useQuery({
    queryKey: ["guild", myGuildId],
    queryFn: () => api.guild(myGuildId as string),
    enabled: !!myGuildId,
  });
  const war = useQuery({
    queryKey: ["guildWar", myGuildId],
    queryFn: () => api.guildWar(myGuildId as string),
    enabled: !!myGuildId,
    refetchInterval: 120_000,
  });
  const raid = useQuery({
    queryKey: ["guildRaid", myGuildId],
    queryFn: () => api.guildRaid(myGuildId as string),
    enabled: !!myGuildId,
  });
  const board = useQuery({
    queryKey: ["guildBoard", myGuildId, 1],
    queryFn: () => api.guildBoard(myGuildId as string, 1),
    enabled: !!myGuildId,
  });

  const g = detail.data;
  const xpPct =
    g && g.xpForNextLevel > g.xpFloor
      ? ((g.xp - g.xpFloor) / (g.xpForNextLevel - g.xpFloor)) * 100
      : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <ScreenTitle tone="danger">GUILD</ScreenTitle>
      </View>

      {!user ? (
        <Centered>
          <Text style={styles.dim}>Sign in from the Status tab to join a guild.</Text>
        </Centered>
      ) : mine.isLoading || (myGuildId && detail.isLoading) ? (
        <Centered>
          <ActivityIndicator color={colors.accent} />
        </Centered>
      ) : !myGuildId || !g ? (
        // ── Guildless recruit window ──
        <ScrollView contentContainerStyle={styles.body}>
          <SystemPanel style={styles.recruit}>
            <Text style={styles.recruitEyebrow}>! UNAFFILIATED HUNTER DETECTED</Text>
            <Text style={styles.recruitTitle}>
              Join a guild to fight in weekly wars, share raids, and earn together.
            </Text>
            <Text style={styles.recruitSub}>Guild members read and post as one banner.</Text>
            <View style={styles.recruitKeys}>
              <SystemKey label="FOUND A GUILD" onPress={() => router.push("/guild/create")} style={styles.grow} />
              <SystemKey
                label="BROWSE GUILDS"
                variant="outline"
                arrow
                onPress={() => router.push("/guilds")}
                style={styles.grow}
              />
            </View>
          </SystemPanel>
        </ScrollView>
      ) : (
        // ── Guild Hall home base ──
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl
              refreshing={detail.isRefetching || war.isRefetching || raid.isRefetching}
              onRefresh={() => {
                void detail.refetch();
                void war.refetch();
                void raid.refetch();
                void board.refetch();
              }}
              tintColor={colors.muted}
            />
          }
        >
          {/* banner */}
          <View style={styles.banner}>
            <GuildEmblem
              emblemKey={g.emblemKey}
              primaryColor={g.primaryColor}
              secondaryColor={g.secondaryColor}
              size={64}
            />
            <View style={styles.bannerBody}>
              <View style={styles.bannerNameLine}>
                <Text style={styles.bannerName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={[styles.bannerTag, { color: g.primaryColor }]}>[{g.tag}]</Text>
              </View>
              <View style={styles.bannerStats}>
                <Text style={styles.bannerLevel}>LV {g.level}</Text>
                <Text style={styles.bannerPower}>⚔ {g.power.toLocaleString()}</Text>
                <View style={styles.onlineRow}>
                  <Users color={colors.muted} size={12} strokeWidth={2} />
                  <Text style={styles.onlineText}>
                    {g.memberCount}/{g.memberCap}
                  </Text>
                </View>
              </View>
              <View style={styles.bannerBar}>
                <SystemProgress value={xpPct} height={5} />
              </View>
            </View>
          </View>

          {/* war window */}
          <WarWindow guildId={myGuildId} war={war.data?.war ?? null} loading={war.isLoading} />

          {/* quick keys */}
          <View style={styles.quickKeys}>
            <QuickKey
              icon={<MessageSquare color={colors.accentBright} size={18} strokeWidth={2} />}
              label="BOARD"
              onPress={() => router.push({ pathname: "/guild/board/[id]", params: { id: g.id } })}
            />
            <QuickKey
              icon={<Users color={colors.accentBright} size={18} strokeWidth={2} />}
              label="ROSTER"
              onPress={() => openHall(g.id)}
            />
            {g.myRole === "guildmaster" || g.myRole === "officer" ? (
              <QuickKey
                icon={<Settings2 color={colors.accentBright} size={18} strokeWidth={2} />}
                label="MANAGE"
                onPress={() => openHall(g.id)}
              />
            ) : null}
          </View>

          {/* raid card */}
          {raid.data ? (
            <View style={styles.raid}>
              <View style={styles.raidHead}>
                <Text style={styles.raidEyebrow}>◆ GUILD RAID · WEEKLY</Text>
                <Text style={styles.raidResets}>
                  {raid.data.completed ? "CLEARED ✓" : `RESETS ${endsIn(raid.data.resetsAt)}`}
                </Text>
              </View>
              <Text style={styles.raidTitle}>
                Clear {raid.data.target} chapters together
              </Text>
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
                  {raid.data.completed ? `+${raid.data.bonusXp} GUILD XP PAID` : `☐ +${raid.data.bonusXp} GUILD XP`}
                </Text>
              </View>
            </View>
          ) : null}

          {/* board preview */}
          <View style={styles.boardBox}>
            <View style={styles.boardHead}>
              <Text style={styles.boardLabel}>GUILD BOARD</Text>
              <Pressable
                hitSlop={8}
                onPress={() => router.push({ pathname: "/guild/board/[id]", params: { id: g.id } })}
              >
                <Text style={styles.boardLink}>POST ▸</Text>
              </Pressable>
            </View>
            {board.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 14 }} />
            ) : (board.data ?? []).length === 0 ? (
              <Text style={styles.boardEmpty}>The board is quiet. Leave the first note.</Text>
            ) : (
              (board.data ?? []).slice(0, 3).map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.boardRow}
                  onPress={() => router.push({ pathname: "/post/[id]", params: { id: p.id } })}
                >
                  {p.author ? <HunterAvatar identity={p.author} size={28} showRank={false} /> : null}
                  <View style={styles.boardRowBody}>
                    <View style={styles.boardRowHead}>
                      <Text style={styles.boardUser} numberOfLines={1}>
                        {p.username}
                      </Text>
                      {p.authorRole === "guildmaster" ? (
                        <Text style={styles.roleGm}>GUILDMASTER</Text>
                      ) : p.authorRole === "officer" ? (
                        <Text style={styles.roleOfficer}>OFFICER</Text>
                      ) : null}
                      <Text style={styles.boardTime}>{timeAgo(p.createdAt)}</Text>
                    </View>
                    <Text style={styles.boardBody} numberOfLines={2}>
                      {p.pinned ? "📌 " : ""}
                      {p.isSpoiler ? "⚠ Spoiler" : p.body}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      )}
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

function openHall(id: string) {
  router.push({ pathname: "/guild/[id]", params: { id } });
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function QuickKey({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.quickKey, pressed && styles.quickKeyPressed]} onPress={onPress}>
      {icon}
      <Text style={styles.quickKeyLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  body: { padding: 16, gap: 12, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dim: { color: colors.muted, textAlign: "center", fontSize: 13, lineHeight: 20 },

  recruit: { padding: 16, gap: 8 },
  recruitEyebrow: { color: colors.foilSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  recruitTitle: { color: colors.text, fontSize: 16, fontWeight: "800", lineHeight: 22 },
  recruitSub: { color: colors.muted, fontSize: 12 },
  recruitKeys: { flexDirection: "row", gap: 8, marginTop: 6 },
  grow: { flex: 1 },

  banner: { flexDirection: "row", alignItems: "center", gap: 12 },
  bannerBody: { flex: 1, gap: 5 },
  bannerNameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  bannerName: { color: colors.text, fontFamily: fonts.display, fontSize: 22, fontWeight: "800", flexShrink: 1 },
  bannerTag: { fontSize: 13, fontWeight: "900" },
  bannerStats: { flexDirection: "row", alignItems: "center", gap: 12 },
  bannerLevel: { color: colors.foil, fontFamily: fonts.displayBold, fontSize: 13, fontWeight: "800" },
  bannerPower: { color: colors.accentSoft, fontSize: 11, fontWeight: "900" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  onlineText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  bannerBar: { maxWidth: 220, marginTop: 2 },

  war: {
    position: "relative",
    backgroundColor: "rgba(13,15,20,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(229,72,77,0.55)",
    borderRadius: 4,
    padding: 14,
    shadowColor: colors.danger,
    shadowOpacity: 0.22,
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
  warRule: { height: 1, backgroundColor: "rgba(229,72,77,0.3)", marginVertical: 11 },
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
    backgroundColor: "rgba(229,72,77,0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(229,72,77,0.6)",
    borderRadius: 3,
  },
  contributeText: { color: "#ff8a8e", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
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

  quickKeys: { flexDirection: "row", gap: 8 },
  quickKey: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 4,
  },
  quickKeyPressed: { backgroundColor: colors.accentGhost },
  quickKeyLabel: { color: colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  raid: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(245,184,76,0.4)",
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

  boardBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
  },
  boardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  boardLabel: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.6 },
  boardLink: { color: colors.data, fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
  boardEmpty: { color: colors.muted, fontSize: 11.5, padding: 14 },
  boardRow: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(28,32,41,0.6)",
  },
  boardRowBody: { flex: 1 },
  boardRowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  boardUser: { color: colors.text, fontSize: 12.5, fontWeight: "800", flexShrink: 1 },
  roleGm: { color: colors.foil, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  roleOfficer: { color: colors.accentBright, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  boardTime: { color: colors.muted, fontSize: 10, marginLeft: "auto" },
  boardBody: { color: colors.mutedStrong, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
});
