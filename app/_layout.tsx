import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, Component, ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { AuthProvider, useAuth } from "@/lib/session";
import "@/global.css";

// ── Google OAuth Initialization ─────────────────────────────────────────────
// This ensures that when the user authenticates in Chrome/Safari, the browser
// tab is closed automatically and redirects back to the app with the token.
WebBrowser.maybeCompleteAuthSession();

// Keep splash visible while fonts/session load
SplashScreen.preventAutoHideAsync();

// ── Global Error Boundary ───────────────────────────────────────────────────
class GlobalErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Global Error Caught:", error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false });
    try {
      router.replace("/");
    } catch (e) {
      // Ignored
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#070708", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", color: "#fff", marginBottom: 12 }}>¡Oops!</Text>
          <Text style={{ fontSize: 14, color: "#8e8e93", textAlign: "center", marginBottom: 32 }}>
            Algo salió mal y la aplicación tuvo que detenerse. Por favor, intenta de nuevo.
          </Text>
          <TouchableOpacity 
            activeOpacity={0.85}
            onPress={this.handleRestart}
            style={{ backgroundColor: "#CCFF00", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28 }}
          >
            <Text style={{ color: "#000", fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", fontSize: 16 }}>Reiniciar App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Declarative auth gating (Expo Router's Stack.Protected) ─────────────────
// This REPLACES the old approach of an imperative router.replace() effect
// racing against whatever screen-level navigation calls existed. With
// Protected guards, the (portal)/(coach)/index screens are never even
// registered on the Stack while their guard is false — there's no "trapped
// inside a protected navigator" state to race into, because that navigator's
// screens simply aren't mounted. When `token` flips to null, Expo Router
// itself redirects away from whatever protected screen was focused, in the
// same commit — no imperative replace(), no timing window, no double-fire.
function RootNavigator() {
  const { token, role, isLoading } = useAuth();

  useEffect(() => {
    // Splash stays up until the stored token has been verified, so an
    // already-authenticated user never sees a flash of the login screen.
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  const isCoach  = token != null && (role === "COACH" || role === "ADMIN");
  const isClient = token != null && !isCoach;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade", freezeOnBlur: false }}>
      <Stack.Protected guard={token == null}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/onboarding" />
        <Stack.Screen name="auth/login" />
      </Stack.Protected>
      <Stack.Protected guard={isClient}>
        <Stack.Screen name="(portal)" />
      </Stack.Protected>
      <Stack.Protected guard={isCoach}>
        <Stack.Screen name="(coach)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <StatusBar style="light" backgroundColor="#000000" />
          <RootNavigator />
        </AuthProvider>
      </GestureHandlerRootView>
    </GlobalErrorBoundary>
  );
}
