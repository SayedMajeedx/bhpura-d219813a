import NetInfo from "@react-native-community/netinfo";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview/lib/WebViewTypes";
import { loadPushState, registerForPush, savePushState, type PushState } from "../lib/notifications";

const STORE_URL = "https://pura.boutq.store";
const BRAND = "#330A0A";
const GOLD = "#fde7c9";

const INJECTED_HEADER_BELL = `
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

  function injectBell() {
    applyViewportLock();
    if (document.getElementById('pura-native-bell-btn')) return;
    var actions = document.querySelector('header .flex.items-center.gap-1, header .flex.items-center.gap-2, header .flex.items-center.shrink-0');
    if (!actions) return;

    var btn = document.createElement('button');
    btn.id = 'pura-native-bell-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'إعدادات الإشعارات');
    btn.className = 'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium cursor-pointer transition-[transform,colors,box-shadow] duration-150 active:scale-[0.97] focus-visible:outline-none h-8 px-2 text-xs min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none';
    btn.style.color = 'inherit';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell h-5 w-5" style="width:20px;height:20px;"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg><span class="hidden sm:inline">الإشعارات</span>';
    
    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_NOTIFICATIONS' }));
      }
    };
    
    actions.insertBefore(btn, actions.firstChild);
  }

  injectBell();
  if (!window.__puraBellInjected) {
    window.__puraBellInjected = true;
    if (window.MutationObserver) {
      var observer = new MutationObserver(injectBell);
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('popstate', injectBell);
  }
  true;
})();
`;

function trusted(raw: string) {
  if (raw === "about:blank") return true;
  try { const url = new URL(raw); return url.protocol === "https:" && (url.hostname === "boutq.store" || url.hostname.endsWith(".boutq.store")); }
  catch { return false; }
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
    const detail = JSON.stringify({ token: state.token, enabled: state.enabled, orders: state.orders, marketing: state.marketing, platform: Platform.OS });
    web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('pura:native-push',{detail:${detail}}));true;`);
  }, []);

  useEffect(() => {
    void loadPushState().then(async (state) => { const next = await registerForPush(state); setPush(next); });
    return NetInfo.addEventListener((state) => { setConnected(state.isConnected); if (state.isConnected) setFailed(false); });
  }, []);

  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const url = event.notification.request.content.data?.url;
      if (typeof url === "string" && trusted(url)) web.current?.injectJavaScript(`window.location.href=${JSON.stringify(url)};true;`);
    });
    return () => response.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => { if (!canGoBack) return false; web.current?.goBack(); return true; });
    return () => back.remove();
  }, [canGoBack]);

  const updatePush = async (patch: Partial<PushState>) => {
    if (!push) return;
    let next = { ...push, ...patch };
    if (next.enabled && !next.token) next = await registerForPush(next);
    await savePushState(next); setPush(next); syncPush(next);
  };

  const openExternal = async (url: string) => {
    if (/^https?:/.test(url)) await WebBrowser.openBrowserAsync(url);
    else if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  };

  const offline = connected === false;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <WebView
        key={reloadKey} ref={web} source={{ uri: STORE_URL }} style={styles.web}
        injectedJavaScript={INJECTED_HEADER_BELL}
        originWhitelist={["https://*", "about:blank"]} javaScriptEnabled domStorageEnabled
        sharedCookiesEnabled thirdPartyCookiesEnabled pullToRefreshEnabled={Platform.OS === "android"}
        showsHorizontalScrollIndicator={false}
        scalesPageToFit={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures setSupportMultipleWindows={false}
        applicationNameForUserAgent="PuraLineApp/1.0"
        onShouldStartLoadWithRequest={(request: WebViewNavigation) => { if (trusted(request.url)) return true; void openExternal(request.url); return false; }}
        onNavigationStateChange={(state) => {
          setCanGoBack(state.canGoBack);
          web.current?.injectJavaScript(INJECTED_HEADER_BELL);
        }}
        onLoadStart={() => { setFailed(false); setProgress(0.05); }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadEnd={() => {
          setProgress(1);
          web.current?.injectJavaScript(INJECTED_HEADER_BELL);
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
        onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 500) setFailed(true); }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        onRenderProcessGone={() => { setReloadKey((v) => v + 1); return true; }}
      />
      {!failed && !offline && progress > 0 && progress < 1 ? (
        <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.max(5, progress * 100)}%` }]} /></View>
      ) : null}
      {progress === 0 && !failed && !offline ? (
        <View style={styles.overlay}><ActivityIndicator size="large" color={GOLD} /></View>
      ) : null}
      {failed || offline ? (
        <View style={styles.overlay}>
          <Text style={styles.title}>{offline ? "لا يوجد اتصال بالإنترنت" : "تعذر فتح متجر Pura Line"}</Text>
          <Text style={styles.message}>تحقق من الاتصال ثم حاول مرة ثانية.</Text>
          <Pressable style={styles.button} onPress={() => { setFailed(false); setProgress(0); setReloadKey((v) => v + 1); }}>
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : null}
      <Modal visible={settings} transparent animationType="slide" onRequestClose={() => setSettings(false)}>
        <Pressable style={styles.scrim} onPress={() => setSettings(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
          <Text style={styles.sheetTitle}>إشعارات Pura Line</Text>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>تشغيل الإشعارات</Text>
              <Text style={styles.rowHint}>السماح للتطبيق باستقبال التنبيهات</Text>
            </View>
            <Switch
              value={push?.enabled ?? false}
              onValueChange={(value) => void updatePush({ enabled: value })}
              trackColor={{ true: GOLD, false: "#502020" }}
              thumbColor={push?.enabled ? BRAND : "#8E7575"}
            />
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>تحديثات طلباتي</Text>
              <Text style={styles.rowHint}>الدفع والتجهيز والتوصيل والاستلام</Text>
            </View>
            <Switch
              disabled={!push?.enabled}
              value={push?.orders ?? true}
              onValueChange={(value) => void updatePush({ orders: value })}
              trackColor={{ true: GOLD, false: "#502020" }}
              thumbColor={push?.orders ? BRAND : "#8E7575"}
            />
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>العروض والأخبار</Text>
              <Text style={styles.rowHint}>يمكن إيقافها في أي وقت</Text>
            </View>
            <Switch
              disabled={!push?.enabled}
              value={push?.marketing ?? false}
              onValueChange={(value) => void updatePush({ marketing: value })}
              trackColor={{ true: GOLD, false: "#502020" }}
              thumbColor={push?.marketing ? BRAND : "#8E7575"}
            />
          </View>
          <Pressable style={styles.button} onPress={() => setSettings(false)}>
            <Text style={styles.buttonText}>تم</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND },
  web: { flex: 1, backgroundColor: "#FFF9F7" },
  progress: { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: "rgba(253, 231, 201, 0.2)" },
  progressFill: { height: 3, backgroundColor: GOLD },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND, alignItems: "center", justifyContent: "center", padding: 28 },
  title: { color: GOLD, fontSize: 21, fontWeight: "800", textAlign: "center" },
  message: { color: "#D1BCA6", fontSize: 15, marginTop: 9, textAlign: "center" },
  button: { backgroundColor: GOLD, borderRadius: 14, minWidth: 150, alignItems: "center", paddingVertical: 13, paddingHorizontal: 24, marginTop: 22 },
  buttonText: { color: BRAND, fontWeight: "800", fontSize: 16 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: BRAND,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    borderTopWidth: 1,
    borderColor: "rgba(253, 231, 201, 0.2)"
  },
  sheetTitle: { color: GOLD, fontSize: 21, fontWeight: "900", textAlign: "right", marginBottom: 14 },
  row: {
    minHeight: 72,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(253, 231, 201, 0.15)",
    gap: 14
  },
  rowTitle: { color: GOLD, fontSize: 16, fontWeight: "800", textAlign: "right" },
  rowHint: { color: "#C8B49E", fontSize: 12, marginTop: 3, textAlign: "right" },
});
