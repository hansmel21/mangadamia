// GUILD tab — the Hall home base (System Protocol §6). Guildless hunters get
// a recruit window; members get the tappable banner (→ Hall), four quick keys
// (BOARD · EVENTS · INVITE · MANAGE), and a board preview. Wars, raids and
// weekly events nest under the EVENTS screen; roster lives in the Hall.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { MessageSquare, Settings2, Swords, UserPlus, Users } from "lucide-react-native";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePulseGlow } from "../../src/anim";
import { api } from "../../src/api";
import { GUILD_DECOR, GuildEmblem } from "../../src/components/GuildCrest";
import { HunterAvatar } from "../../src/components/HunterAvatar";
import { ScreenTitle, SystemKey, SystemPanel, SystemProgress } from "../../src/components/SystemUI";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

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
              refreshing={detail.isRefetching || board.isRefetching}
              onRefresh={() => {
                void detail.refetch();
                void board.refetch();
              }}
              tintColor={colors.muted}
            />
          }
        >
          {/* banner — tap to open the Hall (roster, perks, invites) */}
          <Pressable
            onPress={() => openHall(g.id)}
            accessibilityRole="button"
            accessibilityLabel="Open the Guild Hall"
            style={({ pressed }) => [
              styles.banner,
              pressed && { opacity: 0.85 },
              g.decorationKey && GUILD_DECOR[g.decorationKey]
                ? {
                    borderWidth: 1.5,
                    borderColor: GUILD_DECOR[g.decorationKey].color + "77",
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: GUILD_DECOR[g.decorationKey].color + "0d",
                  }
                : null,
            ]}
          >
            <GuildEmblem
              emblemKey={g.emblemKey}
              primaryColor={g.primaryColor}
              secondaryColor={g.secondaryColor}
              size={64}
            />
            <View style={styles.bannerBody}>
              <View style={styles.bannerNameLine}>
                {g.decorationKey && GUILD_DECOR[g.decorationKey] ? (
                  <Text style={{ color: GUILD_DECOR[g.decorationKey].color, fontSize: 13, fontWeight: "900" }}>
                    {GUILD_DECOR[g.decorationKey].icon}
                  </Text>
                ) : null}
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
                {g.onlineCount > 0 ? (
                  <View style={styles.onlineRow}>
                    <PulseDot />
                    <Text style={styles.onlineNowText}>{g.onlineCount} ONLINE</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.bannerBar}>
                <SystemProgress value={xpPct} height={5} />
              </View>
            </View>
          </Pressable>

          {/* quick keys — one job each; the banner above opens the Hall */}
          <View style={styles.quickKeys}>
            <QuickKey
              icon={<MessageSquare color={colors.accentBright} size={18} strokeWidth={2} />}
              label="BOARD"
              onPress={() => router.push({ pathname: "/guild/board/[id]", params: { id: g.id } })}
            />
            <QuickKey
              icon={<Swords color={colors.accentBright} size={18} strokeWidth={2} />}
              label="EVENTS"
              onPress={() => router.push({ pathname: "/guild/events/[id]", params: { id: g.id } })}
            />
            {g.myRole === "guildmaster" || g.myRole === "officer" ? (
              <QuickKey
                icon={<UserPlus color={colors.accentBright} size={18} strokeWidth={2} />}
                label="INVITE"
                onPress={() => openHall(g.id)}
              />
            ) : null}
            {g.myRole === "guildmaster" || g.myRole === "officer" ? (
              <QuickKey
                icon={<Settings2 color={colors.accentBright} size={18} strokeWidth={2} />}
                label="MANAGE"
                onPress={() => router.push({ pathname: "/guild/edit/[id]", params: { id: g.id } })}
              />
            ) : null}
          </View>

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

function openHall(id: string) {
  router.push({ pathname: "/guild/[id]", params: { id } });
}

// Breathing green presence dot.
function PulseDot() {
  const pulse = usePulseGlow();
  return <Animated.View style={[styles.onlineDot, pulse]} />;
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
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.fresh },
  onlineNowText: { color: colors.fresh, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  bannerBar: { maxWidth: 220, marginTop: 2 },


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
