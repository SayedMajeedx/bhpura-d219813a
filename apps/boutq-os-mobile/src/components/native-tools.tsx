import { CameraView, useCameraPermissions } from "expo-camera";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
const FLOATING_HIDDEN_KEY = "boutq.floating_button.hidden";
const BUTTON_SIZE = 46;

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
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  externalScanner?: boolean;
  onExternalScannerChange?: (open: boolean) => void;
};

export function NativeTools({
  currentUrl,
  onBarcode,
  onShareInvoice,
  onDownloadInvoice,
  onPushRegistration,
  externalOpen,
  onExternalOpenChange,
  externalScanner,
  onExternalScannerChange,
}: NativeToolsProps) {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [floatingHidden, setFloatingHidden] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushPreferences, setPushPreferences] = useState(DEFAULT_PUSH_PREFERENCES);
  const [permission, requestPermission] = useCameraPermissions();

  // Sync external open triggers (from webview postMessage)
  useEffect(() => {
    if (externalOpen !== undefined) {
      setOpen(externalOpen);
    }
  }, [externalOpen]);

  useEffect(() => {
    if (externalScanner) {
      void openScanner();
      onExternalScannerChange?.(false);
    }
  }, [externalScanner]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onExternalOpenChange?.(nextOpen);
  };

  // Draggable floating button animation setup
  const initialX = SCREEN_WIDTH - BUTTON_SIZE - 12;
  const initialY = Math.max(70, insets.top + 60);
  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const isDragging = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => {
          return Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
        },
        onPanResponderGrant: () => {
          isDragging.current = false;
          pan.setOffset({
            x: (pan.x as any)._value,
            y: (pan.y as any)._value,
          });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6) {
            isDragging.current = true;
          }
          pan.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          pan.flattenOffset();
          const curX = (pan.x as any)._value;
          const curY = (pan.y as any)._value;

          // Pure tap without movement opens the modal
          if (!isDragging.current && Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
            handleOpenChange(true);
            return;
          }

          // Bound Y safely above bottom tabs and below notch
          const minY = insets.top + 45;
          const maxY = SCREEN_HEIGHT - insets.bottom - 90;
          const clampedY = Math.min(Math.max(minY, curY), maxY);

          // Snap to the closest horizontal edge (AssistiveTouch style)
          const snapLeft = 10;
          const snapRight = SCREEN_WIDTH - BUTTON_SIZE - 10;
          const targetX = curX < SCREEN_WIDTH / 2 ? snapLeft : snapRight;

          Animated.spring(pan, {
            toValue: { x: targetX, y: clampedY },
            useNativeDriver: false,
            friction: 7,
            tension: 45,
          }).start();
        },
      }),
    [insets.top, insets.bottom, SCREEN_WIDTH, SCREEN_HEIGHT],
  );

  useEffect(() => {
    void Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_KEY),
      SecureStore.getItemAsync(FLOATING_HIDDEN_KEY),
      getStoredNotificationState(),
    ]).then(([biometric, hidden, notifications]) => {
      setBiometricEnabled(biometric === "true");
      setFloatingHidden(hidden === "true");
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

  async function toggleFloatingHidden(nextHidden: boolean) {
    await SecureStore.setItemAsync(FLOATING_HIDDEN_KEY, String(nextHidden));
    setFloatingHidden(nextHidden);
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
    handleOpenChange(false);
    setScannerOpen(true);
  }

  const invoicePage = /\/invoice\//i.test(currentUrl);

  return (
    <>
      {!floatingHidden && (
        <Animated.View
          style={[
            styles.floatingWrapper,
            {
              transform: pan.getTranslateTransform(),
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.floatingButton} accessibilityLabel="أدوات Boutq OS">
            <Ionicons name="shield-checkmark-outline" size={22} color="#FFFFFF" />
            {notificationsEnabled && <View style={styles.floatingActiveDot} />}
          </View>
        </Animated.View>
      )}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => handleOpenChange(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => handleOpenChange(false)}>
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

            <View style={styles.settingRow}>
              <Switch
                value={!floatingHidden}
                onValueChange={(visible) => void toggleFloatingHidden(!visible)}
                trackColor={{ true: colors.brand }}
              />
              <View style={styles.copy}>
                <Text style={styles.label}>الزر العائم على الشاشة</Text>
                <Text style={styles.hint}>يمكنك سحبه لأي زاوية أو فتحه من قائمة المتجر</Text>
              </View>
            </View>

            <Pressable style={styles.action} onPress={() => void openScanner()}>
              <Text style={styles.actionText}>مسح باركود منتج</Text>
            </Pressable>

            <Pressable
              style={[styles.action, !invoicePage && styles.actionDisabled]}
              disabled={!invoicePage}
              onPress={() => {
                handleOpenChange(false);
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
                handleOpenChange(false);
                onDownloadInvoice();
              }}
            >
              <Text style={styles.actionText}>
                {invoicePage ? "تنزيل الفاتورة PDF" : "افتح فاتورة لتنزيلها"}
              </Text>
            </Pressable>

            <Pressable style={styles.close} onPress={() => handleOpenChange(false)}>
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
  floatingWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 999,
  },
  floatingButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  floatingActiveDot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#10B981",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
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
  preferencesBox: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 6,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  preferenceLabel: {
    flex: 1,
    marginLeft: 16,
    textAlign: "right",
    writingDirection: "rtl",
    color: colors.text,
    fontWeight: "700",
  },
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
