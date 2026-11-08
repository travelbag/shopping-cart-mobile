import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  AppState,
  StyleSheet,
  View,
  BackHandler,
  Platform,
  Share,
  Linking,
  PermissionsAndroid,
} from "react-native";
import { WebView } from "react-native-webview";
import { useCallback, useEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addNotificationListeners,
  clearAppBadge,
  getLastNotificationResponse,
  logPush,
  markNotificationHandled,
  parsePushPayload,
  getCustomerPushRegistration,
  preparePushNotifications,
  registerCustomerToken,
  setCustomerApiBase,
  unregisterCustomerToken,
  wasNotificationHandled,
} from "./notifications";

// Keep splash screen visible until app is ready
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const webviewRef = useRef(null);
  const navStateRef = useRef({ canGoBack: false, url: "" });
  const webviewReadyRef = useRef(false);
  const pendingNavRef = useRef(null);
  const handlingNavRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const navRetryTimersRef = useRef([]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  const insets = useSafeAreaInsets();
  const USE_LOCAL_WEB_URL = false;
  const PROD_WEB_URL = "https://www.littlekart.com";
  const LOCAL_WEB_URL = Platform.select({
    android: "http://192.168.1.199:3000",
    ios: "http://192.168.1.253:3000",
    default: "http://192.168.1.199:3000",
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
  setCustomerApiBase(
    USE_LOCAL_WEB_URL ? `${baseWebUrl}/lk-backend` : "https://api.littlekart.com"
  );
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
              // Removed forced overflow styles - they break position:sticky
              if (!html || !body) return;
              html.style.setProperty('touch-action', 'auto', 'important');
              body.style.setProperty('touch-action', 'auto', 'important');
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

              // Only reset touch-action, preserve overflow for sticky positioning
              resetStyle(html, 'touchAction');
              resetStyle(body, 'touchAction');
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

  const clearNavRetries = useCallback(() => {
    navRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
    navRetryTimersRef.current = [];
  }, []);

  const deliverNavigation = useCallback((nav) => {
    const route = "/messages";
    pendingNavRef.current = { ...(nav || {}), route, webPath: route };

    if (!webviewRef.current) {
      logPush("queued navigation until WebView exists", route);
      return;
    }

    const payload = {
      type: "PUSH_NAVIGATE",
      route,
      webPath: route,
      data: {
        type: nav?.type ?? null,
        route,
        webPath: route,
        deepLink: null,
        campaignId: nav?.campaignId ?? null,
        orderId: nav?.orderId ?? null,
      },
    };
    const json = JSON.stringify(payload);
    const script = `
      (function() {
        var payload = ${JSON.stringify(json)};
        if (typeof window.__lkSetPushNavigate === "function") {
          window.__lkSetPushNavigate(payload);
          return;
        }
        window.__LK_PUSH_NAVIGATE__ = payload;
        try { window.dispatchEvent(new MessageEvent("message", { data: payload })); } catch (e) {}
        try { document.dispatchEvent(new MessageEvent("message", { data: payload })); } catch (e) {}
      })();
      true;
    `;

    const inject = () => {
      if (!pendingNavRef.current || !webviewRef.current) return;
      webviewRef.current.postMessage?.(json);
      webviewRef.current.injectJavaScript?.(script);
      logPush("sent PUSH_NAVIGATE", route);
    };

    clearNavRetries();
    inject();
    [600, 1500, 3000, 5000].forEach((delay) => {
      const timer = setTimeout(inject, delay);
      navRetryTimersRef.current.push(timer);
    });
  }, [clearNavRetries]);

  const openFromNotification = useCallback(
    async (response) => {
      const id = response?.notification?.request?.identifier;
      if (!id) {
        logPush("tap ignored: missing notification id");
        return;
      }
      if (handlingNavRef.current === id) return;
      handlingNavRef.current = id;
      if (await wasNotificationHandled(id)) {
        logPush("tap ignored: already handled", id);
        return;
      }

      const parsed = parsePushPayload(response);
      await markNotificationHandled(id);
      logPush("opening messages from notification", parsed?.route || parsed?.deepLink || id);
      deliverNavigation(parsed || { route: "/messages", webPath: "/messages" });
    },
    [deliverNavigation]
  );

  const sendPushTokenToWeb = useCallback(async () => {
    const registration = await getCustomerPushRegistration();
    if (!registration?.pushToken || !webviewRef.current) {
      logPush("push token not sent to web", registration?.platform || "no token");
      return;
    }

    const tokenHint = `...${String(registration.pushToken).slice(-8)}`;

    const payload = {
      type: "PUSH_TOKEN_UPDATE",
      pushToken: registration.pushToken,
      platform: registration.platform,
      appVersion: registration.appVersion,
    };
    const json = JSON.stringify(payload);
    webviewRef.current.postMessage?.(json);
    webviewRef.current.injectJavaScript?.(
      `(function(){var payload=${JSON.stringify(json)};try{window.dispatchEvent(new MessageEvent("message",{data:payload}));}catch(e){}try{document.dispatchEvent(new MessageEvent("message",{data:payload}));}catch(e){}})();true;`
    );
    logPush("sent push token to web", `${registration.platform} ${tokenHint}`);
  }, []);

  const onMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data ?? "{}");
      const messageType = data?.type;

      if (messageType === "MESSAGES_VIEWED") {
        clearAppBadge();
        return;
      }

      if (messageType === "PUSH_NAVIGATE_ACK") {
        pendingNavRef.current = null;
        clearNavRetries();
        logPush("messages navigation acknowledged");
        return;
      }

      if (messageType === "REQUEST_PUSH_TOKEN") {
        logPush("web requested push token");
        await sendPushTokenToWeb();
        return;
      }
      const customerPhone =
        data?.customerPhone ??
        data?.phone ??
        data?.payload?.customerPhone ??
        data?.payload?.phone;
      const accessToken =
        data?.accessToken ?? data?.payload?.accessToken ?? undefined;

      if (
        messageType === "CUSTOMER_LOGIN" ||
        messageType === "LOGIN" ||
        messageType === "USER_LOGGED_IN"
      ) {
        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current);
          logoutTimerRef.current = null;
        }
        logPush("login message", customerPhone ? "phone present" : "phone missing");
        await registerCustomerToken(customerPhone, accessToken);
        await sendPushTokenToWeb();
        return;
      }

      if (
        messageType === "CUSTOMER_LOGOUT" ||
        messageType === "LOGOUT" ||
        messageType === "USER_LOGGED_OUT"
      ) {
        // Closing or killing the app can make the page send logout.
        // Wait, and only remove the token if the customer is still in the app.
        if (AppState.currentState !== "active") {
          logPush("logout ignored: app is closed");
          return;
        }
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = setTimeout(() => {
          logoutTimerRef.current = null;
          if (AppState.currentState !== "active") {
            logPush("logout ignored: app is closed");
            return;
          }
          logPush("logout message");
          unregisterCustomerToken(customerPhone);
        }, 1500);
        return;
      }

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

  useEffect(() => {
    // Ask early so the first voice-search tap is not blocked.
    ensureMicrophonePermission();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
        logPush("logout cancelled because app closed");
      }
      if (nextState === "active") {
        preparePushNotifications();
        sendPushTokenToWeb();
        webviewRef.current?.injectJavaScript?.(
          'window.dispatchEvent(new Event("lk:messages-updated")); true;'
        );
      }
    });
    return () => {
      subscription.remove();
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);

  useEffect(() => {
    preparePushNotifications();
    getLastNotificationResponse()
      .then((response) => {
        if (response) openFromNotification(response);
      })
      .catch((error) => logPush("last notification lookup failed", String(error)));

    return addNotificationListeners({
      onResponse: openFromNotification,
    });
  }, [openFromNotification]);

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
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Required for getUserMedia / voice search inside the WebView.
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures
        // iOS scroll performance optimizations
        scrollEnabled={true}
        bounces={true}
        decelerationRate={Platform.OS === "android" ? 0.998 : "normal"}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled={true}
        // Android performance
        androidLayerType="hardware"
        overScrollMode="always"
        nestedScrollEnabled={true}
        setBuiltInZoomControls={false}
        setSupportZoom={false}
        textZoom={100}
        // Better caching
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        // Pull to refresh (optional - uncomment if you want it)
        // pullToRefreshEnabled={true}
        // Inject CSS for smoother scrolling
        injectedJavaScriptBeforeContentLoaded={`
          (function() {
            var style = document.createElement('style');
            style.textContent = 'html,body{-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain}*{-webkit-tap-highlight-color:transparent}';
            if (document.head) document.head.appendChild(style);

            var announced = "";
            function parseJson(value) {
              if (!value) return null;
              if (typeof value === "object") return value;
              try { return JSON.parse(value); } catch (e) { return null; }
            }
            function readSession() {
              try {
                var root = parseJson(localStorage.getItem("persist:root"));
                var auth = root && parseJson(root.auth);
                var user = auth && auth.user;
                var phone = user && (user.phone || user.phoneNumber);
                phone = phone ? String(phone).trim() : "";
                var token = auth && (auth.token || auth.accessToken);
                token = token ? String(token).trim() : "";
                if (!phone) return null;
                return { customerPhone: phone, accessToken: token };
              } catch (e) {
                return null;
              }
            }
            function post(message) {
              if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
              window.ReactNativeWebView.postMessage(JSON.stringify(message));
            }
            function publish() {
              var session = readSession();
              if (session) {
                var key = session.customerPhone + "|" + session.accessToken;
                if (key === announced) return;
                announced = key;
                post({
                  type: "CUSTOMER_LOGIN",
                  customerPhone: session.customerPhone,
                  accessToken: session.accessToken
                });
                return;
              }
              if (!announced) return;
              var phone = announced.split("|")[0];
              announced = "";
              post({ type: "CUSTOMER_LOGOUT", customerPhone: phone });
            }
            var originalSetItem = localStorage.setItem;
            localStorage.setItem = function(key, value) {
              originalSetItem.apply(this, arguments);
              if (key === "persist:root") publish();
            };
            publish();
            setTimeout(publish, 1000);

            window.__lkSetPushNavigate = function(payload) {
              window.__LK_PUSH_NAVIGATE__ = payload;
              try { window.dispatchEvent(new MessageEvent("message", { data: payload })); } catch (e) {}
              try { document.dispatchEvent(new MessageEvent("message", { data: payload })); } catch (e) {}
            };
          })();
          true;
        `}
        injectedJavaScript={webviewInjectedJavaScript}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={(navState) => {
          navStateRef.current = {
            canGoBack: navState.canGoBack,
            url: navState.url,
          };
        }}
        onMessage={onMessage}
        onLoadEnd={() => {
          webviewReadyRef.current = true;
          sendPushTokenToWeb();
          if (pendingNavRef.current) {
            deliverNavigation(pendingNavRef.current);
          }
        }}
        onError={(e) => {
          console.log("ERROR:", e.nativeEvent);
        }}
      />
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
});
