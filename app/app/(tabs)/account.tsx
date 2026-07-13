// STATUS — the hunter's character sheet (System Protocol §8): XP ring around
// the avatar, HUNTER RECORD stat grid, EQUIPPED slots, badges rail, and
// today's quests. Menus (edit profile, staff, legal, sign-out) live behind
// the settings key on /account/settings. Signed-out users get the auth form.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Bell, Settings } from "lucide-react-native";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { api, type BadgeInfo, type MeResponse, type TitleInfo } from "../../src/api";
import { BADGE_CATALOG } from "../../src/badges";
import { BadgeMedallion, badgeTierName } from "../../src/components/BadgeMedallion";
import { GuildChip } from "../../src/components/GuildCrest";
import { HunterAvatar } from "../../src/components/HunterAvatar";
import { SystemModal } from "../../src/components/SystemModal";
import { ScreenTitle } from "../../src/components/SystemUI";
import { TitleFlair } from "../../src/components/TitleFlair";
import { TERMS_VERSION } from "../../src/legal";
import { pullCloud } from "../../src/sync";
import { getSessionUser, setSession, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

export default function AccountScreen() {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  return user ? <Profile /> : <AuthForm />;
}

const RING_R = 41;
const RING_C = 2 * Math.PI * RING_R;

function Profile() {
  const insets = useSafeAreaInsets();
  const user = getSessionUser();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000 });
  const notif = useQuery({
    queryKey: ["notifCount"],
    queryFn: api.notificationCount,
    refetchInterval: 15_000,
  });
  const quests = useQuery({ queryKey: ["quests"], queryFn: api.quests, staleTime: 60_000 });
  const equippedId = me.data?.equippedTitleId ?? null;
  const badges = me.data?.badges ?? BADGE_CATALOG;
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [allBadges, setAllBadges] = useState(false);

  const unread = notif.data?.unread ?? 0;
  const equippedTitle = me.data?.titles.find((title) => title.id === equippedId) ?? null;
  const equippedFrame =
    me.data?.cosmetics.find((c) => c.id === me.data?.equippedFrameId && c.kind === "frame") ?? null;
  const equippedAvatar =
    me.data?.cosmetics.find((c) => c.id === me.data?.equippedAvatarId && c.kind === "avatar") ??
    null;

  const xpFloor = me.data ? (me.data.level - 1) ** 2 * 100 : 0;
  const xpPct = me.data
    ? Math.max(
        0,
        Math.min(100, ((me.data.xp - xpFloor) / Math.max(1, me.data.xpForNextLevel - xpFloor)) * 100),
      )
    : 0;
  const xpToGo = me.data ? Math.max(0, me.data.xpForNextLevel - me.data.xp) : 0;
  const earned = badges.filter((b) => b.earned).length;
  const dailies = (quests.data ?? []).filter((q) => q.cadence === "daily");
  const dailiesDone = dailies.filter((q) => !!q.completedAt).length;

  const equipTitle = async (titleId: string | null) => {
    await api.equipTitle(titleId);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* header — STATUS title + bell + settings */}
      <View style={styles.header}>
        <ScreenTitle>STATUS</ScreenTitle>
        <View style={styles.headerKeys}>
          <Pressable
            hitSlop={8}
            onPress={() => router.push("/notifications")}
            accessibilityLabel="Notifications"
          >
            <Bell color={colors.muted} size={20} strokeWidth={2} />
            {unread > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => router.push("/account/settings")}
            accessibilityLabel="Settings"
          >
            <Settings color={colors.muted} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* identity — XP ring around the avatar + name/flair/level */}
        <View style={styles.identity}>
          <View style={styles.ringWrap}>
            <Svg width={88} height={88} style={styles.ring}>
              <Circle cx={44} cy={44} r={RING_R} stroke={colors.panelRaised} strokeWidth={5} fill="none" />
              <Circle
                cx={44}
                cy={44}
                r={RING_R}
                stroke={colors.accent}
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${RING_C}`}
                strokeDashoffset={RING_C * (1 - xpPct / 100)}
              />
            </Svg>
            {me.data?.identity ? (
              <HunterAvatar identity={me.data.identity} size={62} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {user?.username?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.identityBody}>
            <Text style={styles.username} numberOfLines={1}>
              {user?.username}
            </Text>
            <View style={styles.flairRow}>
              {equippedTitle ? <TitleFlair title={equippedTitle} /> : null}
              {me.data?.identity?.guild ? (
                <Pressable
                  onPress={() =>
                    me.data?.identity?.guild &&
                    router.push({
                      pathname: "/guild/[id]",
                      params: { id: me.data.identity.guild.id },
                    })
                  }
                >
                  <GuildChip guild={me.data.identity.guild} />
                </Pressable>
              ) : null}
            </View>
            {me.data ? (
              <View style={styles.levelLine}>
                <Text style={styles.levelText}>LV {me.data.level}</Text>
                <Text style={styles.xpToGo}>
                  {Math.round(xpPct)}% · {xpToGo} XP to LV {me.data.level + 1}
                </Text>
              </View>
            ) : me.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ alignSelf: "flex-start", marginTop: 8 }} />
            ) : (
              <Pressable onPress={() => void me.refetch()}>
                <Text style={styles.retryInline}>Status failed to load — TAP TO RETRY</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* moderation notice stays visible even though menus moved */}
        {me.data?.pendingNoticeCount ? (
          <Pressable style={styles.noticeBanner} onPress={() => router.push("/appeals")}>
            <Text style={styles.noticeText}>
              ! MODERATION NOTICE · {me.data.pendingNoticeCount} — TAP TO REVIEW
            </Text>
          </Pressable>
        ) : null}

        {/* HUNTER RECORD — 6-stat grid, tap for the full status readout */}
        {me.data ? (
          <Pressable onPress={() => setStatsOpen(true)}>
            <View style={styles.record}>
              <View style={[styles.recordTick, styles.recordTickTL]} pointerEvents="none" />
              <View style={[styles.recordTick, styles.recordTickTR]} pointerEvents="none" />
              <View style={[styles.recordTick, styles.recordTickBL]} pointerEvents="none" />
              <View style={[styles.recordTick, styles.recordTickBR]} pointerEvents="none" />
              <View style={styles.recordHead}>
                <View style={styles.recordDiamond}>
                  <Text style={styles.recordDiamondMark}>!</Text>
                </View>
                <Text style={styles.recordTitle}>HUNTER RECORD</Text>
              </View>
              <View style={styles.recordRule} />
              <View style={styles.recordGrid}>
                <RecordStat value={String(me.data.stats.chaptersRead)} label="CHAPTERS" />
                <RecordStat value={String(me.data.stats.comments)} label="RECORDS" />
                <RecordStat value={String(me.data.stats.likesReceived)} label="REACTIONS" />
                <RecordStat value={`${earned}/${badges.length}`} label="BADGES" foil />
                <RecordStat
                  value={`${me.data.stats.streakDays}🔥`}
                  label="DAY STREAK"
                  foil={me.data.stats.streakDays >= 7}
                />
                <RecordStat value={`#${me.data.stats.weeklyRank}`} label="WEEKLY RANK" />
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* EQUIPPED slots */}
        <Text style={styles.sectionLabel}>EQUIPPED</Text>
        <View style={styles.slotRow}>
          <SlotCard
            slot="TITLE"
            value={equippedTitle?.name ?? "None"}
            meta={
              equippedTitle
                ? `${equippedTitle.rarity} · ${me.data?.titles.length ?? 0} owned`
                : `${me.data?.titles.length ?? 0} owned`
            }
            equipped={!!equippedTitle}
            onPress={() => setTitlesOpen(true)}
          />
          <SlotCard
            slot="FRAME"
            value={equippedFrame?.name ?? "None"}
            meta={equippedFrame ? String(equippedFrame.rarity) : "tap to equip"}
            equipped={!!equippedFrame}
            onPress={() => router.push("/account/appearance")}
          />
          <SlotCard
            slot="AVATAR"
            value={equippedAvatar?.name ?? "Default"}
            meta={equippedAvatar ? String(equippedAvatar.rarity) : "tap to equip"}
            equipped={!!equippedAvatar}
            onPress={() => router.push("/account/appearance")}
          />
        </View>

        {/* badges — horizontal rail, ALL ▸ expands the grid */}
        <View style={styles.railHead}>
          <Text style={styles.sectionLabelInline}>
            BADGES · {earned}/{badges.length}
          </Text>
          <Pressable hitSlop={8} onPress={() => setAllBadges((v) => !v)}>
            <Text style={styles.allLink}>{allBadges ? "LESS ▴" : "ALL ▸"}</Text>
          </Pressable>
        </View>
        {allBadges ? (
          <View style={styles.badgeGrid}>
            {badges.map((b) => (
              <Pressable
                key={b.id}
                style={[styles.badgeCard, !b.earned && styles.badgeLocked]}
                onPress={() => setSelectedBadge(b)}
              >
                <BadgeMedallion badgeId={b.id} fallbackIcon={b.icon} size={46} glow={b.earned} />
                <Text style={styles.badgeName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={[styles.badgeSub, b.earned && styles.badgeEarned]} numberOfLines={1}>
                  {b.earned ? "Earned" : `${b.progress.current}/${b.progress.target}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeRail}
          >
            {badges.map((b) => (
              <Pressable
                key={b.id}
                style={[styles.badgeRailItem, !b.earned && styles.badgeLocked]}
                onPress={() => setSelectedBadge(b)}
              >
                <BadgeMedallion badgeId={b.id} fallbackIcon={b.icon} size={52} glow={b.earned} />
                <Text style={styles.badgeName} numberOfLines={1}>
                  {b.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* today's quests */}
        <View style={styles.questsBox}>
          <View style={styles.questsHead}>
            <Text style={styles.sectionLabelInline}>
              TODAY'S QUESTS{dailies.length > 0 ? ` · ${dailiesDone}/${dailies.length}` : ""}
            </Text>
            <Pressable hitSlop={8} onPress={() => router.push("/quests")}>
              <Text style={styles.allLink}>ALL QUESTS ▸</Text>
            </Pressable>
          </View>
          {dailies.length === 0 ? (
            <Text style={styles.questsEmpty}>No daily directives right now.</Text>
          ) : (
            dailies.map((q) => {
              const done = !!q.completedAt;
              const xp = q.rewards.find((r) => r.type === "xp");
              return (
                <Pressable
                  key={q.id}
                  style={styles.questRow}
                  onPress={() => (done ? undefined : router.push("/quests"))}
                >
                  {done ? (
                    <Text style={styles.questCheck}>✓</Text>
                  ) : (
                    <View style={styles.questBox} />
                  )}
                  <Text
                    style={[styles.questName, done && styles.questNameDone]}
                    numberOfLines={1}
                  >
                    {q.name}
                    {!done && q.target > 1 ? ` — ${Math.min(q.progress, q.target)}/${q.target}` : ""}
                  </Text>
                  {xp ? (
                    <Text style={[styles.questXp, done && { color: colors.muted }]}>{xp.name}</Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </View>

        <TitlesModal
          open={titlesOpen}
          onClose={() => setTitlesOpen(false)}
          titles={me.data?.titles ?? []}
          equippedId={equippedId}
          onEquip={equipTitle}
        />
        <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
        <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} me={me.data} />
      </ScrollView>
    </View>
  );
}

function RecordStat({ value, label, foil }: { value: string; label: string; foil?: boolean }) {
  return (
    <View style={styles.recordStat}>
      <Text style={[styles.recordValue, foil && { color: colors.foilSoft }]}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
    </View>
  );
}

function SlotCard({
  slot,
  value,
  meta,
  equipped,
  onPress,
}: {
  slot: string;
  value: string;
  meta: string;
  equipped: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.slot,
        equipped && styles.slotEquipped,
        pressed && { opacity: 0.85 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${slot} slot`}
    >
      <Text style={styles.slotLabel}>{slot}</Text>
      <Text style={[styles.slotValue, equipped && { color: colors.foilSoft }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.slotMeta} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

function StatsModal({
  open,
  onClose,
  me,
}: {
  open: boolean;
  onClose: () => void;
  me?: MeResponse;
}) {
  if (!me) return null;
  const earned = me.badges.filter((b) => b.earned).length;
  const rows: [string, string, boolean?][] = [
    ["Account", me.user.status.toUpperCase(), true],
    ["Role", me.user.role.replaceAll("_", " ").toUpperCase()],
    ["Level", `LV. ${me.level}`, true],
    ["Total XP", `${me.xp}`],
    ["Next level", `${Math.max(0, me.xpForNextLevel - me.xp)} XP to go`],
    ["Comments", `${me.stats.comments}`],
    ["Likes received", `${me.stats.likesReceived}`],
    ["Chapters read", `${me.stats.chaptersRead}`],
    ["Badges", `${earned} / ${me.badges.length}`, true],
    ["Day streak", `${me.stats.streakDays} day${me.stats.streakDays === 1 ? "" : "s"} 🔥`, me.stats.streakDays >= 7],
    ["Weekly rank", `#${me.stats.weeklyRank}`],
    ["Member for", `${me.stats.accountDays} day${me.stats.accountDays === 1 ? "" : "s"}`],
  ];
  return (
    <SystemModal visible={open} onClose={onClose} title="Status">
      <Text style={styles.statsName}>{me.user.username}</Text>
      {rows.map(([label, value, foil]) => (
        <View key={label} style={styles.statLine}>
          <Text style={styles.statLineLabel}>{label}</Text>
          <Text style={[styles.statLineValue, foil && { color: colors.foil }]}>{value}</Text>
        </View>
      ))}
      <View style={{ alignItems: "center" }}>
        <Pressable style={(s) => [styles.modalClose, { opacity: s.pressed ? 0.6 : 1 }]} onPress={onClose} hitSlop={8}>
          <Text style={styles.modalCloseText}>CLOSE</Text>
        </Pressable>
      </View>
    </SystemModal>
  );
}

function BadgeDetailModal({
  badge,
  onClose,
}: {
  badge: BadgeInfo | null;
  onClose: () => void;
}) {
  // Keep the last badge on screen so the close animation has content
  const [current, setCurrent] = useState<BadgeInfo | null>(badge);
  useEffect(() => {
    if (badge) setCurrent(badge);
  }, [badge]);
  const b = badge ?? current;
  if (!b) return null;
  const tier = badgeTierName(b.id);
  const pct = Math.min(100, Math.round((b.progress.current / b.progress.target) * 100));
  return (
    <SystemModal visible={!!badge} onClose={onClose} title="Badge Info">
      <View style={styles.modalBody}>
        <BadgeMedallion badgeId={b.id} fallbackIcon={b.icon} size={104} glow={b.earned} />
        <Text style={styles.modalName}>{b.name}</Text>
        {tier ? (
          <Text style={[styles.modalTier, b.earned && { color: colors.foil }]}>
            ◆ {tier} tier ◆
          </Text>
        ) : null}
        <Text style={styles.modalDesc}>{b.description}</Text>

        {b.earned ? (
          <Text style={styles.modalEarned}>
            ✓ EARNED
            {b.earnedAt
              ? ` · ${new Date(b.earnedAt)
                  .toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toUpperCase()}`
              : ""}
          </Text>
        ) : (
          <View style={styles.modalProgressWrap}>
            <View style={styles.modalProgressRow}>
              <Text style={styles.modalProgressLabel}>GOAL</Text>
              <Text style={styles.modalProgressNums}>
                {b.progress.current} / {b.progress.target}
              </Text>
            </View>
            <View style={styles.modalTrack}>
              <View style={[styles.modalFill, { width: `${pct}%` }]} />
            </View>
          </View>
        )}

        <Pressable style={styles.modalClose} onPress={onClose} hitSlop={8}>
          <Text style={styles.modalCloseText}>CLOSE</Text>
        </Pressable>
      </View>
    </SystemModal>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), username.trim(), password, TERMS_VERSION);
      setSession(res.token, res.user);
      void pullCloud(); // bring this account's library/progress onto the device
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    email.includes("@") &&
    password.length >= 8 &&
    (mode === "login" || (username.length >= 3 && accepted));
  const requirementHint = !email.includes("@")
    ? "Enter your email address."
    : password.length < 8
      ? "Password must be at least 8 characters."
      : mode === "register" && username.length < 3
        ? "Username must be at least 3 characters."
        : mode === "register" && !accepted
          ? "Confirm the 13+ Terms and Community Guidelines agreement."
          : "";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </Text>
        <Text style={styles.subtitle}>
          {mode === "login"
            ? "Sign in to comment on chapters."
            : "Pick a username — it's what other readers see."}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {mode === "register" && (
          <TextInput
            style={styles.input}
            placeholder="Username (3–20, letters/numbers/_)"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Password (8+ characters)"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {mode === "register" ? (
          <>
            <Pressable style={styles.consentRow} onPress={() => setAccepted((v) => !v)}>
              <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
                <Text style={styles.checkboxMark}>{accepted ? "✓" : ""}</Text>
              </View>
              <Text style={styles.consentText}>
                I confirm I am at least 13 years old, agree to the Terms of Use and Community
                Guidelines, and acknowledge the Privacy Policy.
              </Text>
            </Pressable>
            <View style={styles.authLegalLinks}>
              <Pressable onPress={() => router.push("/legal/terms")}>
                <Text style={styles.legalLink}>Terms</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/legal/community")}>
                <Text style={styles.legalLink}>Guidelines</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/legal/privacy")}>
                <Text style={styles.legalLink}>Privacy</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.authLegalLinks}>
            <Pressable onPress={() => router.push("/legal/terms")}>
              <Text style={styles.legalLink}>Terms</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/legal/community")}>
              <Text style={styles.legalLink}>Guidelines</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/legal/privacy")}>
              <Text style={styles.legalLink}>Privacy</Text>
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.submitBtn, (!canSubmit || busy) && styles.submitBtnDisabled]}
          disabled={!canSubmit || busy}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel={mode === "login" ? "Sign in" : "Create account"}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.submitText}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>
        {!canSubmit && requirementHint ? <Text style={styles.requirementHint}>{requirementHint}</Text> : null}

        <Pressable
          onPress={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError("");
          }}
        >
          <Text style={styles.switchText}>
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The Titles collection — a scrollable list you equip one flair from.
function TitlesModal({
  open,
  onClose,
  titles,
  equippedId,
  onEquip,
}: {
  open: boolean;
  onClose: () => void;
  titles: TitleInfo[];
  equippedId: string | null;
  onEquip: (id: string | null) => void | Promise<void>;
}) {
  return (
    <SystemModal visible={open} onClose={onClose} title="Titles">
      <Text style={styles.titlesIntro}>
        Equip one flair beside your name. Titles are earned from quests and events.
      </Text>
      <ScrollView style={styles.titlesScroll} contentContainerStyle={{ gap: 9 }}>
        <Pressable
          style={[styles.titleRow, !equippedId && styles.titleRowEquipped]}
          onPress={() => onEquip(null)}
        >
          <Text style={styles.titleNone}>No title</Text>
          <Text style={styles.titleState}>{!equippedId ? "ACTIVE" : "SET"}</Text>
        </Pressable>
        {titles.map((title) => {
          const equipped = equippedId === title.id;
          return (
            <Pressable
              key={title.id}
              style={[styles.titleRow, equipped && styles.titleRowEquipped]}
              onPress={() => onEquip(equipped ? null : title.id)}
            >
              <View style={styles.titleRowBody}>
                <TitleFlair title={title} />
                <Text style={styles.titleDesc} numberOfLines={2}>
                  {title.description}
                </Text>
              </View>
              <Text style={[styles.titleState, equipped && { color: colors.foil }]}>
                {equipped ? "EQUIPPED" : "EQUIP"}
              </Text>
            </Pressable>
          );
        })}
        {titles.length === 0 ? (
          <Text style={styles.titlesEmpty}>
            No titles yet. Complete quests and events to earn them.
          </Text>
        ) : null}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerKeys: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 16 },
  bellDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  ringWrap: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", transform: [{ rotate: "-90deg" }] },
  avatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: { color: "#0B0B11", fontSize: 26, fontWeight: "900" },
  identityBody: { flex: 1, gap: 3 },
  username: { color: colors.text, fontFamily: fonts.display, fontSize: 24 },
  flairRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  levelLine: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  levelText: { color: colors.foil, fontFamily: fonts.display, fontSize: 16 },
  xpToGo: { color: colors.muted, fontSize: 10.5 },
  retryInline: { color: colors.danger, fontSize: 11, marginTop: 6 },
  noticeBanner: {
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(206,81,83,0.6)",
    backgroundColor: colors.dangerGhost,
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: "center",
  },
  noticeText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  record: {
    position: "relative",
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: "rgba(13,15,20,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.5)",
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 14,
    shadowColor: colors.accent,
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  recordTick: { position: "absolute", width: 11, height: 11, borderColor: colors.accentBright },
  recordTickTL: { top: -2, left: -2, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  recordTickTR: { top: -2, right: -2, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  recordTickBL: { bottom: -2, left: -2, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  recordTickBR: { bottom: -2, right: -2, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  recordHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  recordDiamond: {
    width: 15,
    height: 15,
    borderWidth: 1.5,
    borderColor: colors.accentBright,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  recordDiamondMark: {
    color: colors.accentBright,
    fontSize: 9,
    fontWeight: "900",
    transform: [{ rotate: "-45deg" }],
  },
  recordTitle: { color: colors.accentBright, fontSize: 11, fontWeight: "800", letterSpacing: 3.5 },
  recordRule: { height: 1, backgroundColor: "rgba(107,94,204,0.35)", marginVertical: 12 },
  recordGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  recordStat: { width: "33.3%", alignItems: "center" },
  recordValue: { color: colors.text, fontFamily: fonts.display, fontSize: 19 },
  recordLabel: { color: colors.muted, fontSize: 9.5, letterSpacing: 1, marginTop: 2 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.8,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionLabelInline: { color: colors.muted, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.8 },
  slotRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  slot: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 10,
    gap: 4,
  },
  slotEquipped: { borderColor: "rgba(205,164,94,0.45)" },
  slotLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  slotValue: { color: colors.mutedStrong, fontSize: 11.5, fontWeight: "800" },
  slotMeta: { color: colors.muted, fontSize: 9, textTransform: "lowercase" },
  railHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  allLink: { color: colors.data, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },
  badgeRail: { paddingHorizontal: 16, gap: 10 },
  badgeRailItem: { width: 64, alignItems: "center", gap: 4 },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  badgeCard: {
    width: "30%",
    backgroundColor: colors.card,
    borderRadius: 4,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  badgeLocked: { opacity: 0.35 },
  badgeName: { color: colors.muted, fontSize: 9, marginTop: 4, textAlign: "center" },
  badgeSub: { color: colors.muted, fontSize: 10, marginTop: 2 },
  badgeEarned: { color: colors.foil, fontWeight: "800", letterSpacing: 0.6 },
  questsBox: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  questsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  questsEmpty: { color: colors.muted, fontSize: 11.5, marginTop: 10 },
  questRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  questCheck: { color: colors.fresh, fontSize: 13, width: 13, textAlign: "center" },
  questBox: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 2,
    marginHorizontal: 0.5,
  },
  questName: { color: colors.text, fontSize: 12.5, fontWeight: "600", flex: 1 },
  questNameDone: { color: colors.muted, textDecorationLine: "line-through" },
  questXp: { color: colors.foilSoft, fontSize: 10, fontWeight: "800" },

  formWrap: { padding: 24, paddingTop: 48, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { color: colors.muted, marginBottom: 12, lineHeight: 20 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { color: colors.danger },
  submitBtn: {
    backgroundColor: "rgba(107,94,204,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(107,94,204,0.65)",
    borderRadius: 3,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.4 },
  requirementHint: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: -4 },
  submitText: {
    color: colors.accentSoft,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  switchText: { color: colors.accent, textAlign: "center", marginTop: 14, fontWeight: "600" },
  legalLink: { color: colors.accentSoft, fontWeight: "700", textDecorationLine: "underline" },
  authLegalLinks: { flexDirection: "row", justifyContent: "center", gap: 18 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxMark: { color: colors.accentText, fontWeight: "900" },
  consentText: { color: colors.muted, fontSize: 12, lineHeight: 17, flex: 1 },
  titlesIntro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  titlesScroll: { maxHeight: 360 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    padding: 12,
  },
  titleRowEquipped: { borderColor: colors.foil, backgroundColor: "rgba(205,164,94,0.07)" },
  titleRowBody: { flex: 1, gap: 5 },
  titleNone: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  titlesEmpty: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 18, lineHeight: 18 },
  titleDesc: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  titleState: { color: colors.foil, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },
  modalBody: { alignItems: "center", gap: 6 },
  modalName: { color: colors.text, fontSize: 21, fontFamily: fonts.display, marginTop: 10 },
  modalTier: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  modalDesc: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    fontSize: 14,
  },
  modalEarned: { color: colors.foil, fontWeight: "800", marginTop: 14, letterSpacing: 1.2 },
  modalProgressWrap: { width: "100%", marginTop: 14 },
  modalProgressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  modalProgressLabel: {
    color: colors.accentSoft,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  modalProgressNums: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  modalTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  modalFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  modalClose: {
    marginTop: 18,
    borderColor: "rgba(107,94,204,0.55)",
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 9,
    paddingHorizontal: 32,
  },
  modalCloseText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  statsName: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 19,
    textAlign: "center",
    marginBottom: 8,
  },
  statLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(107,94,204,0.25)",
  },
  statLineLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  statLineValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
