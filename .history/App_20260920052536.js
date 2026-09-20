import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
  Share,
  Linking,
  PermissionsAndroid,
} from "react-native";
import { WebView } from "react-native-webview";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

async function ensureMicrophonePermission() {
  if (Platform.OS !== "android") {
    // iOS prompts via NSMicrophoneUsageDescription when WebView requests mic.
    return true;
  }

  try {
    const existing = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (existing) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: "Microphone permission",
        message:
          "LittleKart needs microphone access so you can search products by voice.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn("Microphone permission request failed:", error);
    return false;
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef(null);
  const navStateRef = useRef({ canGoBack: false, url: "" });
  const loadTimeoutRef = useRef(null);
  const insets = useSafeAreaInsets();
  const USE_LOCAL_WEB_URL = false;
  const PROD_WEB_URL = "https://littlekart.com";
  const LOCAL_WEB_URL = Platform.select({
    android: "http://10.0.2.2:3000",
    ios: "http://192.168.1.200:3000",
    default: "http://192.168.1.253:3000",
  });
  // Dynamic cache-buster generated once per app launch.
  const WEB_RELEASE_VERSION = useRef(`${Date.now()}`).current;

  const appendReleaseVersion = (url, version) => {
    if (!version) return url;
    const [base, hash = ""] = url.split("#");
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}v=${encodeURIComponent(version)}${
      hash ? `#${hash}` : ""
    }`;
  };

  const baseWebUrl = USE_LOCAL_WEB_URL ? LOCAL_WEB_URL : PROD_WEB_URL;
  // Keep cache-busting for production web deploys.
  const webUrl = USE_LOCAL_WEB_URL
    ? baseWebUrl
    : appendReleaseVersion(baseWebUrl, WEB_RELEASE_VERSION);
  const webviewInjectedJavaScript =
    USE_LOCAL_WEB_URL || __DEV__
      ? `
          (function () {
            var modalSelectors = [
              '[role="dialog"]',
              '.modal.show',
              '.modal.open',
              '.ReactModal__Overlay--after-open',
              '.MuiModal-root',
              '.chakra-modal__content-container',
              '[data-state="open"][data-dialog-content]',
              '.razorpay-container',
              '.razorpay-checkout-frame',
              '.razorpay-backdrop',
              'iframe[src*="razorpay"]',
              'iframe[src*="checkout"]',
              '[class*="razorpay"]',
              '[id*="razorpay"]'
            ];
            var lockClasses = [
              'modal-open',
              'overflow-hidden',
              'no-scroll',
              'scroll-lock',
              'lock-scroll'
            ];
            var backdropSelectors = [
              '.modal-backdrop',
              '.MuiBackdrop-root',
              '.chakra-modal__overlay',
              '.ReactModal__Overlay',
              '[data-radix-portal] > [data-state="closed"]',
              '[data-state="closed"][role="dialog"]'
            ];

            function hasOpenModal() {
              return modalSelectors.some(function (selector) {
                return Array.prototype.some.call(
                  document.querySelectorAll(selector),
                  function (el) {
                    var style = window.getComputedStyle(el);
                    var rect = el.getBoundingClientRect();
                    var ariaHidden = el.getAttribute('aria-hidden') === 'true';
                    var isClosedState = el.getAttribute('data-state') === 'closed';
                    var hiddenByStyle =
                      style.display === 'none' ||
                      style.visibility === 'hidden' ||
                      style.opacity === '0' ||
                      style.pointerEvents === 'none';
                    var hasSize = rect.width > 0 && rect.height > 0;
                    return !ariaHidden && !isClosedState && !hiddenByStyle && hasSize;
                  }
                );
              });
            }

            function resetStyle(el, key) {
              if (!el) return;
              el.style[key] = '';
            }

            function forceEnableScroll(html, body) {
              if (!html || !body) return;
              html.style.setProperty('overflow', 'auto', 'important');
              html.style.setProperty('height', 'auto', 'important');
              html.style.setProperty('touch-action', 'auto', 'important');
              html.style.setProperty('overscroll-behavior', 'auto', 'important');
              body.style.setProperty('overflow', 'auto', 'important');
              body.style.setProperty('overflow-y', 'auto', 'important');
              body.style.setProperty('height', 'auto', 'important');
              body.style.setProperty('touch-action', 'auto', 'important');
              body.style.setProperty('overscroll-behavior', 'auto', 'important');
              body.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
            }

            // Last-resort protection: if modal is not open, do not allow
            // stale listeners to block scroll via preventDefault on touchmove.
            (function patchPreventDefaultForScrollLock() {
              if (window.__rnPreventDefaultPatched) return;
              window.__rnPreventDefaultPatched = true;
              var originalPreventDefault = Event.prototype.preventDefault;
              Event.prototype.preventDefault = function () {
                var type = this && this.type;
                if ((type === 'touchmove' || type === 'wheel') && !hasOpenModal()) {
                  return;
                }
                return originalPreventDefault.apply(this, arguments);
              };
            })();

            function unlockScrollIfSafe() {
              if (hasOpenModal()) return;
              var html = document.documentElement;
              var body = document.body;
              if (!body || !html) return;

              // Some modal libs forget to restore these after close.
              resetStyle(html, 'overflow');
              resetStyle(html, 'position');
              resetStyle(html, 'height');
              resetStyle(html, 'touchAction');
              resetStyle(html, 'overscrollBehavior');
              resetStyle(body, 'overflow');
              resetStyle(body, 'overflowY');
              resetStyle(body, 'position');
              resetStyle(body, 'top');
              resetStyle(body, 'left');
              resetStyle(body, 'right');
              resetStyle(body, 'width');
              resetStyle(body, 'height');
              resetStyle(body, 'touchAction');
              resetStyle(body, 'overscrollBehavior');
              resetStyle(body, 'webkitOverflowScrolling');
              forceEnableScroll(html, body);
              lockClasses.forEach(function (name) {
                html.classList.remove(name);
                body.classList.remove(name);
              });

              backdropSelectors.forEach(function (selector) {
                document.querySelectorAll(selector).forEach(function (el) {
                  var style = window.getComputedStyle(el);
                  var isClosed =
                    el.getAttribute('data-state') === 'closed' ||
                    el.getAttribute('aria-hidden') === 'true' ||
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    style.opacity === '0';
                  if (isClosed) {
                    el.style.pointerEvents = 'none';
                    el.style.display = 'none';
                  }
                });
              });

              // If a full-screen transparent layer is still catching touches, disable it.
              // But NEVER touch payment-related elements (Razorpay, PayU, Paytm, etc.)
              var allEls = document.body.querySelectorAll('*');
              for (var i = 0; i < allEls.length; i++) {
                var el = allEls[i];
                var style = window.getComputedStyle(el);
                if (style.pointerEvents === 'none') continue;
                if (style.position !== 'fixed' && style.position !== 'absolute') continue;
                
                // Skip payment gateway elements
                var elStr = (el.className || '') + (el.id || '') + (el.src || '');
                var isPaymentEl = /razorpay|payu|paytm|checkout|payment/i.test(elStr);
                if (isPaymentEl) continue;
                if (el.tagName === 'IFRAME') continue;
                
                var rect = el.getBoundingClientRect();
                var coversScreen =
                  rect.width >= window.innerWidth * 0.95 &&
                  rect.height >= window.innerHeight * 0.95;
                var visuallyHidden =
                  style.opacity === '0' ||
                  style.visibility === 'hidden' ||
                  style.backgroundColor === 'rgba(0, 0, 0, 0)';
                if (coversScreen && visuallyHidden) {
                  el.style.pointerEvents = 'none';
                }
              }

              // Wake up layout/touch handling after modal teardown.
              window.dispatchEvent(new Event('resize'));
              window.dispatchEvent(new Event('scroll'));
            }

            var scheduled = null;
            function scheduleUnlock() {
              if (scheduled) clearTimeout(scheduled);
              scheduled = setTimeout(unlockScrollIfSafe, 120);
            }

            document.addEventListener('click', scheduleUnlock, true);
            document.addEventListener('touchend', scheduleUnlock, true);
            document.addEventListener('touchstart', scheduleUnlock, true);
            window.addEventListener('popstate', scheduleUnlock);
            window.addEventListener('hashchange', scheduleUnlock);

            var observer = new MutationObserver(scheduleUnlock);
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['class', 'style', 'aria-hidden']
            });

            scheduleUnlock();
            setInterval(unlockScrollIfSafe, 1200);
          })();
          true;
        `
      : undefined;

  /* ===============================
     ANDROID BACK BUTTON HANDLING
  ================================ */
  const normalizeUrl = (url) => {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/+$/, "");
      return `${parsed.origin}${path}`;
    } catch (_) {
      return url.replace(/\/+$/, "");
    }
  };

  const isHomeUrl = (url) => {
    return normalizeUrl(url) === normalizeUrl(webUrl);
  };

  const onMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data ?? "{}");

      if (data?.type === "SHARE_APP") {
        const { title, text, url } = data?.payload || {};
        await Share.share({
          title,
          message: text,
          url,
        });
        return;
      }

      // Web page is about to use getUserMedia / voice search.
      if (data?.type === "REQUEST_MICROPHONE_PERMISSION") {
        const granted = await ensureMicrophonePermission();
        const payload = JSON.stringify({
          type: "MICROPHONE_PERMISSION_RESULT",
          granted,
        });
        webviewRef.current?.injectJavaScript?.(
          `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
            payload
          )} })); true;`
        );
      }
    } catch (_) {
      // Ignore malformed bridge messages
    }
  }, []);

  const handleShouldStartLoadWithRequest = (request) => {
    const url = request.url;

    // Handle external app URLs (phone, email, messaging, payments)
    const externalSchemes = [
      "tel:",
      "mailto:",
      "whatsapp:",
      "upi:",
      "phonepe:",
      "paytm:",
      "gpay:",
      "tez:",
      "bhim:",
      "credpay:",
      "amazonpay:",
      "intent:",
    ];

    const isExternalUrl = externalSchemes.some(scheme => url.startsWith(scheme));

    if (isExternalUrl) {
      Linking.openURL(url).catch(err => {
        console.warn("Failed to open URL:", url, err);
      });
      return false; // Prevent WebView from loading
    }

    // Allow all http/https URLs
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return true;
    }

    // For any other schemes, try to open externally
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url).catch(err => {
          console.warn("Failed to open URL:", url, err);
        });
      }
    });

    return false;
  };

  const startLoading = () => {
    setLoading(true);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    // Prevent endless spinner on network timeout/poor connectivity.
    loadTimeoutRef.current = setTimeout(() => {
      setLoading(false);
    }, 20000);
  };

  const stopLoading = () => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setLoading(false);
  };

  useEffect(() => {
    // Ask early so the first voice-search tap is not blocked.
    ensureMicrophonePermission();
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (Platform.OS !== "android") return false;

      const { canGoBack, url } = navStateRef.current;
      if (!canGoBack || isHomeUrl(url)) {
        BackHandler.exitApp();
        return true;
      }

      if (webviewRef.current) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [webUrl]);

  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={Platform.OS === "ios" ? ["top", "bottom"] : ["top"]}
    >
      {/* Status bar height respected */}
      <StatusBar style="dark" />

      <WebView
        ref={webviewRef}
        source={{ uri: webUrl }}
        style={styles.webview}
        cacheEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Required for getUserMedia / voice search inside the WebView.
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures
        injectedJavaScript={webviewInjectedJavaScript}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={(navState) => {
          navStateRef.current = {
            canGoBack: navState.canGoBack,
            url: navState.url,
          };
        }}
        onMessage={onMessage}
        onLoadStart={startLoading}
        onLoadEnd={stopLoading}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.progress === 1) {
            stopLoading();
          }
        }}
        onError={(e) => {
          console.log("ERROR:", e.nativeEvent);
          stopLoading();
        }}
        onHttpError={stopLoading}
      />

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#111" />
        </View>
      )}
    </SafeAreaView>
  );
}

/* ===============================
   STYLES
================================ */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webview: {
    flex: 1
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center"
  }
});
