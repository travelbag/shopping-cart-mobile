import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
  Share,
  Linking,
  ToastAndroid,
} from "react-native";
import { WebView } from "react-native-webview";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";

function resolveWebViewGoogleMapsApiKey() {
  const fromEnv =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      ? String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).trim()
      : "";
  if (fromEnv) return fromEnv;
  const fromExtra = String(Constants.expoConfig?.extra?.googleMapsApiKey ?? "").trim();
  return fromExtra;
}

const WEBVIEW_GOOGLE_MAPS_API_KEY = resolveWebViewGoogleMapsApiKey();

/** Runs before any page script: inject Maps key for Places search + lock pinch-zoom (viewport). */
const webviewInjectedJavaScriptBeforeContentLoaded = `
(function () {
  try {
    var k = ${JSON.stringify(WEBVIEW_GOOGLE_MAPS_API_KEY)};
    if (k) window.__LK_GOOGLE_MAPS_API_KEY__ = k;
  } catch (e0) {}
  try {
    var c = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
    var m = document.querySelector('meta[name="viewport"]');
    if (m) m.setAttribute("content", c);
    else if (document.head) {
      m = document.createElement("meta");
      m.setAttribute("name", "viewport");
      m.setAttribute("content", c);
      document.head.insertBefore(m, document.head.firstChild);
    }
  } catch (e1) {}
})();
true;
`;

export default function App() {
  const EXIT_BACK_PRESS_INTERVAL_MS = 2000;
  const BACK_PRESS_DEBOUNCE_MS = 700;
  const EXIT_SUPPRESS_AFTER_NAV_MS = 1500;
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef(null);
  const navStateRef = useRef({ canGoBack: false, url: "" });
  const lastBackAttemptRef = useRef(0);
  const lastBackHandledAtRef = useRef(0);
  const suppressExitUntilRef = useRef(0);
  const loadTimeoutRef = useRef(null);
  const USE_LOCAL_WEB_URL = false;
  const PROD_WEB_URL = "https://littlekart.com";
  const LOCAL_WEB_URL = Platform.select({
    android: "http://192.168.29.117:3000",
    ios: "http://192.168.1.253:3000",
    default: "http://192.168.29.117:3000",
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
              '[data-state="open"][data-dialog-content]'
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
              var allEls = document.body.querySelectorAll('*');
              for (var i = 0; i < allEls.length; i++) {
                var el = allEls[i];
                var style = window.getComputedStyle(el);
                if (style.pointerEvents === 'none') continue;
                if (style.position !== 'fixed' && style.position !== 'absolute') continue;
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
  /** SPA path for HashRouter (#/cart) or path-based routing; home is "/" only. */
  const getWebAppPath = (url) => {
    if (!url) return "/";
    try {
      const u = new URL(url);
      const hash = u.hash || "";
      if (hash.length > 1) {
        const route = hash.startsWith("#") ? hash.slice(1) : hash;
        const p = route.startsWith("/") ? route : `/${route}`;
        const trimmed = p.replace(/\/+$/, "");
        return trimmed === "" ? "/" : trimmed;
      }
      const path = u.pathname.replace(/\/+$/, "") || "/";
      return path;
    } catch (_) {
      return "/";
    }
  };

  const isHomeUrl = (url) => {
    if (!url) return false;
    try {
      const current = new URL(url);
      const base = new URL(webUrl);
      if (current.origin !== base.origin) return false;
      const path = getWebAppPath(url);
      const normalizedPath = path === "" ? "/" : path;
      const hasSearch = Boolean(current.search && current.search !== "?");
      const hash = current.hash || "";
      const normalizedHash = hash.replace(/^#/, "");
      const hasRouteHash =
        normalizedHash !== "" && normalizedHash !== "/" && normalizedHash !== "#";
      return normalizedPath === "/" && !hasSearch && !hasRouteHash;
    } catch (_) {
      return false;
    }
  };

  const onMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data ?? "{}");

      if (data?.type === "EXIT_APP") {
        if (Platform.OS === "android") {
          const { canGoBack, url } = navStateRef.current;
          if (!isHomeUrl(url) || canGoBack) return;
          const now = Date.now();
          if (now - lastBackAttemptRef.current >= EXIT_BACK_PRESS_INTERVAL_MS) {
            lastBackAttemptRef.current = now;
            ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
            return;
          }
          BackHandler.exitApp();
        }
        return;
      }

      if (data?.type === "SHARE_APP") {
        const { title, text, url } = data?.payload || {};
        await Share.share({
          title,
          message: text,
          url,
        });
      }
    } catch (_) {
      // Ignore malformed bridge messages
    }
  }, [EXIT_BACK_PRESS_INTERVAL_MS]);

  const handleShouldStartLoadWithRequest = (request) => {
    const url = request.url;

    if (
      url.startsWith("tel:") ||
      url.startsWith("mailto:") ||
      url.startsWith("whatsapp:")
    ) {
      Linking.openURL(url).catch(err => {
        console.warn("Failed to open URL:", url, err);
      });

      return false; // VERY IMPORTANT: prevent WebView loading
    }

    return true;
  };

  const navigateToHome = useCallback(() => {
    if (!webviewRef.current) return;
    webviewRef.current.injectJavaScript(`
      (function () {
        try {
          var homeUrl = ${JSON.stringify(webUrl)};
          window.location.href = homeUrl;
        } catch (e) {}
      })();
      true;
    `);
  }, [webUrl]);

  const triggerWebBack = useCallback(() => {
    if (!webviewRef.current) return;
    webviewRef.current.injectJavaScript(`
      (function () {
        try {
          if (window.history && window.history.length > 1) {
            window.history.back();
            return;
          }
          if (
            window.location &&
            window.location.hash &&
            window.location.hash !== "#/" &&
            window.location.hash !== "#"
          ) {
            window.location.hash = "#/";
            return;
          }
          var backEl =
            document.querySelector('[aria-label="Back"]') ||
            document.querySelector('[title="Back"]') ||
            document.querySelector('[data-testid="back"]') ||
            document.querySelector('.back-button');
          if (backEl && typeof backEl.click === "function") {
            backEl.click();
          }
        } catch (e) {}
      })();
      true;
    `);
  }, []);

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
    const onBackPress = () => {
      if (Platform.OS !== "android") return false;
      const now = Date.now();

      // Some devices fire duplicate hardware back events in quick succession.
      // Swallow the duplicate so it doesn't chain into an unwanted app exit.
      if (now - lastBackHandledAtRef.current < BACK_PRESS_DEBOUNCE_MS) {
        return true;
      }
      lastBackHandledAtRef.current = now;

      const { canGoBack, url } = navStateRef.current;
      const canNavigateInsideApp = canGoBack || !isHomeUrl(url);

      // For non-home / back-capable states, always navigate within app first.
      if (canNavigateInsideApp) {
        lastBackAttemptRef.current = 0;
        suppressExitUntilRef.current = now + EXIT_SUPPRESS_AFTER_NAV_MS;
        if (canGoBack && webviewRef.current) {
          webviewRef.current.goBack();
          return true;
        }
        triggerWebBack();
        return true;
      }

      // Home: require double back press to avoid accidental exits.
      if (now < suppressExitUntilRef.current) {
        lastBackAttemptRef.current = now;
        ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
        return true;
      }
      const recentlyTried = now - lastBackAttemptRef.current < EXIT_BACK_PRESS_INTERVAL_MS;
      if (recentlyTried) {
        BackHandler.exitApp();
        return true;
      }
      lastBackAttemptRef.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;

    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [
    EXIT_BACK_PRESS_INTERVAL_MS,
    BACK_PRESS_DEBOUNCE_MS,
    EXIT_SUPPRESS_AFTER_NAV_MS,
    triggerWebBack,
  ]);

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
        injectedJavaScriptBeforeContentLoaded={webviewInjectedJavaScriptBeforeContentLoaded}
        {...(Platform.OS === "android"
          ? { setBuiltInZoomControls: false, setDisplayZoomControls: false }
          : {})}
        injectedJavaScript={webviewInjectedJavaScript}
        onNavigationStateChange={(navState) => {
          navStateRef.current = {
            canGoBack: Boolean(navState.canGoBack),
            url: navState.url || "",
          };
        }}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
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
        onMessage={onMessage}
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
