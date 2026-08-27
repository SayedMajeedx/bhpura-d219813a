import { CameraView, useCameraPermissions } from "expo-camera";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { colors } from "../theme";
import {
  disablePushNotifications,
  DEFAULT_PUSH_PREFERENCES,
  enablePushNotifications,
  getStoredNotificationState,
  savePushPreferences,
  type PushPreferences,
} from "../lib/notifications";

const BIOMETRIC_KEY = "boutq.biometric.enabled";

export async function authenticateAppIfEnabled() {
  const enabled = (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === "true";
  if (!enabled) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "الدخول إلى Boutq OS",
    cancelLabel: "إلغاء",
    fallbackLabel: "استخدام رمز الجهاز",
    disableDeviceFallback: false,
  });
  return result.success;
}

type NativeToolsProps = {
  currentUrl: string;
  onBarcode: (value: string) => void;
  onShareInvoice: () => Promise<void>;
  onDownloadInvoice: () => void;
  onPushRegistration: (token: string, enabled: boolean, preferences: PushPreferences) => void;
};

export function NativeTools({
  currentUrl,
  onBarcode,
  onShareInvoice,
  onDownloadInvoice,
  onPushRegistration,
}: NativeToolsProps) {
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushPreferences, setPushPreferences] = useState(DEFAULT_PUSH_PREFERENCES);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    void Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_KEY),
      getStoredNotificationState(),
    ]).then(([biometric, notifications]) => {
      setBiometricEnabled(biometric === "true");
      setNotificationsEnabled(notifications.enabled);
      setPushToken(notifications.token);
      setPushPreferences(notifications.preferences);
      if (notifications.enabled && notifications.token) {
        onPushRegistration(notifications.token, true, notifications.preferences);
      }
    });
  }, []);

  async function toggleBiometric(next: boolean) {
    if (next) {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        Alert.alert("البصمة غير متاحة", "فعّل Face ID أو البصمة من إعدادات الجهاز أولاً.");
        return;
      }
      const accepted = await LocalAuthentication.authenticateAsync({
        promptMessage: "تفعيل الدخول بالبصمة",
        disableDeviceFallback: false,
      });
      if (!accepted.success) return;
    }
    await SecureStore.setItemAsync(BIOMETRIC_KEY, String(next));
    setBiometricEnabled(next);
  }

  async function toggleNotifications(next: boolean) {
    if (notificationBusy) return;
    setNotificationBusy(true);
    try {
      if (next) {
        const token = await enablePushNotifications();
        setPushToken(token);
        setNotificationsEnabled(true);
        onPushRegistration(token, true, pushPreferences);
        await Clipboard.setStringAsync(token);
        Alert.alert("تم تشغيل الإشعارات", "تم تسجيل هذا الجهاز ونسخ رمز الاختبار تلقائياً.");
      } else {
        await disablePushNotifications();
        setNotificationsEnabled(false);
        if (pushToken) onPushRegistration(pushToken, false, pushPreferences);
        Alert.alert("تم إيقاف الإشعارات", "لن يسجل التطبيق هذا الجهاز لاستقبال تنبيهات جديدة.");
      }
    } catch (cause) {
      Alert.alert(
        "تعذر تشغيل الإشعارات",
        cause instanceof Error ? cause.message : "حاول مرة أخرى بعد قليل.",
      );
    } finally {
      setNotificationBusy(false);
    }
  }

  async function togglePushPreference(key: string, value: boolean) {
    const next = { ...pushPreferences, [key]: value };
    setPushPreferences(next);
    await savePushPreferences(next);
    if (pushToken) onPushRegistration(pushToken, notificationsEnabled, next);
  }

  async function openScanner() {
    const cameraPermission = permission?.granted ? permission : await requestPermission();
    if (!cameraPermission.granted) {
      Alert.alert("الكاميرا مطلوبة", "اسمح باستخدام الكاميرا لمسح الباركود.");
      return;
    }
    setOpen(false);
    setScannerOpen(true);
  }

  const invoicePage = /\/invoice\//i.test(currentUrl);

  return (
    <>
      <Pressable
        accessibilityLabel="أدوات التطبيق"
        style={styles.floatingButton}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.floatingIcon}>+</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>أدوات Boutq OS</Text>
            <View style={styles.settingRow}>
              <Switch
                value={notificationsEnabled}
                disabled={notificationBusy}
                onValueChange={(value) => void toggleNotifications(value)}
                trackColor={{ true: colors.brand }}
              />
              <View style={styles.copy}>
                <Text style={styles.label}>الإشعارات</Text>
                <Text style={styles.hint}>طلبات وتحديثات النظام</Text>
              </View>
            </View>
            {notificationsEnabled ? (
              <View style={styles.preferencesBox}>
                {[
                  ["order_new", "الطلبات الجديدة"],
                  ["order_updated", "تحديثات الطلبات"],
                  ["review_due", "موعد طلب التقييم"],
                  ["review_completed", "التقييمات المكتملة"],
                  ["low_stock", "انخفاض المخزون"],
                  ["system_failure", "أخطاء النظام"],
                ].map(([key, label]) => (
                  <View style={styles.preferenceRow} key={key}>
                    <Switch
                      value={pushPreferences[key] !== false}
                      onValueChange={(value) => void togglePushPreference(key, value)}
                      trackColor={{ true: colors.brand }}
                    />
                    <Text style={styles.preferenceLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.settingRow}>
              <Switch
                value={biometricEnabled}
                onValueChange={(value) => void toggleBiometric(value)}
                trackColor={{ true: colors.brand }}
              />
              <View style={styles.copy}>
                <Text style={styles.label}>Face ID / البصمة</Text>
                <Text style={styles.hint}>قفل التطبيق عند فتحه</Text>
              </View>
            </View>
            <Pressable style={styles.action} onPress={() => void openScanner()}>
              <Text style={styles.actionText}>مسح باركود منتج</Text>
            </Pressable>
            <Pressable
              style={[styles.action, !invoicePage && styles.actionDisabled]}
              disabled={!invoicePage}
              onPress={() => {
                setOpen(false);
                void onShareInvoice();
              }}
            >
              <Text style={styles.actionText}>
                {invoicePage ? "مشاركة الفاتورة" : "افتح فاتورة لمشاركتها"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.action, !invoicePage && styles.actionDisabled]}
              disabled={!invoicePage}
              onPress={() => {
                setOpen(false);
                onDownloadInvoice();
              }}
            >
              <Text style={styles.actionText}>
                {invoicePage ? "تنزيل الفاتورة PDF" : "افتح فاتورة لتنزيلها"}
              </Text>
            </Pressable>
            <Pressable style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>إغلاق</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.scannerRoot}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
            }}
            onBarcodeScanned={({ data }) => {
              setScannerOpen(false);
              onBarcode(data);
            }}
          />
          <View style={styles.scannerFrame} />
          <Text style={styles.scannerHint}>وجّه الكاميرا نحو الباركود</Text>
          <Pressable style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
            <Text style={styles.actionText}>إلغاء</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: "absolute",
    right: 18,
    bottom: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  floatingIcon: { color: "#fff", fontSize: 30, lineHeight: 32, fontWeight: "300" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    paddingBottom: 34,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 18,
  },
  title: {
    textAlign: "right",
    writingDirection: "rtl",
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  copy: { flex: 1, marginLeft: 16 },
  label: {
    textAlign: "right",
    writingDirection: "rtl",
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  hint: { textAlign: "right", writingDirection: "rtl", color: colors.textMuted, marginTop: 3 },
  preferencesBox: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 6 },
  preferenceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7 },
  preferenceLabel: { flex: 1, marginLeft: 16, textAlign: "right", writingDirection: "rtl", color: colors.text, fontWeight: "700" },
  action: { backgroundColor: colors.brand, padding: 15, borderRadius: 14, marginTop: 14 },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: "#fff", textAlign: "center", fontSize: 16, fontWeight: "800" },
  close: { padding: 14, marginTop: 6 },
  closeText: { color: colors.brand, textAlign: "center", fontSize: 16, fontWeight: "800" },
  scannerRoot: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  scannerFrame: {
    width: "78%",
    height: 190,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 20,
  },
  scannerHint: { position: "absolute", top: 80, color: "#fff", fontSize: 18, fontWeight: "800" },
  scannerClose: {
    position: "absolute",
    bottom: 50,
    minWidth: 160,
    backgroundColor: colors.brand,
    padding: 15,
    borderRadius: 14,
  },
});
