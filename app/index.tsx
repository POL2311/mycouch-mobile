import { View, Text, TouchableOpacity, ImageBackground, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MotiView } from "moti";
import { useAuth } from "@/lib/session";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

import AsyncStorage from "@react-native-async-storage/async-storage";

// Athletic-grit hero photography — same Unsplash convention used for the
// Cinema Bento exercise cards elsewhere in this app.
const HERO_IMG = "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=70";

// Bottom-to-top opacity mask — the SVG-gradient substitute used throughout
// this app (no react-native-linear-gradient dependency exists in the project).
function HeroScrim() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="landingScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor="#000000" stopOpacity="0.35" />
          <Stop offset="0.5" stopColor="#000000" stopOpacity="0.75" />
          <Stop offset="1"   stopColor="#000000" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#landingScrim)" />
    </Svg>
  );
}

// ── SCREEN 1 · Elite Landing Engine ──────────────────────────────────────────
// Pure hero/entry surface. All real onboarding logic lives at /auth/onboarding
// and /auth/login — this screen only routes into them.
export default function LandingScreen() {
  const { isLoading, token } = useAuth();

  const handleAlreadyHaveAccount = async () => {
    try {
      // Limpia cualquier estado previo corrupto de manera segura
      await AsyncStorage.getItem('@user_session').catch(() => null);
      
      // Delay de 50ms para permitir que el puente nativo (TurboModule) libere la memoria antes de cambiar la vista
      setTimeout(() => {
        router.push('/auth/login');
      }, 50);
    } catch (error) {
      console.error('Navigation error:', error);
      router.push('/auth/login');
    }
  };

  // AuthProvider's <Stack.Protected> guards own navigation on auth state
  // change; while a stored token is still being verified, render nothing so
  // there's no flash of the landing hero for an already-authenticated user.
  if (!isLoading && token) return null;

  return (
    <ImageBackground source={{ uri: HERO_IMG }} resizeMode="cover" style={{ flex: 1, backgroundColor: "#000000" }}>
      <HeroScrim />
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, justifyContent: "space-between" }}>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginTop: 8 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: VOLT }} />
          <Text className="font-black uppercase" style={{ fontSize: 15, color: "#fff", letterSpacing: 2 }}>
            MYCOACH
          </Text>
        </View>

        {/* Core headline + CTA block */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: "timing", duration: 480 }}>
            <Text style={{ ...athletic, fontSize: 40, lineHeight: 42, letterSpacing: -1, color: "#fff" }}>
              UNA SERIE MÁS,{"\n"}UNA COMIDA MÁS.
            </Text>
            <Text style={{ ...athletic, fontSize: 40, lineHeight: 42, letterSpacing: -1, color: VOLT, marginTop: 6 }}>
              DISCIPLINA{"\n"}ABSOLUTA.
            </Text>
          </MotiView>

          <Text style={{ fontSize: 13, lineHeight: 19, color: SILVER, marginTop: 18, maxWidth: 320 }}>
            Sistema de telemetría y programación táctica diseñado para atletas de alto rendimiento.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/auth/onboarding")}
            style={{
              height: 56, borderRadius: 28, backgroundColor: VOLT,
              alignItems: "center", justifyContent: "center", marginTop: 28,
              shadowColor: VOLT, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
            }}
          >
            <Text style={{ ...athletic, fontSize: 15, color: "#000" }}>Comenzar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleAlreadyHaveAccount}
            style={{ alignItems: "center", marginTop: 18 }}
          >
            <Text style={{ fontSize: 13, color: "#d4d4d8" }}>
              ¿Ya tienes una cuenta? <Text style={{ color: "#fff", fontWeight: "700", textDecorationLine: "underline" }}>Inicia Sesión</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}
