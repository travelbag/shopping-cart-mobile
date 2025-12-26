import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useState } from 'react';

export default function App() {
  const [loading, setLoading] = useState(true);
  
  // Replace with your web app URL
  const webUrl = 'https://your-web-app-url.com';

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        source={{ uri: webUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        // Allow JavaScript
        javaScriptEnabled={true}
        // Allow DOM storage
        domStorageEnabled={true}
        // Start in loading state
        startInLoadingState={true}
        // Allow media playback
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
