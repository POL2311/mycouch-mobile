import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
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
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" backgroundColor="#000000" />
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
