// SYSTEM SETTINGS — the old Account/Staff/Legal menu rows, pushed off the
// Status screen so Status stays a pure character sheet (System Protocol §8).
// Sign out and account deletion live here too.
import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import {
  ArrowLeft,
  FileText,
  ShieldAlert,
  ShieldCheck,
  SquarePen,
  UserPlus,
  Users,
  ChevronRight,
} from "lucide-react-native";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { ScreenTitle } from "../../src/components/SystemUI";
import { SystemModal } from "../../src/components/SystemModal";
import { clearAllLocalData } from "../../src/library";
import { unregisterPushNotifications } from "../../src/push";
import { getSessionUser, setSession, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: !!user, staleTime: 60_000 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canModerate = user?.capabilities?.includes("view_reports");
  const canManageUsers = user?.capabilities?.includes("manage_rewards");

  const signOut = async () => {
    try {
      await unregisterPushNotifications();
      await api.logout();
    } catch {
      // session is being discarded either way
    }
    setSession(null, null);
    router.back();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft color={colors.text} size={22} strokeWidth={2} />
        </Pressable>
        <ScreenTitle size={16}>SETTINGS</ScreenTitle>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {user ? <Text style={styles.emailLine}>{user.email}</Text> : null}

        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.menuList}>
          <MenuRow
            icon={<SquarePen color={colors.accentSoft} size={18} strokeWidth={1.9} />}
            label="Edit profile & privacy"
            onPress={() => router.push("/account/edit")}
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
            <Text style={styles.sectionTitle}>STAFF</Text>
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

        <Text style={styles.sectionTitle}>LEGAL & SAFETY</Text>
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

        <Pressable style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
        <Pressable style={styles.deleteAccountBtn} onPress={() => setDeleteOpen(true)}>
          <Text style={styles.deleteAccountText}>Delete account and data</Text>
        </Pressable>
        <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
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
        {busy ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.deleteConfirmText}>DELETE PERMANENTLY</Text>
        )}
      </Pressable>
    </SystemModal>
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
  content: { paddingBottom: 32 },
  emailLine: { color: colors.muted, fontSize: 12, paddingHorizontal: 24, paddingTop: 10 },
  sectionTitle: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 9.5,
    letterSpacing: 1.8,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  menuList: { paddingHorizontal: 16, gap: 8 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  menuRowPressed: { borderColor: "rgba(107,94,204,0.5)", opacity: 0.95 },
  menuIcon: {
    width: 30,
    height: 30,
    borderRadius: 3,
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
  signOutBtn: {
    marginTop: 36,
    marginHorizontal: 16,
    borderColor: "rgba(206,81,83,0.5)",
    borderWidth: 1.5,
    borderRadius: 3,
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
  deleteWarning: { color: colors.text, lineHeight: 20, marginBottom: 12 },
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
  error: { color: colors.danger, marginTop: 8 },
  deleteConfirm: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 3,
    paddingVertical: 11,
    alignItems: "center",
  },
  deleteConfirmText: { color: colors.danger, fontWeight: "800", letterSpacing: 1.2 },
});
