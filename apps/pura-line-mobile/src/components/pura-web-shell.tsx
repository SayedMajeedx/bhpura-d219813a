import NetInfo from "@react-native-community/netinfo";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview/lib/WebViewTypes";
import {
  loadPushState,
  registerForPush,
  savePushState,
  type PushState,
} from "../lib/notifications";

const STORE_URL = process.env.EXPO_PUBLIC_STOREFRONT_URL || "https://pura.boutq.store";
const BRAND = process.env.EXPO_PUBLIC_BRAND_COLOR || "#330A0A";
const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || "Pura Line";
const BRAND_SLUG = process.env.EXPO_PUBLIC_BRAND_SLUG || "pura";
const BRAND_CARD = "rgba(253, 231, 201, 0.08)";
const BRAND_BORDER = "rgba(253, 231, 201, 0.16)";
const GOLD = "#FDE7C9";
const GOLD_MUTED = "#D4BC9B";

const INJECTED_VIEWPORT_LOCK = `
(function() {
  function applyViewportLock() {
    var lockStyle = document.getElementById('pura-viewport-lock');
    if (!lockStyle) {
      lockStyle = document.createElement('style');
      lockStyle.id = 'pura-viewport-lock';
      lockStyle.innerHTML = 'html, body, .storefront-shell { overflow-x: hidden !important; max-width: 100vw !important; width: 100% !important; touch-action: pan-y pinch-zoom; }';
      (document.head || document.documentElement).appendChild(lockStyle);
    }
  }

  applyViewportLock();
  if (!window.__puraLockInjected) {
    window.__puraLockInjected = true;
    if (window.MutationObserver) {
      var observer = new MutationObserver(applyViewportLock);
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('popstate', applyViewportLock);
  }
  true;
})();
`;

function trusted(raw: string) {
  if (raw === "about:blank") return true;
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      (url.hostname === "boutq.store" || url.hostname.endsWith(".boutq.store"))
    );
  } catch {
    return false;
  }
}

export function PuraWebShell() {
  const web = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [settings, setSettings] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);

  const syncPush = useCallback((state: PushState) => {
    if (!state.token) return;
    const detail = JSON.stringify({
      token: state.token,
      enabled: state.enabled,
      orders: state.orders,
      marketing: state.marketing,
      platform: Platform.OS,
      brandSlug: BRAND_SLUG,
      tokenProvider: Platform.OS === "ios" ? "apns" : "fcm",
    });
    web.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('boutq-store:native-push',{detail:${detail}}));true;`,
    );
  }, []);

  useEffect(() => {
    void loadPushState().then(async (state) => {
      const next = await registerForPush(state);
      setPush(next);
    });
    return NetInfo.addEventListener((state) => {
      setConnected(state.isConnected);
      if (state.isConnected) setFailed(false);
    });
  }, []);

  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const url = event.notification.request.content.data?.url;
      if (typeof url === "string" && trusted(url))
        web.current?.injectJavaScript(`window.location.href=${JSON.stringify(url)};true;`);
    });
    return () => response.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => back.remove();
  }, [canGoBack]);

  const updatePush = async (patch: Partial<PushState>) => {
    if (!push) return;
    let next = { ...push, ...patch };
    if (next.enabled && !next.token) next = await registerForPush(next);
    await savePushState(next);
    setPush(next);
    syncPush(next);
  };

  const openExternal = async (url: string) => {
    if (/^https?:/.test(url)) await WebBrowser.openBrowserAsync(url);
    else if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  };

  const offline = connected === false;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <WebView
        key={reloadKey}
        ref={web}
        source={{ uri: STORE_URL }}
        style={styles.web}
        injectedJavaScript={INJECTED_VIEWPORT_LOCK}
        originWhitelist={["https://*", "about:blank"]}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        pullToRefreshEnabled={Platform.OS === "android"}
        showsHorizontalScrollIndicator={false}
        scalesPageToFit={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        applicationNameForUserAgent="PuraLineApp/1.0"
        onShouldStartLoadWithRequest={(request: WebViewNavigation) => {
          if (trusted(request.url)) return true;
          void openExternal(request.url);
          return false;
        }}
        onNavigationStateChange={(state) => {
          setCanGoBack(state.canGoBack);
          web.current?.injectJavaScript(INJECTED_VIEWPORT_LOCK);
        }}
        onLoadStart={() => {
          setFailed(false);
          setProgress(0.05);
        }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadEnd={() => {
          setProgress(1);
          web.current?.injectJavaScript(INJECTED_VIEWPORT_LOCK);
          if (push) syncPush(push);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data?.type === "OPEN_NOTIFICATIONS") {
              setSettings(true);
            }
          } catch {}
        }}
        onError={() => setFailed(true)}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setFailed(true);
        }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        onRenderProcessGone={() => {
          setReloadKey((v) => v + 1);
          return true;
        }}
      />
      {!failed && !offline && progress > 0 && progress < 1 ? (
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${Math.max(5, progress * 100)}%` }]} />
        </View>
      ) : null}
      {progress === 0 && !failed && !offline ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : null}
      {failed || offline ? (
        <View style={styles.overlay}>
          <Text style={styles.title}>
            {offline ? "لا يوجد اتصال بالإنترنت" : `تعذر فتح متجر ${APP_NAME}`}
          </Text>
          <Text style={styles.message}>تحقق من الاتصال ثم حاول مرة ثانية.</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setFailed(false);
              setProgress(0);
              setReloadKey((v) => v + 1);
            }}
          >
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : null}
      <Modal
        visible={settings}
        transparent
        animationType="slide"
        onRequestClose={() => setSettings(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setSettings(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>إعدادات الإشعارات</Text>
            <Text style={styles.sheetSubtitle}>تخصيص التنبيهات الخاصة بمتجر {APP_NAME}</Text>
          </View>

          <View style={styles.cardContainer}>
            {/* Toggle 1: All Notifications */}
            <View style={styles.row}>
              <View style={styles.textColumn}>
                <Text style={styles.rowTitle}>تفعيل الإشعارات</Text>
                <Text style={styles.rowHint}>السماح للتطبيق باستقبال التنبيهات المباشرة</Text>
              </View>
              <Switch
                value={push?.enabled ?? false}
                onValueChange={(value) => void updatePush({ enabled: value })}
                trackColor={{ true: GOLD, false: "#4A1C1C" }}
                thumbColor={push?.enabled ? "#FFFFFF" : "#A69292"}
                ios_backgroundColor="#4A1C1C"
              />
            </View>

            {/* Toggle 2: Order Status */}
            <View style={styles.row}>
              <View style={styles.textColumn}>
                <Text style={[styles.rowTitle, !push?.enabled && styles.disabledText]}>
                  تحديثات طلباتي
                </Text>
                <Text style={[styles.rowHint, !push?.enabled && styles.disabledHint]}>
                  تنبيهات الدفع، التجهيز، الشحن والتسليم
                </Text>
              </View>
              <Switch
                disabled={!push?.enabled}
                value={push?.orders ?? true}
                onValueChange={(value) => void updatePush({ orders: value })}
                trackColor={{ true: GOLD, false: "#4A1C1C" }}
                thumbColor={push?.orders && push?.enabled ? "#FFFFFF" : "#A69292"}
                ios_backgroundColor="#4A1C1C"
              />
            </View>

            {/* Toggle 3: Offers & News */}
            <View style={[styles.row, styles.lastRow]}>
              <View style={styles.textColumn}>
                <Text style={[styles.rowTitle, !push?.enabled && styles.disabledText]}>
                  العروض والمنتجات الحصرية
                </Text>
                <Text style={[styles.rowHint, !push?.enabled && styles.disabledHint]}>
                  إشعارك فور إطلاق الكولكشن والتخفيضات
                </Text>
              </View>
              <Switch
                disabled={!push?.enabled}
                value={push?.marketing ?? false}
                onValueChange={(value) => void updatePush({ marketing: value })}
                trackColor={{ true: GOLD, false: "#4A1C1C" }}
                thumbColor={push?.marketing && push?.enabled ? "#FFFFFF" : "#A69292"}
                ios_backgroundColor="#4A1C1C"
              />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
            onPress={() => setSettings(false)}
          >
            <Text style={styles.doneButtonText}>تم وحفظ</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND },
  web: { flex: 1, backgroundColor: "#FFF9F7" },
  progress: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(253, 231, 201, 0.2)",
  },
  progressFill: { height: 3, backgroundColor: GOLD },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  title: { color: GOLD, fontSize: 21, fontWeight: "800", textAlign: "center" },
  message: { color: "#D1BCA6", fontSize: 15, marginTop: 9, textAlign: "center" },
  retryButton: {
    backgroundColor: GOLD,
    borderRadius: 14,
    minWidth: 150,
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginTop: 22,
  },
  retryButtonText: { color: BRAND, fontWeight: "800", fontSize: 16 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  sheet: {
    backgroundColor: BRAND,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: BRAND_BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(253, 231, 201, 0.35)",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    marginBottom: 18,
    alignItems: "flex-end",
  },
  sheetTitle: {
    color: GOLD,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "right",
  },
  sheetSubtitle: {
    color: GOLD_MUTED,
    fontSize: 13,
    marginTop: 4,
    textAlign: "right",
  },
  cardContainer: {
    backgroundColor: BRAND_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    minHeight: 74,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BRAND_BORDER,
    gap: 12,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  textColumn: {
    flex: 1,
    paddingRight: 4,
  },
  rowTitle: {
    color: GOLD,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
  },
  rowHint: {
    color: GOLD_MUTED,
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
    lineHeight: 17,
  },
  disabledText: {
    color: "rgba(253, 231, 201, 0.4)",
  },
  disabledHint: {
    color: "rgba(212, 188, 155, 0.3)",
  },
  doneButton: {
    backgroundColor: GOLD,
    borderRadius: 16,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  doneButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  doneButtonText: {
    color: BRAND,
    fontWeight: "900",
    fontSize: 16,
  },
});
