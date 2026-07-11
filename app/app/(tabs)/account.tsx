// Account tab: sign in / create account when logged out, profile when in.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
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
import { api, type BadgeInfo, type MeResponse, type NotificationInfo } from "../../src/api";
import { BadgeMedallion, badgeTierName } from "../../src/components/BadgeMedallion";
import { SystemModal } from "../../src/components/SystemModal";
import { SystemWindow } from "../../src/components/SystemWindow";
import { getSessionUser, setSession, subscribeSession } from "../../src/session";
import { pullCloud } from "../../src/sync";
import { colors, fonts } from "../../src/theme";
import { TERMS_VERSION } from "../../src/legal";
import { clearAllLocalData } from "../../src/library";
import { BADGE_CATALOG } from "../../src/badges";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function AccountScreen() {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  return user ? <Profile /> : <AuthForm />;
}

function Profile() {
  const user = getSessionUser();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000 });
  const equippedId = me.data?.equippedBadgeId ?? null;
  const badges = me.data?.badges ?? BADGE_CATALOG;
  const notifs = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications,
    staleTime: 30_000,
  });
  const [opening, setOpening] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Viewing the inbox marks everything read (rows keep their bold state
  // until the next visit, so you can still see what was new).
  useEffect(() => {
    if (notifs.data?.some((n) => !n.read)) {
      api
        .markNotificationsRead()
        .then(() => queryClient.invalidateQueries({ queryKey: ["notifCount"] }))
        .catch(() => {});
    }
  }, [notifs.data, queryClient]);

  // Jump to the chapter (comments open) the reply was left on
  const openNotification = async (n: NotificationInfo) => {
    if (opening) return;
    // Post replies without series context just go to the Feed
    if (!n.canonicalId || n.chapterNumber == null) {
      if (n.type === "post") router.push("/(tabs)/feed");
      return;
    }
    setOpening(true);
    try {
      const sources = await api.canonicalSources(n.canonicalId);
      const first = sources[0];
      if (!first) return;
      const detail = await api.series(first.src, first.sourceSeriesId);
      const ch = detail.chapters.find((c) => c.number === n.chapterNumber);
      if (!ch) return;
      router.push({
        pathname: "/reader/[src]/[seriesId]/[chapterId]",
        params: {
          src: first.src,
          seriesId: first.sourceSeriesId,
          chapterId: ch.sourceChapterId,
          openComments: "1",
        },
      });
    } catch {
      // couldn't resolve — stay on the profile
    } finally {
      setOpening(false);
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      // session is being discarded either way
    }
    setSession(null, null);
  };

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? "?"}</Text>
        </View>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>

      </View>

      {me.data ? (
        <Pressable onPress={() => setStatsOpen(true)}>
        <SystemWindow title="Status" dim style={styles.statusWindow}>
          <View style={styles.levelRow}>
            <Text style={styles.levelText}>LV. {me.data.level}</Text>
            <Text style={styles.xpText}>
              {me.data.xp} / {me.data.xpForNextLevel} XP
            </Text>
          </View>
          <View style={styles.xpTrack}>
            <View
              style={[
                styles.xpFill,
                {
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((me.data.xp - (me.data.level - 1) ** 2 * 100) /
                        (me.data.xpForNextLevel - (me.data.level - 1) ** 2 * 100)) *
                        100,
                    ),
                  )}%`,
                },
              ]}
            />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{me.data.stats.comments}</Text>
              <Text style={styles.statLabel}>Comments</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{me.data.stats.likesReceived}</Text>
              <Text style={styles.statLabel}>Likes recv.</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{me.data.stats.chaptersRead}</Text>
              <Text style={styles.statLabel}>Ch. read</Text>
            </View>
          </View>
          <Text style={styles.statusHint}>TAP FOR FULL STATUS ▸</Text>
        </SystemWindow>
        </Pressable>
      ) : (
        <SystemWindow title="Status" dim style={styles.statusWindow}>
          {me.isLoading ? (
            <View style={styles.accountLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.accountLoadingText}>Loading account status…</Text>
            </View>
          ) : (
            <View style={styles.accountLoading}>
              <Text style={styles.accountErrorText}>Account status could not be loaded.</Text>
              <Pressable style={styles.retryBtn} onPress={() => void me.refetch()}>
                <Text style={styles.retryText}>TRY AGAIN</Text>
              </Pressable>
            </View>
          )}
        </SystemWindow>
      )}

      <Text style={styles.sectionTitle}>Badges</Text>
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
            <Text
              style={[styles.badgeSub, b.earned && styles.badgeEarned]}
              numberOfLines={1}
            >
              {b.earned ? "Earned" : `${b.progress.current}/${b.progress.target}`}
            </Text>
          </Pressable>
        ))}
      </View>

      <BadgeDetailModal
        badge={selectedBadge}
        equippedId={equippedId}
        onEquip={async (badgeId) => {
          try {
            await api.equipTitle(badgeId);
            queryClient.invalidateQueries({ queryKey: ["me"] });
          } catch {
            /* ignore */
          }
          setSelectedBadge(null);
        }}
        onClose={() => setSelectedBadge(null)}
      />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} me={me.data} />

      <Text style={styles.sectionTitle}>Notifications</Text>
      {opening && <ActivityIndicator color={colors.accent} style={{ marginVertical: 8 }} />}
      {(notifs.data ?? []).length === 0 ? (
        <Text style={styles.notifEmpty}>No notifications yet — replies to your comments show up here.</Text>
      ) : (
        (notifs.data ?? []).map((n) => (
          <Pressable key={n.id} style={styles.notifRow} onPress={() => openNotification(n)}>
            <Text style={[styles.notifTitle, !n.read && styles.notifUnread]} numberOfLines={1}>
              {n.fromUsername} replied
              {n.seriesTitle && n.chapterNumber != null
                ? ` · ${n.seriesTitle} Ch. ${formatNum(n.chapterNumber)}`
                : n.type === "post"
                  ? " · on the wall"
                  : ""}
            </Text>
            <Text style={styles.notifBody} numberOfLines={2}>
              {n.body}
            </Text>
            <Text style={styles.notifWhen}>{timeAgo(n.createdAt)}</Text>
          </Pressable>
        ))
      )}

      <Text style={styles.sectionTitle}>Legal & safety</Text>
      <View style={styles.legalLinks}>
        <Pressable onPress={() => router.push("/legal/terms")}>
          <Text style={styles.legalLink}>Terms of Use</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/legal/privacy")}>
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/legal/community")}>
          <Text style={styles.legalLink}>Community Guidelines</Text>
        </Pressable>
      </View>
      {user?.role === "moderator" || user?.role === "admin" ? (
        <Pressable style={styles.moderationBtn} onPress={() => router.push("/admin/moderation")}>
          <Text style={styles.moderationText}>Open moderation queue</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Pressable style={styles.deleteAccountBtn} onPress={() => setDeleteOpen(true)}>
        <Text style={styles.deleteAccountText}>Delete account and data</Text>
      </Pressable>
      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <View style={{ height: 32 }} />
    </ScrollView>
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
    ["Level", `LV. ${me.level}`, true],
    ["Total XP", `${me.xp}`],
    ["Next level", `${Math.max(0, me.xpForNextLevel - me.xp)} XP to go`],
    ["Comments", `${me.stats.comments}`],
    ["Likes received", `${me.stats.likesReceived}`],
    ["Chapters read", `${me.stats.chaptersRead}`],
    ["Badges", `${earned} / ${me.badges.length}`, true],
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
  equippedId,
  onEquip,
  onClose,
}: {
  badge: BadgeInfo | null;
  equippedId: string | null;
  onEquip: (badgeId: string | null) => void;
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
  const isEquipped = equippedId === b.id;
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

        {b.earned ? (
          <Pressable
            style={(s) => [styles.equipBtn, { opacity: s.pressed ? 0.6 : 1 }]}
            onPress={() => onEquip(isEquipped ? null : b.id)}
          >
            <Text style={styles.equipText}>
              {isEquipped ? "★ UNEQUIP TITLE" : "EQUIP AS TITLE"}
            </Text>
          </Pressable>
        ) : null}

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
                I agree to the Terms of Use and Community Guidelines and acknowledge the Privacy
                Policy.
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
        >
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.submitText}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>

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

function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount(password);
      clearAllLocalData();
      setSession(null, null);
      setPassword("");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SystemModal visible={open} onClose={onClose} title="Delete account">
      <Text style={styles.deleteWarning}>
        This permanently deletes your account and associated cloud library, reading activity,
        posts, comments, likes, reports, blocks, and sessions. This cannot be undone.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Confirm your password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.deleteConfirm, (!password || busy) && { opacity: 0.4 }]}
        disabled={!password || busy}
        onPress={remove}
      >
        <Text style={styles.deleteConfirmText}>{busy ? "DELETING…" : "DELETE PERMANENTLY"}</Text>
      </Pressable>
    </SystemModal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  formWrap: { padding: 24, paddingTop: 48, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { color: colors.muted, marginBottom: 12, lineHeight: 20 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { color: colors.danger },
  submitBtn: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(124,92,255,0.65)",
    borderRadius: 4,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: {
    color: colors.accentSoft,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  switchText: { color: colors.accent, textAlign: "center", marginTop: 14, fontWeight: "600" },
  profileCard: { alignItems: "center", paddingTop: 48, gap: 6 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: { color: colors.accentText, fontSize: 36, fontWeight: "800" },
  username: { color: colors.text, fontSize: 23, fontFamily: fonts.display },
  email: { color: colors.muted },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 20 },
  stat: { alignItems: "center" },
  statNum: { color: colors.text, fontSize: 20, fontFamily: fonts.display },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  signOutBtn: {
    marginTop: 36,
    marginHorizontal: 24,
    borderColor: "rgba(229,72,77,0.5)",
    borderWidth: 1.5,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  signOutText: {
    color: colors.danger,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  deleteAccountBtn: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  deleteAccountText: { color: colors.danger, fontSize: 12, textDecorationLine: "underline" },
  legalLinks: { marginHorizontal: 24, gap: 12, paddingVertical: 6 },
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
  deleteWarning: { color: colors.text, lineHeight: 20, marginBottom: 12 },
  deleteConfirm: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 4,
    paddingVertical: 11,
    alignItems: "center",
  },
  deleteConfirmText: { color: colors.danger, fontWeight: "800", letterSpacing: 1.2 },
  moderationBtn: { marginHorizontal: 24, marginTop: 12, borderWidth: 1, borderColor: colors.foil, padding: 11, alignItems: "center" },
  moderationText: { color: colors.foil, fontWeight: "800", letterSpacing: 1.2 },
  sectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 6,
  },
  notifEmpty: { color: colors.muted, paddingHorizontal: 24, paddingVertical: 8, lineHeight: 19 },
  notifRow: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  notifTitle: { color: colors.muted, fontSize: 14 },
  notifUnread: { color: colors.text, fontWeight: "700" },
  notifBody: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  notifWhen: { color: colors.muted, fontSize: 11, marginTop: 3 },
  levelWrap: { width: "78%", marginTop: 16 },
  levelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  levelText: { color: colors.foil, fontFamily: fonts.display, fontSize: 16 },
  xpText: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },
  xpTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  xpFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  badgeCard: {
    width: "30%",
    backgroundColor: colors.card,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  badgeLocked: { opacity: 0.35 },
  badgeName: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 6 },
  badgeSub: { color: colors.muted, fontSize: 10, marginTop: 2 },
  badgeEarned: { color: colors.foil, fontWeight: "800", letterSpacing: 0.6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalWrap: { width: "100%", maxWidth: 340 },
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
    borderColor: "rgba(124,92,255,0.55)",
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 32,
  },
  modalCloseText: { color: colors.accentSoft, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  equipBtn: {
    marginTop: 16,
    backgroundColor: "rgba(245,184,76,0.14)",
    borderWidth: 1.5,
    borderColor: colors.foil,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  equipText: { color: colors.foil, fontWeight: "800", letterSpacing: 1.6, fontSize: 12 },
  statusWindow: { marginHorizontal: 24, marginTop: 20 },
  accountLoading: { minHeight: 72, alignItems: "center", justifyContent: "center", gap: 10 },
  accountLoadingText: { color: colors.muted, fontSize: 12 },
  accountErrorText: { color: colors.danger, fontSize: 12, textAlign: "center" },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryText: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  statusHint: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.6,
    textAlign: "right",
    marginTop: 12,
  },
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
    borderBottomColor: "rgba(124,92,255,0.25)",
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
