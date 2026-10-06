import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";

const AIMPACT_URL = "https://aimpact-ai.netlify.app/platform.html";

export default function App() {
  const webView = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const handler = () => {
      if (webView.current?.canGoBack) {
        webView.current.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <WebView
        ref={webView}
        source={{ uri: AIMPACT_URL }}
        style={styles.webview}
        originWhitelist={["https://*"]}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={() => setFailed(true)}
      />
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" />
          <Text style={styles.label}>AIMPACT</Text>
        </View>
      )}
      {failed && (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>AIMPACT</Text>
          <Text style={styles.errorText}>서비스 연결에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070809" },
  webview: { flex: 1, backgroundColor: "#070809" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#070809"
  },
  label: { marginTop: 14, color: "#f6f7f8", fontSize: 18, fontWeight: "700", letterSpacing: 2 },
  error: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#070809"
  },
  errorTitle: { color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 12 },
  errorText: { color: "#a8adb7", textAlign: "center", lineHeight: 22 }
});
