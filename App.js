import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
  Share
} from "react-native";
import { WebView } from "react-native-webview";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function App() {
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef(null);
  const navStateRef = useRef({ canGoBack: false, url: "" });
  const insets = useSafeAreaInsets();

  // PROD URL
  const webUrl = __DEV__
    ? "http://192.168.29.117:3000"
    : "https://littlekart.com";

  /* ===============================
     ANDROID BACK BUTTON HANDLING
  ================================ */
  const normalizeUrl = (url) => {
    if (!url) return "";
    return url.replace(/\/+$/, "");
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
      }
    } catch (_) {
      // Ignore malformed bridge messages
    }
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

        /* ===== iOS SAFE AREA FIX (CRITICAL) ===== */
        contentInsetAdjustmentBehavior="never"

        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={onMessage}
        onNavigationStateChange={(navState) => {
          navStateRef.current = {
            canGoBack: navState.canGoBack,
            url: navState.url,
          };
        }}

        /* ===== CORE SETTINGS ===== */
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        geolocationEnabled={true}

        onGeolocationPermissionsShowPrompt={(origin, callback) => {
          callback(true, false);
        }}

        onPermissionRequest={(event) => {
          event.grant(event.resources);
        }}
        
        /* ===== DISABLE ZOOM ===== */
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}

        /* ===== FORCE VIEWPORT + SAFE AREA ===== */
        injectedJavaScript={`
          (function() {
            // Viewport fix
            var meta = document.querySelector('meta[name=viewport]');
            if (!meta) {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              document.head.appendChild(meta);
            }
            meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
            document.documentElement.style.setProperty(
              '--rn-safe-bottom',
              '${insets.bottom}px'
            );
          })();
          true;
        `}

        /* ===== ANDROID OPTIMIZATION ===== */
        overScrollMode="never"
        mixedContentMode="always"
      />

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#000" />
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
