import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { api, type NotificationInfo } from "../src/api";
import { UserIdentity } from "../src/components/UserIdentity";
import { registerPushNotifications, unregisterPushNotifications } from "../src/push";
import { colors } from "../src/theme";

function ago(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return minutes < 1 ? "now" : `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inbox = useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const preferences = useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: api.notificationPreferences,
  });
  const items = inbox.data?.pages.flatMap((page) => page.items) ?? [];

  const openNotification = async (notification: NotificationInfo) => {
    await api.markNotificationRead(notification.id).catch(() => {});
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["notifCount"] }),
    ]);
    const metadata = notification.metadata ?? {};
    const canonicalId =
      notification.canonicalId ?? (typeof metadata.canonicalId === "string" ? metadata.canonicalId : null);
    const chapterNumber =
      notification.chapterNumber ??
      (typeof metadata.chapterNumber === "number" ? metadata.chapterNumber : null);
    if (canonicalId && chapterNumber != null) {
      try {
        const sources = await api.canonicalSources(canonicalId);
        const source = sources[0];
        if (source) {
          const detail = await api.series(source.src, source.sourceSeriesId);
          const chapter = detail.chapters.find((item) => item.number === chapterNumber);
          if (chapter) {
            router.push({
              pathname: "/reader/[src]/[seriesId]/[chapterId]",
              params: {
                src: source.src,
                seriesId: source.sourceSeriesId,
                chapterId: chapter.sourceChapterId,
                openComments: "1",
              },
            });
            return;
          }
        }
      } catch {
        // Fall through to the stable route below.
      }
    }
    if (notification.targetUrl && notification.targetUrl !== "/notifications") {
      router.push(notification.targetUrl as never);
    }
  };

  const updatePreference = async (key: string, value: boolean) => {
    try {
      if (key === "pushEnabled" && value) await registerPushNotifications();
      if (key === "pushEnabled" && !value) await unregisterPushNotifications();
      await api.updateNotificationPreferences({ [key]: value });
      await queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] });
    } catch (error) {
      Alert.alert("Notifications", (error as Error).message);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable onPress={async () => {
          await api.markNotificationsRead();
          await inbox.refetch();
          await queryClient.invalidateQueries({ queryKey: ["notifCount"] });
        }}>
          <Text style={styles.action}>MARK ALL READ</Text>
        </Pressable>
        <Pressable onPress={() => setSettingsOpen((open) => !open)}>
          <Text style={styles.action}>SETTINGS</Text>
        </Pressable>
      </View>
      {settingsOpen && preferences.data ? (
        <View style={styles.settings}>
          {([
            ["pushEnabled", "Lock-screen push"],
            ["replies", "Replies"],
            ["reactions", "Likes & reactions"],
            ["follows", "Follows"],
            ["quests", "Quests & rewards"],
            ["newChapters", "New chapters"],
            ["announcements", "Announcements"],
          ] as const).map(([key, label]) => (
            <View key={key} style={styles.settingRow}>
              <Text style={styles.settingLabel}>{label}</Text>
              <Switch
                value={preferences.data[key]}
                onValueChange={(value) => void updatePreference(key, value)}
                trackColor={{ false: colors.card, true: colors.accent }}
              />
            </View>
          ))}
        </View>
      ) : null}
      {inbox.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          onEndReached={() => inbox.hasNextPage && void inbox.fetchNextPage()}
          refreshing={inbox.isRefetching}
          onRefresh={() => inbox.refetch()}
          ListEmptyComponent={<Text style={styles.empty}>Your notification center is clear.</Text>}
          renderItem={({ item }) => (
            <Pressable style={[styles.row, !item.read && styles.unread]} onPress={() => void openNotification(item)}>
              {item.actor ? (
                <UserIdentity
                  identity={item.actor}
                  compact
                  onPress={() => item.actor?.id && router.push({ pathname: "/user/[username]", params: { username: item.actor.username } })}
                />
              ) : null}
              <View style={styles.copy}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.when}>{ago(item.createdAt)}</Text>
              </View>
              <Pressable hitSlop={10} onPress={async () => {
                await api.dismissNotification(item.id);
                await inbox.refetch();
              }}>
                <Text style={styles.dismiss}>×</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  toolbar: { flexDirection: "row", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  action: { color: colors.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  settings: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 42 },
  settingLabel: { color: colors.text, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unread: { backgroundColor: "rgba(124,92,255,0.08)", borderLeftWidth: 3, borderLeftColor: colors.accent },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  when: { color: colors.muted, fontSize: 9, marginTop: 4 },
  dismiss: { color: colors.muted, fontSize: 22 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 60 },
});
