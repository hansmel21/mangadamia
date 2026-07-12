import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { CircleUserRound, Compass, LibraryBig, Shield, Swords } from "lucide-react-native";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { api } from "../../src/api";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors, fonts } from "../../src/theme";

// The center "DUNGEON" command key: a 58px square rotated 45° that lifts above
// the bar, with an accent border + glow when the feed is active.
function DungeonKey({
  focused,
  onPress,
}: {
  focused: boolean;
  onPress?: PressableProps["onPress"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.centerKey}
      accessibilityRole="button"
      accessibilityLabel="Dungeon"
    >
      <View
        style={[
          styles.diamond,
          { borderColor: focused ? colors.accent : colors.borderStrong },
          focused && styles.diamondActive,
        ]}
      >
        <Swords
          color={focused ? colors.accentBright : colors.muted}
          size={22}
          strokeWidth={2}
          style={styles.diamondIcon}
        />
      </View>
      <Text style={[styles.centerLabel, { color: focused ? colors.accentBright : colors.muted }]}>
        DUNGEON
      </Text>
    </Pressable>
  );
}

function SideIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  return <View style={[styles.sideIcon, focused && styles.sideIconActive]}>{children}</View>;
}

export default function TabsLayout() {
  // Unread notifications badge the STATUS key (polled while signed in).
  const user = useSyncExternalStore(subscribeSession, getSessionUser);
  const count = useQuery({
    queryKey: ["notifCount"],
    queryFn: api.notificationCount,
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const unread = user ? (count.data?.unread ?? 0) : 0;

  return (
    <Tabs
      screenOptions={{
        animation: "shift",
        // Every tab renders its own in-screen System header (ScreenTitle).
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accentBright,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Order places DUNGEON at the physical center of the 5 keys. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "HOME",
          tabBarIcon: ({ color, focused }) => (
            <SideIcon focused={focused}>
              <Compass color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
            </SideIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "ARCHIVE",
          tabBarIcon: ({ color, focused }) => (
            <SideIcon focused={focused}>
              <LibraryBig color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
            </SideIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "DUNGEON",
          tabBarButton: (props) => (
            <DungeonKey
              focused={props.accessibilityState?.selected ?? false}
              onPress={props.onPress}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="guild"
        options={{
          title: "GUILD",
          tabBarIcon: ({ color, focused }) => (
            <SideIcon focused={focused}>
              <Shield color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
            </SideIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "STATUS",
          tabBarIcon: ({ color, focused }) => (
            <SideIcon focused={focused}>
              <CircleUserRound color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
            </SideIcon>
          ),
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 74,
    backgroundColor: colors.bg,
    borderTopWidth: 1.5,
    borderTopColor: colors.accentLine,
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 4,
    elevation: 18,
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 2,
  },
  sideIcon: { width: 30, height: 24, alignItems: "center", justifyContent: "center" },
  sideIconActive: {},
  centerKey: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    top: -18,
  },
  diamond: {
    width: 58,
    height: 58,
    transform: [{ rotate: "45deg" }],
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  diamondActive: {
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  diamondIcon: { transform: [{ rotate: "-45deg" }] },
  centerLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 10,
    fontFamily: fonts.displayBold,
  },
  badge: {
    backgroundColor: colors.danger,
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
});
