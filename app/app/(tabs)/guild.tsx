// GUILD tab — the Hall IS the tab (owner request): members land straight on
// the full Hall — banner, quick keys (BOARD · EVENTS · MEMBERS · MANAGE),
// Guild Status, Vanguard, Perk Track, board preview, leave. Guildless hunters
// get a recruit window. Wars/raids/weekly events nest under EVENTS; the
// roster lives on the MEMBERS screen (guild/[id]?tab=members).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MessageSquare, Settings2, Swords, Users } from "lucide-react-native";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { api, type GuildDetail, type GuildMemberInfo } from "../../src/api";
import { GUILD_DECOR, GuildEmblem } from "../../src/components/GuildCrest";
import { HunterAvatar } from "../../src/components/HunterAvatar";
import { SystemModal } from "../../src/components/SystemModal";
import { ScreenTitle, SystemKey, SystemPanel, SystemProgress } from "../../src/components/SystemUI";
import { SystemWindow } from "../../src/components/SystemWindow";
import { UserIdentity } from "../../src/components/UserIdentity";
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
  const queryClient = useQueryClient();
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

  // Which hall section's detail readout is open (tap a window to expand it,
  // same pattern as the Status tab's stat grid).
  const [infoModal, setInfoModal] = useState<"status" | "vanguard" | "perks" | null>(null);

  const g = detail.data;
  const xpPct =
    g && g.xpForNextLevel > g.xpFloor
      ? ((g.xp - g.xpFloor) / (g.xpForNextLevel - g.xpFloor)) * 100
      : 0;

  const leave = () => {
    if (!g) return;
    Alert.alert(
      "Leave guild",
      g.myRole === "guildmaster"
        ? "You'll pass leadership to the next member. Leave this guild?"
        : "Leave this guild?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await api.leaveGuild(g.id);
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["myGuild"] }),
                queryClient.invalidateQueries({ queryKey: ["guild", g.id] }),
                queryClient.invalidateQueries({ queryKey: ["guilds"] }),
              ]);
            } catch (e) {
              Alert.alert("Guild", (e as Error).message);
            }
          },
        },
      ],
    );
  };

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
          {/* banner — this tab IS the Hall now, so the banner is just the crest */}
          <View
            style={[
              styles.banner,
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
          </View>

          {/* quick keys — one job each */}
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
            <QuickKey
              icon={<Users color={colors.accentBright} size={18} strokeWidth={2} />}
              label="MEMBERS"
              onPress={() =>
                router.push({ pathname: "/guild/[id]", params: { id: g.id, tab: "members" } })
              }
            />
            {g.myRole === "guildmaster" || g.myRole === "officer" ? (
              <QuickKey
                icon={<Settings2 color={colors.accentBright} size={18} strokeWidth={2} />}
                label="MANAGE"
                onPress={() => router.push({ pathname: "/guild/edit/[id]", params: { id: g.id } })}
              />
            ) : null}
          </View>

          {/* Hall content, straight on the tab (owner request). Each window
              opens its full readout on tap, like the Status tab's stat grid. */}
          <HallSection onPress={() => setInfoModal("status")} label="Open the full guild status">
            <SystemWindow title="Guild Status" dim>
              <Text style={styles.moreHint}>▸</Text>
              <View style={styles.levelRow}>
                <Text style={styles.levelText}>LV. {g.level}</Text>
                <Text style={styles.powerText}>⚔ POWER {g.power}</Text>
              </View>
              <Text style={styles.xpLabel}>
                {g.xp - g.xpFloor} / {g.xpForNextLevel - g.xpFloor} GXP to LV {g.level + 1}
              </Text>
              <View style={styles.statRow}>
                <Stat value={`${g.memberCount}/${g.memberCap}`} label="Members" />
                <Stat value={String(g.onlineCount)} label="Online" />
                <Stat value={String(g.xp)} label="Total GXP" />
              </View>
            </SystemWindow>
          </HallSection>

          {g.members.some((m) => m.weeklyXp > 0 && m.identity) ? (
            <HallSection onPress={() => setInfoModal("vanguard")} label="Open the weekly standings">
              <WeeklyVanguard members={g.members} />
            </HallSection>
          ) : null}

          <HallSection onPress={() => setInfoModal("perks")} label="Open the perk details">
            <SystemWindow title="Perk Track" dim>
              <Text style={styles.moreHint}>▸</Text>
              <View style={{ gap: 9 }}>
                {g.perks.map((p) => (
                  <View key={p.key} style={styles.perkRow}>
                    <Text style={[styles.perkLevel, !p.unlocked && { color: colors.muted }]}>
                      LV {p.level}
                    </Text>
                    <Text style={[styles.perkLabel, !p.unlocked && { color: colors.muted }]}>
                      {p.label}
                    </Text>
                    <Text style={[styles.perkState, p.unlocked && { color: colors.fresh }]}>
                      {p.unlocked ? "✓" : "🔒"}
                    </Text>
                  </View>
                ))}
              </View>
            </SystemWindow>
          </HallSection>

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

          <Pressable style={styles.leaveBtn} onPress={leave}>
            <Text style={styles.leaveText}>LEAVE GUILD</Text>
          </Pressable>
        </ScrollView>
      )}

      {g ? (
        <>
          <GuildStatusModal guild={g} open={infoModal === "status"} onClose={() => setInfoModal(null)} />
          <VanguardModal guild={g} open={infoModal === "vanguard"} onClose={() => setInfoModal(null)} />
          <PerkModal guild={g} open={infoModal === "perks"} onClose={() => setInfoModal(null)} />
        </>
      ) : null}
    </View>
  );
}

// A tappable hall window — opens its full detail modal, like the Status grid.
function HallSection({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

// Full guild readout — every number behind the Guild Status window.
function GuildStatusModal({
  guild,
  open,
  onClose,
}: {
  guild: GuildDetail;
  open: boolean;
  onClose: () => void;
}) {
  const guildmaster = guild.members.find((m) => m.role === "guildmaster");
  const officers = guild.members.filter((m) => m.role === "officer").length;
  const decor = guild.decorationKey ? (GUILD_DECOR[guild.decorationKey] ?? null) : null;
  const weeklyTotal = guild.members.reduce((n, m) => n + m.weeklyXp, 0);
  const rows: [string, string, boolean?][] = [
    ["Level", `LV. ${guild.level}`, true],
    ["Total GXP", `${guild.xp.toLocaleString()}`],
    ["Next level", `${Math.max(0, guild.xpForNextLevel - guild.xp).toLocaleString()} GXP to go`],
    ["Power", `⚔ ${guild.power.toLocaleString()}`, true],
    ["This week", `${weeklyTotal.toLocaleString()} GXP`],
    ["Members", `${guild.memberCount} / ${guild.memberCap}`],
    ["Online now", `${guild.onlineCount}`],
    ["Officers", `${officers}`],
    ["Guildmaster", guildmaster?.identity ? `@${guildmaster.identity.username}` : "—", true],
    ["Join policy", guild.joinPolicy.toUpperCase()],
    ...(decor ? ([["Hall decoration", `${decor.icon} ${decor.name}`]] as [string, string][]) : []),
    ...(guild.myRole ? ([["Your role", roleName(guild.myRole)]] as [string, string][]) : []),
  ];
  return (
    <SystemModal visible={open} onClose={onClose} title="Guild Status">
      <Text style={styles.modalGuildName}>
        {guild.name} <Text style={{ color: guild.primaryColor }}>[{guild.tag}]</Text>
      </Text>
      {guild.motto ? <Text style={styles.modalMotto}>“{guild.motto}”</Text> : null}
      {rows.map(([label, value, foil]) => (
        <View key={label} style={styles.statLine}>
          <Text style={styles.statLineLabel}>{label}</Text>
          <Text style={[styles.statLineValue, foil && { color: colors.foil }]}>{value}</Text>
        </View>
      ))}
      <ModalCloseKey onClose={onClose} />
    </SystemModal>
  );
}

// Full weekly standings — the Vanguard card only shows the top 3.
function VanguardModal({
  guild,
  open,
  onClose,
}: {
  guild: GuildDetail;
  open: boolean;
  onClose: () => void;
}) {
  const ranked = [...guild.members]
    .filter((m) => m.identity)
    .sort((a, b) => b.weeklyXp - a.weeklyXp || b.contributionXp - a.contributionXp);
  return (
    <SystemModal visible={open} onClose={onClose} title="Weekly Standings">
      <Text style={styles.modalSub}>
        Every member's contribution this week — reads, records, and reactions all feed the guild.
      </Text>
      {ranked.map((m, i) => (
        <View key={m.identity!.id ?? i} style={styles.vanguardRow}>
          <Text style={[styles.vanguardRank, i === 0 && m.weeklyXp > 0 && { color: colors.foil }]}>
            {i + 1}
          </Text>
          <View style={{ flex: 1 }}>
            <UserIdentity identity={m.identity!} compact />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.vanguardXp, m.weeklyXp > 0 && { color: colors.text }]}>
              {m.weeklyXp} GXP
            </Text>
            <Text style={styles.vanguardAllTime}>{m.contributionXp} all-time</Text>
          </View>
        </View>
      ))}
      <ModalCloseKey onClose={onClose} />
    </SystemModal>
  );
}

// Perk + decoration catalog with unlock levels.
function PerkModal({
  guild,
  open,
  onClose,
}: {
  guild: GuildDetail;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <SystemModal visible={open} onClose={onClose} title="Perk Track">
      <Text style={styles.modalSub}>
        Guild level is fed by member contribution and never drops. Each level milestone unlocks a
        perk; hall decorations unlock alongside them.
      </Text>
      {guild.perks.map((p) => (
        <View key={p.key} style={styles.statLine}>
          <Text style={[styles.perkLevel, !p.unlocked && { color: colors.muted }]}>LV {p.level}</Text>
          <Text style={[styles.perkLabel, !p.unlocked && { color: colors.muted }]}>{p.label}</Text>
          <Text style={[styles.perkState, p.unlocked && { color: colors.fresh }]}>
            {p.unlocked ? "✓" : "🔒"}
          </Text>
        </View>
      ))}
      <Text style={styles.modalSection}>HALL DECORATIONS</Text>
      {guild.decorations.map((d) => {
        const decor = GUILD_DECOR[d.key];
        return (
          <View key={d.key} style={styles.statLine}>
            <Text style={[styles.perkLevel, !d.unlocked && { color: colors.muted }]}>
              LV {d.minLevel}
            </Text>
            <Text style={[styles.perkLabel, !d.unlocked && { color: colors.muted }]}>
              {decor ? `${decor.icon} ` : ""}
              {d.name}
            </Text>
            <Text style={[styles.perkState, d.unlocked && { color: colors.fresh }]}>
              {d.unlocked ? "✓" : "🔒"}
            </Text>
          </View>
        );
      })}
      <ModalCloseKey onClose={onClose} />
    </SystemModal>
  );
}

function ModalCloseKey({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        style={(s) => [styles.modalClose, { opacity: s.pressed ? 0.6 : 1 }]}
        onPress={onClose}
        hitSlop={8}
      >
        <Text style={styles.modalCloseText}>CLOSE</Text>
      </Pressable>
    </View>
  );
}

function roleName(role: string): string {
  return role === "guildmaster" ? "GUILDMASTER" : role.toUpperCase();
}

// This week's top-3 contributors (same card as the Hall screen).
function WeeklyVanguard({ members }: { members: GuildMemberInfo[] }) {
  const leaders = [...members]
    .filter((m) => m.weeklyXp > 0 && m.identity)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .slice(0, 3);
  if (leaders.length === 0) return null;
  return (
    <SystemWindow title="This Week's Vanguard" dim>
      <Text style={styles.moreHint}>▸</Text>
      <View style={{ gap: 10 }}>
        {leaders.map((m, i) => (
          <View key={m.identity!.id ?? i} style={styles.vanguardRow}>
            <Text style={[styles.vanguardRank, i === 0 && { color: colors.foil }]}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <UserIdentity identity={m.identity!} compact />
            </View>
            <Text style={styles.vanguardXp}>{m.weeklyXp} GXP</Text>
          </View>
        ))}
      </View>
    </SystemWindow>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
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
  levelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  levelText: { color: colors.foil, fontFamily: fonts.display, fontSize: 18 },
  powerText: { color: colors.accentSoft, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  xpLabel: { color: colors.muted, fontSize: 11, marginTop: 6, fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 14 },
  stat: { alignItems: "center" },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkLevel: { color: colors.foil, fontSize: 10, fontWeight: "900", width: 36 },
  perkLabel: { color: colors.text, fontSize: 12.5, flex: 1, lineHeight: 17 },
  perkState: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  vanguardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  vanguardRank: {
    color: colors.accentSoft,
    fontFamily: fonts.display,
    fontSize: 16,
    width: 18,
    textAlign: "center",
  },
  vanguardXp: { color: colors.muted, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  vanguardAllTime: { color: colors.muted, fontSize: 9, fontVariant: ["tabular-nums"] },
  moreHint: {
    position: "absolute",
    top: 14,
    right: 14,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  modalGuildName: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 19,
    textAlign: "center",
    marginBottom: 2,
  },
  modalMotto: { color: colors.muted, fontSize: 12, textAlign: "center", marginBottom: 8 },
  modalSub: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginBottom: 10 },
  modalSection: {
    color: colors.accentSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: 12,
    marginBottom: 4,
  },
  statLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(28,32,41,0.6)",
  },
  statLineLabel: { color: colors.muted, fontSize: 12 },
  statLineValue: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
  modalClose: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 4,
    paddingHorizontal: 26,
    paddingVertical: 9,
  },
  modalCloseText: { color: colors.accentSoft, fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  leaveBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(206,81,83,0.5)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  leaveText: { color: colors.danger, fontWeight: "900", fontSize: 12, letterSpacing: 1.4 },
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
