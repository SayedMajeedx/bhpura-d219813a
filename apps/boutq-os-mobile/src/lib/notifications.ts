import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const NOTIFICATIONS_KEY = "boutq.notifications.enabled";
export const PUSH_TOKEN_KEY = "boutq.notifications.expoPushToken";
export const PUSH_PREFERENCES_KEY = "boutq.notifications.preferences";
export type PushPreferences = Record<string, boolean>;
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  order_new: true,
  order_updated: true,
  review_due: true,
  review_completed: true,
  low_stock: true,
  system_failure: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("boutq-updates", {
    name: "تحديثات Boutq OS",
    description: "الطلبات والتنبيهات المهمة من Boutq OS",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: "#330A0A",
    sound: "default",
  });
}

export async function enablePushNotifications() {
  if (!Device.isDevice) throw new Error("الإشعارات تحتاج جهازاً فعلياً");

  await ensureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("لم يتم السماح بالإشعارات من إعدادات الجهاز");

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("رقم مشروع Expo غير موجود");

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await AsyncStorage.multiSet([
    [NOTIFICATIONS_KEY, "true"],
    [PUSH_TOKEN_KEY, token],
  ]);
  return token;
}

export async function disablePushNotifications() {
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, "false");
}

export async function savePushPreferences(preferences: PushPreferences) {
  await AsyncStorage.setItem(PUSH_PREFERENCES_KEY, JSON.stringify(preferences));
}

export async function getStoredNotificationState() {
  const values = await AsyncStorage.multiGet([NOTIFICATIONS_KEY, PUSH_TOKEN_KEY, PUSH_PREFERENCES_KEY]);
  let preferences = DEFAULT_PUSH_PREFERENCES;
  try { preferences = { ...DEFAULT_PUSH_PREFERENCES, ...JSON.parse(values[2][1] || "{}") }; } catch { /* defaults */ }
  return {
    enabled: values[0][1] === "true",
    token: values[1][1] || null,
    preferences,
  };
}
