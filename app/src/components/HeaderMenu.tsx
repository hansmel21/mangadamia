// Right-side hamburger menu — the app's quick-nav hub. Replaces the standalone
// notification bell: notifications live here alongside Quests and the Arena so
// the game/social surfaces are one tap away from any tab.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Bell, ChevronRight, Menu, ScrollText, Shield, Swords, Trophy, X } from "lucide-react-native";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { getSessionUser, subscribeSession } from "../session";
import { colors } from "../theme";

const PANEL_WIDTH = 288;

export function HeaderMenu() {
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const [open, setOpen] = useState(false);
  const count = useQuery({
    queryKey: ["notifCount"],
    queryFn: api.notificationCount,
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const unread = user ? count.data?.unread ?? 0 : 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Menu color={colors.text} size={23} strokeWidth={2} />
        {unread > 0 ? <View style={styles.triggerDot} /> : null}
      </Pressable>
      <MenuPanel open={open} onClose={() => setOpen(false)} unread={unread} signedIn={!!user} />
    </>
  );
}

function MenuPanel({
  open,
  onClose,
  unread,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  unread: number;
  signedIn: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(open);
  const x = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setRendered(true);
      x.setValue(PANEL_WIDTH);
      backdrop.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(x, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(x, {
          toValue: PANEL_WIDTH,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => setRendered(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (path: string) => {
    onClose();
    // Let the close animation start before the navigation transition.
    setTimeout(() => router.push(path as never), 60);
  };

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { paddingTop: insets.top + 12, transform: [{ translateX: x }] }]}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>MENU</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X color={colors.muted} size={20} />
          </Pressable>
        </View>

        {signedIn ? (
          <MenuRow
            icon={<Bell color={colors.accentSoft} size={19} strokeWidth={1.9} />}
            label="Notifications"
            badge={unread > 0 ? (unread > 99 ? "99+" : String(unread)) : undefined}
            onPress={() => go("/notifications")}
          />
        ) : null}
        {signedIn ? (
          <MenuRow
            icon={<ScrollText color={colors.accentSoft} size={19} strokeWidth={1.9} />}
            label="Quests"
            onPress={() => go("/quests")}
          />
        ) : null}
        <MenuRow
          icon={<Shield color={colors.accentSoft} size={19} strokeWidth={1.9} />}
          label="Guilds"
          sublabel="Join a reader guild"
          onPress={() => go("/guilds")}
        />
        <MenuRow
          icon={<Trophy color={colors.foil} size={19} strokeWidth={1.9} />}
          label="The Arena"
          sublabel="Weekly games & leaderboards"
          onPress={() => go("/arena")}
        />

        {!signedIn ? (
          <Text style={styles.signInHint}>
            Sign in from the Account tab to unlock quests and notifications.
          </Text>
        ) : null}

        <View style={styles.spacer} />
        <View style={styles.footerRow}>
          <Swords color={colors.muted} size={14} strokeWidth={1.8} />
          <Text style={styles.footerText}>MANGADAMIA</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  sublabel,
  badge,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight color={colors.muted} size={18} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: { paddingHorizontal: 14, paddingVertical: 4 },
  triggerDot: {
    position: "absolute",
    top: 2,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: PANEL_WIDTH,
    backgroundColor: colors.panel,
    borderLeftWidth: 1.5,
    borderLeftColor: colors.accentLine,
    paddingHorizontal: 14,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: -2, height: 0 },
    elevation: 16,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  panelTitle: { color: colors.accentSoft, fontSize: 12, fontWeight: "900", letterSpacing: 3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  rowPressed: { backgroundColor: colors.accentGhost, borderColor: colors.accentLine },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 5,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  rowBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  signInHint: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 8, paddingTop: 8 },
  spacer: { flex: 1 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
  footerText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
});
