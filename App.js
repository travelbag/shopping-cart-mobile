import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform
} from "react-native";
import { WebView } from "react-native-webview";
import { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef(null);

  // PROD URL
  const webUrl = "https://littlekart.com";

  /* ===============================
     ANDROID BACK BUTTON HANDLING
  ================================ */
  useEffect(() => {
    const onBackPress = () => {
      if (webviewRef.current) {
        webviewRef.current.injectJavaScript(`
          (function() {
            if (window.history.length > 1) {
              window.history.back();
              true;
            } else {
              false;
            }
          })();
        `);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
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

        /* ===== CORE SETTINGS ===== */
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}

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
    backgroundColor: "#fff"
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
