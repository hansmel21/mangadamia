import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { BadgeToastHost } from "../src/components/BadgeToast";
import { LevelUpHost } from "../src/components/LevelUp";
import { QuestToastHost } from "../src/components/QuestToast";
import { pullCloud } from "../src/sync";
import { colors, fonts } from "../src/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime keeps results in memory for an hour, so navigating back to a
    // series renders instantly (a stale one refreshes in the background).
    queries: { staleTime: 5 * 60 * 1000, gcTime: 60 * 60 * 1000, retry: 1 },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  // Reconcile local library/progress with the signed-in account on launch
  useEffect(() => {
    void pullCloud();
  }, []);

  useEffect(() => {
    const open = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as never);
    };
    const initial = Notifications.getLastNotificationResponse();
    if (initial?.notification) open(initial.notification);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification),
    );
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: fontsLoaded ? { fontFamily: fonts.displayBold } : undefined,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="series/[src]/[id]" options={{ title: "" }} />
        <Stack.Screen name="user/[username]" options={{ title: "" }} />
        <Stack.Screen name="wall/[canonicalId]" options={{ title: "" }} />
        <Stack.Screen name="legal/terms" options={{ title: "Terms of Use" }} />
        <Stack.Screen name="legal/privacy" options={{ title: "Privacy Policy" }} />
        <Stack.Screen name="legal/community" options={{ title: "Community Guidelines" }} />
        <Stack.Screen name="admin/moderation" options={{ title: "Moderation" }} />
        <Stack.Screen name="admin/users" options={{ title: "User Administration" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="quests" options={{ title: "Quest Window" }} />
        <Stack.Screen name="account/edit" options={{ title: "Edit Profile" }} />
        <Stack.Screen name="account/appearance" options={{ title: "Appearance" }} />
        <Stack.Screen name="account/follow-requests" options={{ title: "Follow Requests" }} />
        <Stack.Screen name="follows/[username]" options={{ title: "Readers" }} />
        <Stack.Screen name="appeals" options={{ title: "Moderation & Appeals" }} />
        <Stack.Screen
          name="reader/[src]/[seriesId]/[chapterId]"
          options={{ headerShown: false }}
        />
      </Stack>
      <BadgeToastHost />
      <LevelUpHost />
      <QuestToastHost />
    </QueryClientProvider>
  );
}
