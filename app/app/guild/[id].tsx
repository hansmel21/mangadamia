// Guild Hall (HQ). Two tabs: HALL (emblem, level/XP/power, join/leave) and
// ROSTER (members + officer management, pending join requests).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type GuildDetail, type GuildMemberInfo, type GuildRole } from "../../src/api";
import { GuildEmblem } from "../../src/components/GuildCrest";
import { SystemModal } from "../../src/components/SystemModal";
import { SystemWindow } from "../../src/components/SystemWindow";
import { UserIdentity } from "../../src/components/UserIdentity";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

const roleLabel: Record<GuildRole, string> = {
  guildmaster: "GUILDMASTER",
  officer: "OFFICER",
  member: "MEMBER",
};

export default function GuildHallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"hall" | "roster">("hall");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<GuildMemberInfo | null>(null);

  const guildQ = useQuery({ queryKey: ["guild", id], queryFn: () => api.guild(id), enabled: !!id });
  const guild = guildQ.data;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["guild", id] }),
      queryClient.invalidateQueries({ queryKey: ["myGuild"] }),
      queryClient.invalidateQueries({ queryKey: ["guilds"] }),
    ]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      Alert.alert("Guild", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = () =>
    run(async () => {
      const res = await api.joinGuild(id);
      if (res.status === "requested") Alert.alert("Guild", "Your request was sent to the officers.");
    });

  const leave = () => {
    if (!guild) return;
    Alert.alert(
      "Leave guild",
      guild.myRole === "guildmaster"
        ? "You'll pass leadership to the next member. Leave this guild?"
        : "Leave this guild?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () =>
            run(async () => {
              await api.leaveGuild(id);
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: guild ? guild.name : "Guild" }} />
      {guildQ.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : !guild ? (
        <View style={styles.missing}>
          <Text style={styles.missingText}>This guild no longer exists.</Text>
          <Pressable style={styles.ghostBtn} onPress={() => router.back()}>
            <Text style={styles.ghostText}>GO BACK</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            {(["hall", "roster"] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.tab, tab === t && styles.tabActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === "roster" ? `ROSTER · ${guild.memberCount}` : "HALL"}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "hall" ? (
            <HallTab guild={guild} busy={busy} onJoin={join} onLeave={leave} />
          ) : (
            <RosterTab
              guild={guild}
              meId={user?.id ?? null}
              onManage={setManage}
              onAnswer={(userId, action) =>
                run(async () => {
                  await api.answerGuildRequest(id, userId, action);
                })
              }
            />
          )}
        </>
      )}

      <MemberManageModal
        guild={guild ?? null}
        member={manage}
        onClose={() => setManage(null)}
        onAction={(fn) => {
          setManage(null);
          return run(fn);
        }}
      />
    </View>
  );
}

function HallTab({
  guild,
  busy,
  onJoin,
  onLeave,
}: {
  guild: GuildDetail;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const span = Math.max(1, guild.xpForNextLevel - guild.xpFloor);
  const pct = Math.min(100, Math.max(0, Math.round(((guild.xp - guild.xpFloor) / span) * 100)));
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hallHeader}>
        <GuildEmblem
          emblemKey={guild.emblemKey}
          primaryColor={guild.primaryColor}
          secondaryColor={guild.secondaryColor}
          size={92}
        />
        <View style={styles.hallTitleRow}>
          <Text style={styles.hallName}>{guild.name}</Text>
          <Text style={[styles.hallTag, { color: guild.primaryColor }]}>[{guild.tag}]</Text>
        </View>
        {guild.motto ? <Text style={styles.motto}>“{guild.motto}”</Text> : null}
      </View>

      <SystemWindow title="Guild Status" dim style={{ marginHorizontal: 4 }}>
        <View style={styles.levelRow}>
          <Text style={styles.levelText}>LV. {guild.level}</Text>
          <Text style={styles.powerText}>⚔ POWER {guild.power}</Text>
        </View>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.xpLabel}>
          {guild.xp - guild.xpFloor} / {guild.xpForNextLevel - guild.xpFloor} GXP to LV {guild.level + 1}
        </Text>
        <View style={styles.statRow}>
          <Stat value={`${guild.memberCount}/${guild.memberCap}`} label="Members" />
          <Stat value={String(guild.xp)} label="Total GXP" />
          <Stat value={String(guild.power)} label="Power" />
        </View>
      </SystemWindow>

      {guild.description ? <Text style={styles.description}>{guild.description}</Text> : null}

      <View style={styles.actions}>
        {guild.myRole ? (
          <Pressable style={[styles.leaveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={onLeave}>
            <Text style={styles.leaveText}>LEAVE GUILD</Text>
          </Pressable>
        ) : guild.inAnotherGuild ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>You're already in another guild.</Text>
          </View>
        ) : guild.joinRequestPending ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>Your join request is pending.</Text>
          </View>
        ) : guild.joinPolicy === "invite" ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>This guild is invite-only.</Text>
          </View>
        ) : guild.memberCount >= guild.memberCap ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>This guild is full.</Text>
          </View>
        ) : (
          <Pressable style={[styles.joinBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={onJoin}>
            <Text style={styles.joinText}>
              {guild.joinPolicy === "request" ? "REQUEST TO JOIN" : "JOIN GUILD"}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
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

function RosterTab({
  guild,
  meId,
  onManage,
  onAnswer,
}: {
  guild: GuildDetail;
  meId: string | null;
  onManage: (m: GuildMemberInfo) => void;
  onAnswer: (userId: string, action: "accept" | "reject") => void;
}) {
  const canManage = guild.myRole === "guildmaster" || guild.myRole === "officer";
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {canManage && guild.pendingRequests.length > 0 ? (
        <View style={styles.requests}>
          <Text style={styles.requestsLabel}>JOIN REQUESTS · {guild.pendingRequests.length}</Text>
          {guild.pendingRequests.map((r) =>
            r.identity ? (
              <View key={r.identity.id ?? r.requestedAt} style={styles.requestRow}>
                <UserIdentity identity={r.identity} compact />
                <View style={styles.requestActions}>
                  <Pressable
                    style={styles.acceptBtn}
                    onPress={() => r.identity?.id && onAnswer(r.identity.id, "accept")}
                  >
                    <Text style={styles.acceptText}>ACCEPT</Text>
                  </Pressable>
                  <Pressable
                    style={styles.rejectBtn}
                    onPress={() => r.identity?.id && onAnswer(r.identity.id, "reject")}
                  >
                    <Text style={styles.rejectText}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ) : null,
          )}
        </View>
      ) : null}

      {guild.members.map((m) => {
        const manageable =
          canManage &&
          m.identity?.id !== meId &&
          m.role !== "guildmaster" &&
          (guild.myRole === "guildmaster" || m.role === "member");
        return (
          <View key={m.identity?.id ?? m.joinedAt} style={styles.memberRow}>
            <View style={{ flex: 1 }}>
              {m.identity ? <UserIdentity identity={m.identity} compact /> : null}
              <Text style={styles.contribution}>
                {m.contributionXp} GXP total · {m.weeklyXp} this week
              </Text>
            </View>
            <View style={styles.memberRight}>
              <Text
                style={[
                  styles.roleBadge,
                  m.role === "guildmaster" && { color: colors.foil },
                  m.role === "officer" && { color: colors.accentSoft },
                ]}
              >
                {roleLabel[m.role]}
              </Text>
              {manageable ? (
                <Pressable hitSlop={10} onPress={() => onManage(m)}>
                  <Text style={styles.manageDots}>⋯</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function MemberManageModal({
  guild,
  member,
  onClose,
  onAction,
}: {
  guild: GuildDetail | null;
  member: GuildMemberInfo | null;
  onClose: () => void;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const [current, setCurrent] = useState<GuildMemberInfo | null>(member);
  useEffect(() => {
    if (member) setCurrent(member);
  }, [member]);
  const m = member ?? current;
  if (!guild || !m || !m.identity?.id) return null;
  const targetId = m.identity.id;
  const isGm = guild.myRole === "guildmaster";
  return (
    <SystemModal visible={!!member} onClose={onClose} title={m.identity.username}>
      <View style={{ gap: 10 }}>
        {isGm && m.role === "member" ? (
          <ManageBtn
            label="Promote to Officer"
            onPress={() => onAction(() => api.setGuildRole(guild.id, targetId, "officer"))}
          />
        ) : null}
        {isGm && m.role === "officer" ? (
          <ManageBtn
            label="Demote to Member"
            onPress={() => onAction(() => api.setGuildRole(guild.id, targetId, "member"))}
          />
        ) : null}
        {isGm ? (
          <ManageBtn
            label="Transfer Guildmaster"
            tone="foil"
            onPress={() => onAction(() => api.setGuildRole(guild.id, targetId, "guildmaster"))}
          />
        ) : null}
        <ManageBtn
          label="Remove from guild"
          tone="danger"
          onPress={() => onAction(() => api.kickGuildMember(guild.id, targetId))}
        />
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>
      </View>
    </SystemModal>
  );
}

function ManageBtn({
  label,
  onPress,
  tone,
}: {
  label: string;
  onPress: () => void;
  tone?: "danger" | "foil";
}) {
  return (
    <Pressable
      style={[
        styles.manageBtn,
        tone === "danger" && { borderColor: colors.danger },
        tone === "foil" && { borderColor: colors.foil },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.manageBtnText,
          tone === "danger" && { color: colors.danger },
          tone === "foil" && { color: colors.foil },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  tabTextActive: { color: colors.accentSoft },
  content: { padding: 16, gap: 14 },
  hallHeader: { alignItems: "center", gap: 8, paddingTop: 8 },
  hallTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  hallName: { color: colors.text, fontFamily: fonts.display, fontSize: 24 },
  hallTag: { fontSize: 15, fontWeight: "900" },
  motto: { color: colors.muted, fontStyle: "italic", textAlign: "center", fontSize: 13 },
  levelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  levelText: { color: colors.foil, fontFamily: fonts.display, fontSize: 18 },
  powerText: { color: colors.accentSoft, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  xpTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden", marginTop: 8 },
  xpFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  xpLabel: { color: colors.muted, fontSize: 11, marginTop: 6, fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 16 },
  stat: { alignItems: "center" },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  description: { color: colors.text, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  actions: { paddingHorizontal: 4, marginTop: 4 },
  joinBtn: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.65)",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  joinText: { color: colors.accentSoft, fontWeight: "900", fontSize: 13, letterSpacing: 1.4 },
  leaveBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(229,72,77,0.5)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  leaveText: { color: colors.danger, fontWeight: "900", fontSize: 12, letterSpacing: 1.4 },
  noteBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 13, alignItems: "center" },
  noteText: { color: colors.muted, fontSize: 13 },
  requests: {
    borderWidth: 1,
    borderColor: "rgba(245,184,76,0.4)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(245,184,76,0.05)",
  },
  requestsLabel: { color: colors.foil, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  requestRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptBtn: {
    backgroundColor: "rgba(76,195,138,0.16)",
    borderWidth: 1,
    borderColor: colors.fresh,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  acceptText: { color: colors.fresh, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  rejectBtn: { paddingHorizontal: 8, paddingVertical: 5 },
  rejectText: { color: colors.muted, fontSize: 16, fontWeight: "800" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contribution: { color: colors.muted, fontSize: 11, marginTop: 4, marginLeft: 39 },
  memberRight: { alignItems: "flex-end", gap: 6 },
  roleBadge: { color: colors.muted, fontSize: 8.5, fontWeight: "900", letterSpacing: 1 },
  manageDots: { color: colors.accentSoft, fontSize: 20, fontWeight: "900", lineHeight: 20 },
  manageBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.55)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  manageBtnText: { color: colors.accentSoft, fontWeight: "800", fontSize: 13, letterSpacing: 0.8 },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelText: { color: colors.muted, fontWeight: "800", fontSize: 12, letterSpacing: 1.5 },
  missing: { alignItems: "center", marginTop: 72, gap: 16, paddingHorizontal: 24 },
  missingText: { color: colors.muted, textAlign: "center", lineHeight: 22 },
  ghostBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 20 },
  ghostText: { color: colors.accentSoft, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
});
