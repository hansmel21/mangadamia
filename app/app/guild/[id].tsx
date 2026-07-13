// Guild Hall (HQ). Two tabs: HALL (emblem, level/XP/power, join/leave) and
// ROSTER (members + officer management, pending join requests + invitations).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { usePulseGlow } from "../../src/anim";
import { api, type GuildDetail, type GuildMemberInfo, type GuildRole } from "../../src/api";
import { GUILD_DECOR, GuildEmblem } from "../../src/components/GuildCrest";
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

// "idle 3d" for members who haven't been seen in a while (nothing under 1h).
function idleLabel(lastActiveAt: string | null): string | null {
  if (!lastActiveAt) return null;
  const hours = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 3_600_000);
  if (hours < 1) return null;
  if (hours < 24) return `idle ${hours}h`;
  return `idle ${Math.floor(hours / 24)}d`;
}

// Breathing green presence dot for the roster.
function MemberPulseDot() {
  const pulse = usePulseGlow();
  return <Animated.View style={[styles.memberOnlineDot, pulse]} />;
}

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

  const respondInvite = (action: "accept" | "decline") =>
    run(async () => {
      const res = await api.respondToGuildInvite(id, action);
      if (res.status === "joined") Alert.alert("Guild", "Welcome to the guild!");
    });

  const invite = (username: string) =>
    run(async () => {
      const res = await api.inviteToGuild(id, username);
      Alert.alert(
        "Guild",
        res.status === "joined"
          ? `@${res.username} had already requested to join — they're in!`
          : `Invitation sent to @${res.username}.`,
      );
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
            {/* The board lives on its own screen (inline composer + threads). */}
            <Pressable
              style={styles.tab}
              onPress={() => router.push({ pathname: "/guild/board/[id]", params: { id } })}
            >
              <Text style={styles.tabText}>BOARD ↗</Text>
            </Pressable>
          </View>

          {tab === "hall" ? (
            <HallTab
              guild={guild}
              busy={busy}
              onJoin={join}
              onLeave={leave}
              onRespondInvite={respondInvite}
            />
          ) : (
            <RosterTab
              guild={guild}
              meId={user?.id ?? null}
              busy={busy}
              onManage={setManage}
              onAnswer={(userId, action) =>
                run(async () => {
                  await api.answerGuildRequest(id, userId, action);
                })
              }
              onInvite={invite}
              onRevokeInvite={(userId) =>
                run(async () => {
                  await api.revokeGuildInvite(id, userId);
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
  onRespondInvite,
}: {
  guild: GuildDetail;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onRespondInvite: (action: "accept" | "decline") => void;
}) {
  const span = Math.max(1, guild.xpForNextLevel - guild.xpFloor);
  const pct = Math.min(100, Math.max(0, Math.round(((guild.xp - guild.xpFloor) / span) * 100)));
  const decor = guild.decorationKey ? (GUILD_DECOR[guild.decorationKey] ?? null) : null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View
        style={[
          styles.hallHeader,
          decor && {
            borderWidth: 1.5,
            borderColor: decor.color + "88",
            borderRadius: 12,
            paddingVertical: 14,
            backgroundColor: decor.color + "0d",
            shadowColor: decor.color,
            shadowOpacity: 0.13,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 0 },
            elevation: 5,
          },
        ]}
      >
        <GuildEmblem
          emblemKey={guild.emblemKey}
          primaryColor={guild.primaryColor}
          secondaryColor={guild.secondaryColor}
          size={92}
        />
        <View style={styles.hallTitleRow}>
          {decor ? <Text style={[styles.decorSigil, { color: decor.color }]}>{decor.icon}</Text> : null}
          <Text style={styles.hallName}>{guild.name}</Text>
          {decor ? <Text style={[styles.decorSigil, { color: decor.color }]}>{decor.icon}</Text> : null}
        </View>
        <Text style={[styles.hallTag, { color: guild.primaryColor }]}>[{guild.tag}]</Text>
        {guild.motto ? <Text style={styles.motto}>“{guild.motto}”</Text> : null}
        {decor ? (
          <Text style={[styles.decorName, { color: decor.color }]}>— {decor.name} —</Text>
        ) : null}
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
          <Stat value={String(guild.onlineCount)} label="Online" />
          <Stat value={String(guild.xp)} label="Total GXP" />
          <Stat value={String(guild.power)} label="Power" />
        </View>
      </SystemWindow>

      <SystemWindow title="Perk Track" dim style={{ marginHorizontal: 4 }}>
        <View style={{ gap: 9 }}>
          {guild.perks.map((p) => (
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

      {guild.description ? <Text style={styles.description}>{guild.description}</Text> : null}

      <WeeklyVanguard members={guild.members} />

      <View style={styles.actions}>
        {guild.myRole === "guildmaster" || guild.myRole === "officer" ? (
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push({ pathname: "/guild/edit/[id]", params: { id: guild.id } })}
          >
            <Text style={styles.editText}>⚙ EDIT GUILD</Text>
          </Pressable>
        ) : null}
        {guild.myRole ? (
          <Pressable style={[styles.leaveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={onLeave}>
            <Text style={styles.leaveText}>LEAVE GUILD</Text>
          </Pressable>
        ) : guild.inAnotherGuild ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>You're already in another guild.</Text>
          </View>
        ) : guild.invitePending ? (
          <View style={styles.inviteBanner}>
            <Text style={styles.inviteBannerText}>You've been invited to this guild.</Text>
            <View style={styles.inviteBannerActions}>
              <Pressable
                style={[styles.joinBtn, { flex: 1 }, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => onRespondInvite("accept")}
              >
                <Text style={styles.joinText}>ACCEPT INVITATION</Text>
              </Pressable>
              <Pressable
                style={[styles.declineBtn, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => onRespondInvite("decline")}
              >
                <Text style={styles.declineText}>DECLINE</Text>
              </Pressable>
            </View>
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

// The plan's "this week's contribution leaders (top 3)" card on the Hall tab.
function WeeklyVanguard({ members }: { members: GuildMemberInfo[] }) {
  const leaders = [...members]
    .filter((m) => m.weeklyXp > 0 && m.identity)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .slice(0, 3);
  if (leaders.length === 0) return null;
  return (
    <SystemWindow title="This Week's Vanguard" dim style={{ marginHorizontal: 4 }}>
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

function RosterTab({
  guild,
  meId,
  busy,
  onManage,
  onAnswer,
  onInvite,
  onRevokeInvite,
}: {
  guild: GuildDetail;
  meId: string | null;
  busy: boolean;
  onManage: (m: GuildMemberInfo) => void;
  onAnswer: (userId: string, action: "accept" | "reject") => void;
  onInvite: (username: string) => void;
  onRevokeInvite: (userId: string) => void;
}) {
  const canManage = guild.myRole === "guildmaster" || guild.myRole === "officer";
  // Contribution board: the server sends role-ordered members; WEEKLY and
  // ALL-TIME re-rank them by contribution so the guild sees who's carrying.
  const [order, setOrder] = useState<"rank" | "weekly" | "alltime">("rank");
  const members =
    order === "rank"
      ? guild.members
      : [...guild.members].sort((a, b) =>
          order === "weekly" ? b.weeklyXp - a.weeklyXp : b.contributionXp - a.contributionXp,
        );
  const [inviteName, setInviteName] = useState("");
  const sendInvite = () => {
    const name = inviteName.trim().replace(/^@/, "");
    if (!name) return;
    setInviteName("");
    onInvite(name);
  };
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {canManage ? (
        <View style={styles.inviteBox}>
          <Text style={styles.inviteLabel}>INVITE A READER</Text>
          <View style={styles.inviteInputRow}>
            <TextInput
              style={styles.inviteInput}
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="@username"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={sendInvite}
              returnKeyType="send"
            />
            <Pressable
              style={[styles.inviteSendBtn, (busy || !inviteName.trim()) && { opacity: 0.5 }]}
              disabled={busy || !inviteName.trim()}
              onPress={sendInvite}
            >
              <Text style={styles.inviteSendText}>SEND</Text>
            </Pressable>
          </View>
          {guild.pendingInvites.length > 0 ? (
            <View style={{ gap: 10, marginTop: 4 }}>
              <Text style={styles.invitePendingLabel}>
                AWAITING ANSWER · {guild.pendingInvites.length}
              </Text>
              {guild.pendingInvites.map((i) =>
                i.identity ? (
                  <View key={i.identity.id ?? i.invitedAt} style={styles.requestRow}>
                    <UserIdentity identity={i.identity} compact />
                    <Pressable
                      style={styles.rejectBtn}
                      hitSlop={8}
                      onPress={() => i.identity?.id && onRevokeInvite(i.identity.id)}
                    >
                      <Text style={styles.rejectText}>✕</Text>
                    </Pressable>
                  </View>
                ) : null,
              )}
            </View>
          ) : null}
        </View>
      ) : null}

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

      <View style={styles.orderRow}>
        {(
          [
            ["rank", "RANK"],
            ["weekly", "WEEKLY"],
            ["alltime", "ALL-TIME"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.orderChip, order === key && styles.orderChipActive]}
            onPress={() => setOrder(key)}
          >
            <Text style={[styles.orderChipText, order === key && styles.orderChipTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {members.map((m, i) => {
        const manageable =
          canManage &&
          m.identity?.id !== meId &&
          m.role !== "guildmaster" &&
          (guild.myRole === "guildmaster" || m.role === "member");
        return (
          <View key={m.identity?.id ?? m.joinedAt} style={styles.memberRow}>
            {order !== "rank" ? (
              <Text style={[styles.boardPos, i === 0 && { color: colors.foil }]}>{i + 1}</Text>
            ) : null}
            <View style={{ flex: 1 }}>
              <View style={styles.memberNameRow}>
                {m.online ? <MemberPulseDot /> : null}
                {m.identity ? <UserIdentity identity={m.identity} compact /> : null}
              </View>
              <Text style={styles.contribution}>
                {order === "weekly"
                  ? `${m.weeklyXp} GXP this week · ${m.contributionXp} total`
                  : `${m.contributionXp} GXP total · ${m.weeklyXp} this week`}
                {!m.online && idleLabel(m.lastActiveAt) ? ` · ${idleLabel(m.lastActiveAt)}` : ""}
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
  decorSigil: { fontSize: 16, fontWeight: "900" },
  decorName: { fontSize: 9.5, fontWeight: "900", letterSpacing: 2, marginTop: 2 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkLevel: { color: colors.foil, fontSize: 10, fontWeight: "900", width: 36 },
  perkLabel: { color: colors.text, fontSize: 12.5, flex: 1, lineHeight: 17 },
  perkState: { color: colors.muted, fontSize: 11, fontWeight: "900" },
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
  actions: { paddingHorizontal: 4, marginTop: 4, gap: 10 },
  editBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.55)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  editText: { color: colors.accentSoft, fontWeight: "900", fontSize: 12, letterSpacing: 1.4 },
  joinBtn: {
    backgroundColor: "rgba(107,94,204,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.65)",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  joinText: { color: colors.accentSoft, fontWeight: "900", fontSize: 13, letterSpacing: 1.4 },
  leaveBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(206,81,83,0.5)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  leaveText: { color: colors.danger, fontWeight: "900", fontSize: 12, letterSpacing: 1.4 },
  noteBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 13, alignItems: "center" },
  noteText: { color: colors.muted, fontSize: 13 },
  inviteBanner: {
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.5)",
    borderRadius: 12,
    padding: 13,
    gap: 12,
    backgroundColor: "rgba(107,94,204,0.07)",
  },
  inviteBannerText: { color: colors.text, fontSize: 13, textAlign: "center" },
  inviteBannerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  declineBtn: { paddingVertical: 13, paddingHorizontal: 14 },
  declineText: { color: colors.muted, fontWeight: "900", fontSize: 12, letterSpacing: 1.2 },
  inviteBox: {
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.35)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(107,94,204,0.05)",
  },
  inviteLabel: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  inviteInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inviteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  inviteSendBtn: {
    backgroundColor: "rgba(107,94,204,0.18)",
    borderWidth: 1,
    borderColor: "rgba(107,94,204,0.65)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inviteSendText: { color: colors.accentSoft, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  invitePendingLabel: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.3 },
  vanguardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  vanguardRank: {
    color: colors.accentSoft,
    fontFamily: fonts.display,
    fontSize: 16,
    width: 18,
    textAlign: "center",
  },
  vanguardXp: { color: colors.muted, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  orderRow: { flexDirection: "row", gap: 8 },
  orderChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  orderChipActive: { borderColor: "rgba(107,94,204,0.65)", backgroundColor: "rgba(107,94,204,0.12)" },
  orderChipText: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2 },
  orderChipTextActive: { color: colors.accentSoft },
  boardPos: {
    color: colors.muted,
    fontFamily: fonts.display,
    fontSize: 15,
    width: 20,
    textAlign: "center",
  },
  requests: {
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.4)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(205,164,94,0.05)",
  },
  requestsLabel: { color: colors.foil, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  requestRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptBtn: {
    backgroundColor: "rgba(86,168,123,0.16)",
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
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberOnlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.fresh },
  memberRight: { alignItems: "flex-end", gap: 6 },
  roleBadge: { color: colors.muted, fontSize: 8.5, fontWeight: "900", letterSpacing: 1 },
  manageDots: { color: colors.accentSoft, fontSize: 20, fontWeight: "900", lineHeight: 20 },
  manageBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.55)",
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
