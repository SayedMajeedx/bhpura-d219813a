import NetInfo from "@react-native-community/netinfo";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
} from "react-native-webview/lib/WebViewTypes";
import { colors } from "../theme";
import { authenticateAppIfEnabled, NativeTools } from "./native-tools";
import type { PushPreferences } from "../lib/notifications";
import * as Notifications from "expo-notifications";

const ADMIN_URL = process.env.EXPO_PUBLIC_BOUTQ_ADMIN_URL?.trim() || "https://boutq.store/admin";

function isTrustedBoutqUrl(rawUrl: string) {
  if (rawUrl === "about:blank") return true;
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "boutq.store" || url.hostname.endsWith(".boutq.store"))
    );
  } catch {
    return false;
  }
}

async function openOutsideApp(rawUrl: string) {
  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      await WebBrowser.openBrowserAsync(rawUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      return;
    }
    if (await Linking.canOpenURL(rawUrl)) await Linking.openURL(rawUrl);
  } catch {
    // Keep the admin usable if the device has no app for an external scheme.
  }
}

type FailureState = { title: string; message: string };

export function BoutqWebShell() {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [progress, setProgress] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [currentUrl, setCurrentUrl] = useState(ADMIN_URL);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [nativeToolsOpen, setNativeToolsOpen] = useState(false);
  const [nativeScannerOpen, setNativeScannerOpen] = useState(false);

  const unlock = useCallback(() => {
    void authenticateAppIfEnabled().then(setUnlocked);
  }, []);

  useEffect(() => unlock(), [unlock]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && isTrustedBoutqUrl(url)) {
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(url)};true;`);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setIsConnected(state.isConnected);
        if (state.isConnected) setFailure(null);
      }),
    [],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const retry = useCallback(() => {
    setFailure(null);
    setProgress(0);
    setReloadKey((current) => current + 1);
  }, []);

  const handleNavigation = useCallback((request: WebViewNavigation) => {
    if (isTrustedBoutqUrl(request.url)) return true;
    void openOutsideApp(request.url);
    return false;
  }, []);

  const handleOpenWindow = useCallback((event: WebViewOpenWindowEvent) => {
    if (event.nativeEvent.targetUrl) void openOutsideApp(event.nativeEvent.targetUrl);
  }, []);

  const handleNavigationState = useCallback((navigation: WebViewNavigation) => {
    setCanGoBack(navigation.canGoBack);
    setCurrentUrl(navigation.url);
  }, []);

  const handleError = useCallback((_event: WebViewErrorEvent) => {
    setFailure({
      title: "تعذر فتح Boutq OS",
      message: "تأكد من اتصال الإنترنت ثم حاول مرة ثانية.",
    });
  }, []);

  const offline = isConnected === false;
  const showProgress = !failure && !offline && progress > 0 && progress < 1;

  const handleBarcode = useCallback((barcode: string) => {
    const encoded = JSON.stringify(barcode);
    webViewRef.current?.injectJavaScript(`
      (() => {
        const barcode = ${encoded};
        window.dispatchEvent(new CustomEvent('boutq:native-barcode', { detail: { barcode } }));
        const fields = [...document.querySelectorAll('input')];
        const field = fields.find((input) => /barcode|باركود|بحث|search/i.test(
          [input.name, input.id, input.placeholder, input.getAttribute('aria-label')].filter(Boolean).join(' ')
        ));
        if (field) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(field, barcode);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
          field.focus();
        }
        true;
      })();
    `);
  }, []);

  const shareInvoice = useCallback(async () => {
    await Share.share({
      title: "فاتورة Boutq",
      message: `فاتورة Boutq\n${currentUrl}`,
      url: currentUrl,
    });
  }, [currentUrl]);

  const downloadInvoice = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (() => {
        const controls = [...document.querySelectorAll('button, a')];
        const download = controls.find((element) => /(?:تحميل|تنزيل|download).*pdf|pdf.*(?:تحميل|تنزيل|download)/i.test(element.textContent || ''));
        if (download) download.click();
        true;
      })();
    `);
  }, []);

  const registerPushDevice = useCallback((token: string, enabled: boolean, preferences: PushPreferences) => {
    const detail = JSON.stringify({ token, enabled, preferences, platform: Platform.OS });
    webViewRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('boutq:native-push',{detail:${detail}}));true;`);
  }, []);

  if (unlocked !== true) {
    return (
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        {unlocked === null ? (
          <ActivityIndicator color={colors.brand} size="large" />
        ) : (
          <View style={styles.errorCard}>
            <View style={styles.logoMark}>
              <Text style={styles.logoText}>B</Text>
            </View>
            <Text style={styles.errorTitle}>Boutq OS مقفل</Text>
            <Text style={styles.errorMessage}>استخدم Face ID أو بصمة الجهاز للدخول.</Text>
            <Pressable style={styles.retryButton} onPress={unlock}>
              <Text style={styles.retryText}>فتح التطبيق</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ uri: ADMIN_URL }}
        style={styles.webView}
        originWhitelist={["https://*", "about:blank"]}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        pullToRefreshEnabled={Platform.OS === "android"}
        setSupportMultipleWindows={false}
        applicationNameForUserAgent="BoutqOS/1.0"
        onShouldStartLoadWithRequest={handleNavigation}
        onNavigationStateChange={handleNavigationState}
        onOpenWindow={handleOpenWindow}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (
              data?.type === "OPEN_NATIVE_TOOLS" ||
              data?.type === "OPEN_NOTIFICATIONS" ||
              data?.type === "OPEN_BIOMETRIC" ||
              data?.type === "OPEN_PASSKEY"
            ) {
              setNativeToolsOpen(true);
            } else if (data?.type === "OPEN_SCANNER") {
              setNativeScannerOpen(true);
            } else if (data?.type === "SHARE_INVOICE") {
              void shareInvoice();
            } else if (data?.type === "DOWNLOAD_INVOICE") {
              downloadInvoice();
            }
          } catch {}
        }}
        onLoadStart={() => {
          setFailure(null);
          setProgress(0.05);
        }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadEnd={() => setProgress(1)}
        onError={handleError}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500)
            setFailure({ title: "الخدمة غير متاحة مؤقتاً", message: "حاول مرة ثانية بعد قليل." });
        }}
        onContentProcessDidTerminate={() => webViewRef.current?.reload()}
        onRenderProcessGone={() => {
          retry();
          return true;
        }}
      />
      {showProgress ? (
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressValue, { width: `${Math.max(5, progress * 100)}%` }]} />
        </View>
      ) : null}
      {offline || failure ? (
        <View style={styles.overlay}>
          <View style={styles.errorCard}>
            <View style={styles.logoMark}>
              <Text style={styles.logoText}>B</Text>
            </View>
            <Text style={styles.errorTitle}>
              {offline ? "لا يوجد اتصال بالإنترنت" : failure?.title}
            </Text>
            <Text style={styles.errorMessage}>
              {offline ? "أعد الاتصال بالإنترنت ثم اضغط إعادة المحاولة." : failure?.message}
            </Text>
            <Pressable style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {progress === 0 && !offline && !failure ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : null}
      {!offline && !failure ? (
        <NativeTools
          currentUrl={currentUrl}
          onBarcode={handleBarcode}
          onShareInvoice={shareInvoice}
          onDownloadInvoice={downloadInvoice}
          onPushRegistration={registerPushDevice}
          externalOpen={nativeToolsOpen}
          onExternalOpenChange={setNativeToolsOpen}
          externalScanner={nativeScannerOpen}
          onExternalScannerChange={setNativeScannerOpen}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  webView: { flex: 1, backgroundColor: colors.bg },
  progressTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.brandSoft,
  },
  progressValue: { height: 3, backgroundColor: colors.brand },
  loading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  errorCard: { width: "100%", maxWidth: 390, alignItems: "center" },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    backgroundColor: colors.brand,
  },
  logoText: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  errorTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    writingDirection: "rtl",
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: 10,
  },
  retryButton: {
    minWidth: 170,
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 24,
    backgroundColor: colors.brand,
  },
  retryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
