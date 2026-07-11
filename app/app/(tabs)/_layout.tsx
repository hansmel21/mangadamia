import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { CircleUserRound, LibraryBig, Search, Swords } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import { api } from "../../src/api";
import { HeaderMenu } from "../../src/components/HeaderMenu";
import { getSessionUser, subscribeSession } from "../../src/session";
import { colors } from "../../src/theme";

export default function TabsLayout() {
  // Unread notifications badge the Account tab (polled while signed in)
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
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerRight: () => <HeaderMenu />,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 1.5,
          borderTopColor: "rgba(124,92,255,0.45)",
        },
        tabBarActiveTintColor: colors.accentSoft,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 9.5,
          fontWeight: "800",
          letterSpacing: 1.4,
          textTransform: "uppercase",
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Browse",
          tabBarIcon: ({ color }) => <Search color={color} size={23} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Dungeons",
          tabBarIcon: ({ color }) => <Swords color={color} size={23} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => <LibraryBig color={color} size={23} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => (
            <CircleUserRound color={color} size={23} strokeWidth={1.8} />
          ),
          tabBarBadge: unread > 0 ? unread : undefined,
        }}
      />
    </Tabs>
  );
}
