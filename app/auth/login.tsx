import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/session";
import Svg, { Path } from "react-native-svg";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Quick-fill shortcuts — preserved from the previous gateway screen's
// DEMO_ACCOUNTS, useful for QA/demo access to each role.
const DEMO_ACCOUNTS = [
  { role: "CLIENTE", email: "cliente@mycoach.app", password: "cliente123" },
  { role: "COACH",   email: "coach@mycoach.app",   password: "coach123"   },
  { role: "ADMIN",   email: "admin@mycoach.app",   password: "admin123"   },
];

// ── Login terminal — the real authenticated entry path. Not part of the
// pixel-specified onboarding funnel, but required infrastructure: the
// landing screen's "¿Ya tienes una cuenta?" link and the onboarding wizard's
// finish actions both need somewhere real to land. ──────────────────────────
export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  let googleConfig = { webClientId: "", iosClientId: "", redirectUri: "" };
  try {
    googleConfig = {
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
      redirectUri: makeRedirectUri({ scheme: "mycoach" }),
    };
  } catch (e) {
    console.warn("Error config google auth", e);
  }

  const [request, response, promptAsync] = Google.useAuthRequest(googleConfig);

  useEffect(() => {
    try {
      if (response?.type === "success") {
        const authentication = response?.authentication;
        const token = authentication?.idToken || authentication?.accessToken;
        if (token) {
          setLoading(true);
          loginWithGoogle(token).catch(e => {
            Alert.alert("Error de Autenticación", e?.message || "No se pudo iniciar sesión con Google. Revisa las credenciales.");
            setLoading(false);
          });
        } else {
          Alert.alert("Error de Autenticación", "No se pudo iniciar sesión con Google. Revisa las credenciales.");
        }
      } else if (response && response?.type !== "cancel" && response?.type !== "dismiss") {
        Alert.alert("Error de Autenticación", "No se pudo iniciar sesión con Google. Revisa las credenciales.");
      }
    } catch (err) {
      console.warn("Google auth handling error:", err);
    }
  }, [response, loginWithGoogle]);

  const handleLogin = useCallback(async () => {
    if (!email || !password) { setError("Completa correo y contraseña."); return; }
    setError(null);
    setLoading(true);
    try {
      await login(email?.trim()?.toLowerCase(), password);
      // No navigation call here — app/_layout.tsx's <Stack.Protected> guards
      // react to the token change and mount the correct protected tree.
    } catch (e: any) {
      setError(e?.message || "Error de autenticación.");
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#070708" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, height: 48 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <ChevronLeft size={22} color={VOLT} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ ...athletic, fontSize: 30, color: "#fff" }}>Inicia Sesión</Text>
          <Text style={{ fontSize: 13, color: SILVER, marginTop: 6, marginBottom: 28 }}>
            Accede a tu panel de telemetría y programación.
          </Text>

          <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>CORREO</Text>
          <TextInput
            value={email}
            onChangeText={t => { setEmail(t); setError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="tu@correo.com"
            placeholderTextColor="#52525b"
            style={{ ...GLASS, borderRadius: 12, padding: 14, color: "#fff", fontSize: 14, marginBottom: 16 }}
          />

          <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>CONTRASEÑA</Text>
          <TextInput
            value={password}
            onChangeText={t => { setPassword(t); setError(null); }}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••••"
            placeholderTextColor="#52525b"
            onSubmitEditing={handleLogin}
            style={{ ...GLASS, borderRadius: 12, padding: 14, color: "#fff", fontSize: 14, marginBottom: 20 }}
          />

          {error && (
            <Text style={{ color: "#f87171", fontSize: 12, marginBottom: 16, textAlign: "center" }}>{error}</Text>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={loading}
            onPress={handleLogin}
            style={{
              height: 54, borderRadius: 27, backgroundColor: VOLT,
              alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
              opacity: loading ? 0.6 : 1,
              shadowColor: VOLT, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
            }}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={{ ...athletic, fontSize: 14, color: "#000" }}>Entrar</Text>}
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
            <Text style={{ marginHorizontal: 12, color: SILVER, fontSize: 10, letterSpacing: 1 }}>O</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!request || loading}
            onPress={() => promptAsync()}
            style={{
              height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12,
              opacity: !request || loading ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 16 }}>🌐</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Continuar con Google</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 10, letterSpacing: 1, color: "#52525b", textAlign: "center", marginTop: 40, marginBottom: 10 }}>
            ACCESO RÁPIDO — CUENTAS DE DEMO
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {DEMO_ACCOUNTS.map(acc => (
              <TouchableOpacity
                key={acc.role}
                activeOpacity={0.7}
                onPress={() => { setEmail(acc.email); setPassword(acc.password); setError(null); }}
                style={{ ...GLASS, flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
              >
                <Text className="font-bold" style={{ fontSize: 10, letterSpacing: 0.5, color: SILVER }}>{acc.role}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
