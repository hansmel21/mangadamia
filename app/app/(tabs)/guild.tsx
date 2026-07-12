// GUILD tab — promoted from the old HeaderMenu into a first-class command key.
// Guildless hunters get a recruit window; members get the Guild Hall banner +
// quick keys. This is the shell for the full §6 Hall (war / raid / board land
// here once their backends exist — see UI-UX/NOT_YET_IMPLEMENTED.md).
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ClipboardList, MessageSquare, Settings2, Swords, Users } from "lucide-react-native";
import { useSyncExternalStore, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { GuildEmblem } from "../../src/components/GuildCrest";
import { ScreenTitle, SystemKey, SystemPanel, SystemProgress } from "../../src/components/SystemUI";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

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

  const g = detail.data;
  const xpPct = g && g.xpForNextLevel > g.xpFloor
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
            <Text style={styles.recruitTitle}>Join a guild to fight in weekly wars, share raids, and earn together.</Text>
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
        // ── Guild Hall banner + quick keys ──
        <ScrollView contentContainerStyle={styles.body}>
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

          <View style={styles.quickKeys}>
            <QuickKey
              icon={<MessageSquare color={colors.accentBright} size={18} strokeWidth={2} />}
              label="BOARD"
              onPress={() => openHall(g.id)}
            />
            <QuickKey
              icon={<Swords color={colors.accentBright} size={18} strokeWidth={2} />}
              label="RAIDS"
              onPress={() => openHall(g.id)}
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

          <SystemPanel tone="foil" style={styles.pending}>
            <View style={styles.pendingHead}>
              <ClipboardList color={colors.foil} size={14} strokeWidth={2} />
              <Text style={styles.pendingLabel}>WAR · RAID · BOARD</Text>
            </View>
            <Text style={styles.pendingText}>
              Guild wars, shared raids and the guild board are on the roadmap. For now, open the full
              Hall for roster and management.
            </Text>
            <SystemKey label="ENTER FULL HALL" onPress={() => openHall(g.id)} style={styles.hallKey} />
          </SystemPanel>
        </ScrollView>
      )}
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

  pending: { padding: 14, gap: 8 },
  pendingHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  pendingLabel: { color: colors.foilSoft, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.6 },
  pendingText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  hallKey: { marginTop: 4 },
});
