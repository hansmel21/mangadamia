import { Tabs } from "expo-router";
import { Compass, LibraryBig, ScrollText, Shield, Swords } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { colors, fonts } from "../../src/theme";

// The center "DUNGEON" command key: a 58px square rotated 45° that lifts above
// the bar, with an accent border + a 150ms glow-in when the feed activates.
function DungeonKey({
  focused,
  onPress,
}: {
  focused: boolean;
  onPress?: PressableProps["onPress"];
}) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(glow, {
      toValue: focused ? 1 : 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [focused, glow]);
  return (
    <Pressable
      onPress={onPress}
      style={styles.centerKey}
      accessibilityRole="button"
      accessibilityLabel="Dungeon"
    >
      <Animated.View
        style={[
          styles.diamond,
          { borderColor: focused ? colors.accent : colors.borderStrong },
          focused && styles.diamondActive,
          { shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) },
        ]}
      >
        <Swords
          color={focused ? colors.accentBright : colors.muted}
          size={22}
          strokeWidth={2}
          style={styles.diamondIcon}
        />
      </Animated.View>
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
        name="quests"
        options={{
          title: "QUESTS",
          tabBarIcon: ({ color, focused }) => (
            <SideIcon focused={focused}>
              <ScrollText color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
            </SideIcon>
          ),
        }}
      />
      {/* Status stays routable (hunter chip, top-right) but leaves the bar. */}
      <Tabs.Screen name="account" options={{ href: null }} />
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
    shadowOpacity: 0.13,
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
    // Sits just proud of the bar — not floating high above it.
    top: -6,
  },
  diamond: {
    width: 52,
    height: 52,
    transform: [{ rotate: "45deg" }],
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    // Glow base — animated shadowOpacity fades this in over 150ms on focus.
    shadowColor: colors.accent,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  diamondActive: {
    shadowColor: colors.accent,
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  diamondIcon: { transform: [{ rotate: "-45deg" }] },
  centerLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 6,
    fontFamily: fonts.displayBold,
  },
});
