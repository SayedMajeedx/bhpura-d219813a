import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const KEY = "pura.notifications.state.v1";
export type PushState = { enabled: boolean; orders: boolean; marketing: boolean; token: string | null };
export const DEFAULT_PUSH_STATE: PushState = { enabled: true, orders: true, marketing: false, token: null };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true,
  }),
});

async function channels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("pura-orders", {
    name: "تحديثات الطلبات", importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250], lightColor: "#330A0A", sound: "default",
  });
  await Notifications.setNotificationChannelAsync("pura-offers", {
    name: "عروض Pura Line", importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#330A0A", sound: "default",
  });
}

export async function loadPushState(): Promise<PushState> {
  try { return { ...DEFAULT_PUSH_STATE, ...JSON.parse((await AsyncStorage.getItem(KEY)) || "{}") }; }
  catch { return DEFAULT_PUSH_STATE; }
}

export async function savePushState(next: PushState) {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function registerForPush(current: PushState): Promise<PushState> {
  if (!Device.isDevice) return current;
  await channels();
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ...current, enabled: false };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || projectId === "REPLACE_WITH_EAS_PROJECT_ID") return current;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const next = { ...current, enabled: true, token };
  await savePushState(next);
  return next;
}
