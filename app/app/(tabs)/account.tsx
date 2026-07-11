// Account tab: sign in / create account when logged out, profile when in.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Bell,
  ChevronRight,
  Crown,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquarePen,
  UserPlus,
  Users,
} from "lucide-react-native";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { api, type BadgeInfo, type MeResponse, type TitleInfo } from "../../src/api";
import { BadgeMedallion, badgeTierName } from "../../src/components/BadgeMedallion";
import { SystemModal } from "../../src/components/SystemModal";
import { SystemWindow } from "../../src/components/SystemWindow";
import { getSessionUser, setSession, subscribeSession } from "../../src/session";
import { pullCloud } from "../../src/sync";
import { colors, fonts } from "../../src/theme";
import { TERMS_VERSION } from "../../src/legal";
import { clearAllLocalData } from "../../src/library";
import { BADGE_CATALOG } from "../../src/badges";
import { UserIdentity } from "../../src/components/UserIdentity";
import { TitleFlair } from "../../src/components/TitleFlair";
import { unregisterPushNotifications } from "../../src/push";

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
  const equippedId = me.data?.equippedTitleId ?? null;
  const badges = me.data?.badges ?? BADGE_CATALOG;
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canModerate = user?.capabilities?.includes("view_reports");
  const canManageUsers = user?.capabilities?.includes("manage_rewards");

  const equippedTitle = me.data?.titles.find((title) => title.id === equippedId) ?? null;
  const titleCount = me.data?.titles.length ?? 0;
  const titlesValue = equippedTitle
    ? equippedTitle.name
    : titleCount > 0
      ? `${titleCount} unlocked`
      : "None yet";
  const cosmeticsValue = me.data?.cosmetics.length
    ? `${me.data.cosmetics.length} owned`
    : "Customize";

  const equipTitle = async (titleId: string | null) => {
    await api.equipTitle(titleId);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const signOut = async () => {
    try {
      await unregisterPushNotifications();
      await api.logout();
    } catch {
      // session is being discarded either way
    }
    setSession(null, null);
  };

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.profileCard}>
        {me.data?.identity ? (
          <UserIdentity identity={me.data.identity} profile />
        ) : (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
            <Text style={styles.username}>{user?.username}</Text>
          </>
        )}
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

      <Text style={styles.sectionTitle}>Collection</Text>
      <View style={styles.tileRow}>
        <CollectionTile
          icon={<Crown color={colors.foil} size={22} strokeWidth={1.9} />}
          label="Titles"
          value={titlesValue}
          onPress={() => setTitlesOpen(true)}
        />
        <CollectionTile
          icon={<Sparkles color={colors.accentSoft} size={22} strokeWidth={1.9} />}
          label="Avatars & Frames"
          value={cosmeticsValue}
          onPress={() => router.push("/account/appearance")}
        />
      </View>

      <Text style={styles.sectionSubTitle}>Badges</Text>
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

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.menuList}>
        <MenuRow
          icon={<SquarePen color={colors.accentSoft} size={18} strokeWidth={1.9} />}
          label="Edit profile & privacy"
          onPress={() => router.push("/account/edit")}
        />
        <MenuRow
          icon={<Bell color={colors.accentSoft} size={18} strokeWidth={1.9} />}
          label="Notifications"
          onPress={() => router.push("/notifications")}
        />
        {me.data?.pendingFollowCount ? (
          <MenuRow
            icon={<UserPlus color={colors.accentSoft} size={18} strokeWidth={1.9} />}
            label="Follow requests"
            badge={String(me.data.pendingFollowCount)}
            onPress={() => router.push("/account/follow-requests")}
          />
        ) : null}
        {me.data?.pendingNoticeCount ? (
          <MenuRow
            icon={<ShieldAlert color={colors.danger} size={18} strokeWidth={1.9} />}
            label="Moderation notice"
            tone="danger"
            badge={String(me.data.pendingNoticeCount)}
            onPress={() => router.push("/appeals")}
          />
        ) : null}
      </View>

      {canModerate || canManageUsers ? (
        <>
          <Text style={styles.sectionTitle}>Staff</Text>
          <View style={styles.menuList}>
            {canModerate ? (
              <MenuRow
                icon={<ShieldCheck color={colors.foil} size={18} strokeWidth={1.9} />}
                label="Moderation queue"
                onPress={() => router.push("/admin/moderation")}
              />
            ) : null}
            {canManageUsers ? (
              <MenuRow
                icon={<Users color={colors.foil} size={18} strokeWidth={1.9} />}
                label="User administration"
                onPress={() => router.push("/admin/users")}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Legal & safety</Text>
      <View style={styles.menuList}>
        <MenuRow
          icon={<FileText color={colors.muted} size={18} strokeWidth={1.9} />}
          label="Terms of Use"
          onPress={() => router.push("/legal/terms")}
        />
        <MenuRow
          icon={<FileText color={colors.muted} size={18} strokeWidth={1.9} />}
          label="Privacy Policy"
          onPress={() => router.push("/legal/privacy")}
        />
        <MenuRow
          icon={<FileText color={colors.muted} size={18} strokeWidth={1.9} />}
          label="Community Guidelines"
          onPress={() => router.push("/legal/community")}
        />
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
    ["Account", me.user.status.toUpperCase(), true],
    ["Role", me.user.role.replaceAll("_", " ").toUpperCase()],
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

// A square tile in the Collection row (Titles, Avatars & Frames).
function CollectionTile({
  icon,
  label,
  value,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

// A consistent list row for the Account / Staff / Legal menus.
function MenuRow({
  icon,
  label,
  badge,
  tone,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  badge?: string;
  tone?: "danger";
  onPress: () => void;
}) {
  const danger = tone === "danger";
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.menuIcon}>{icon}</View>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
      {badge ? (
        <View style={[styles.menuBadge, danger && { backgroundColor: colors.danger }]}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight color={danger ? colors.danger : colors.muted} size={18} strokeWidth={1.8} />
    </Pressable>
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
  requirementHint: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: -4 },
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
  sectionHint: { color: colors.muted, paddingHorizontal: 24, fontSize: 11, marginBottom: 8 },
  sectionSubTitle: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 8,
  },
  tileRow: { flexDirection: "row", gap: 10, paddingHorizontal: 24 },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  tilePressed: { borderColor: "rgba(124,92,255,0.5)", opacity: 0.95 },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  tileValue: { color: colors.muted, fontSize: 11.5 },
  menuList: { paddingHorizontal: 24, gap: 8 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  menuRowPressed: { borderColor: "rgba(124,92,255,0.5)", opacity: 0.95 },
  menuIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  menuBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  titlesIntro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  titlesScroll: { maxHeight: 360 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  titleRowEquipped: { borderColor: colors.foil, backgroundColor: "rgba(245,184,76,0.07)" },
  titleRowBody: { flex: 1, gap: 5 },
  titleNone: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  titlesEmpty: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 18, lineHeight: 18 },
  titleGrid: { gap: 9, paddingHorizontal: 24 },
  titleCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 7 },
  titleCardEquipped: { borderColor: colors.foil, backgroundColor: "rgba(245,184,76,0.07)" },
  titleDesc: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  titleState: { color: colors.foil, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },
  accountLinks: { paddingHorizontal: 24, paddingTop: 22, gap: 8 },
  accountLink: { borderWidth: 1, borderColor: colors.border, padding: 11, alignItems: "center" },
  accountLinkText: { color: colors.accentSoft, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 },
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
