import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { db } from "./library";

const PUSH_TOKEN_KEY = "push_token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushNotifications(): Promise<string> {
  if (!Device.isDevice) throw new Error("Push notifications require a physical device.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("social", {
      name: "Social updates",
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: false,
    });
    await Notifications.setNotificationChannelAsync("account", {
      name: "Account and moderation",
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: false,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission =
    existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notification permission was not granted.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("Push setup needs this app linked to an EAS project before a device token can be created.");
  }
  const expoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.registerPushDevice(expoToken, Platform.OS as "android" | "ios");
  db.runSync(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, [PUSH_TOKEN_KEY, expoToken]);
  return expoToken;
}

export function storedPushToken(): string | null {
  return db.getFirstSync<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, [PUSH_TOKEN_KEY])?.value ?? null;
}

export async function unregisterPushNotifications(): Promise<void> {
  const token = storedPushToken();
  if (token) await api.unregisterPushDevice(token).catch(() => {});
  db.runSync(`DELETE FROM kv WHERE key = ?`, [PUSH_TOKEN_KEY]);
}
