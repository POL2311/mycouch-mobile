import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback } from "react";
import { Mail, KeyRound, DollarSign, LogOut } from "lucide-react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useAuth } from "@/lib/session";
import { fetchCoachRoomProfile, type CoachRoomProfile } from "@/lib/coach";
import { PulseButton } from "@/components/ui/PulseButton";

const VOLT   = "#CCFF00";
const OLED   = "#070708";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Vertical mesh scrim behind the hero block — same SVG-gradient substitute
// used everywhere else in this app (no react-native-linear-gradient dependency).
function HeroMesh() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="coachHeroMesh" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={OLED} stopOpacity="0.2" />
          <Stop offset="1" stopColor={OLED} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#coachHeroMesh)" />
    </Svg>
  );
}

export default function CoachPerfilScreen() {
  const { user, token, logout } = useAuth();
  const [profile, setProfile] = useState<CoachRoomProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchCoachRoomProfile(token).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  // Pure state teardown, no navigation call. app/_layout.tsx gates (portal)/
  // (coach)/index behind <Stack.Protected guard={...}>, so clearing token/
  // user flips those guards in the same commit and Expo Router itself
  // unmounts this protected tree and lands on the login screen.
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Coach logout pipeline exception trapped:", error);
    }
  }, [logout]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: OLED }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>

        {/* ── Hero branding ── */}
        <View style={{ height: 160, justifyContent: "flex-end", backgroundColor: "#101012" }}>
          <HeroMesh />
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 2, color: VOLT, textTransform: "uppercase" }}>
              PANEL DE ENTRENADOR
            </Text>
            <Text style={{ ...athletic, fontSize: 24, lineHeight: 27, color: "#fff", marginTop: 4 }}>
              {user?.name ? `COACH ${user.name}` : "COACH"}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {loading ? (
            <ActivityIndicator color={VOLT} style={{ marginTop: 20 }} />
          ) : (
            <>
              {/* Card 1 — Cuenta */}
              <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Mail size={18} color={SILVER} />
                <View>
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER }}>CUENTA</Text>
                  <Text className="font-bold" style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{user?.email ?? "—"}</Text>
                </View>
              </View>

              {/* Card 2 — Código de Acceso */}
              <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <KeyRound size={16} color={VOLT} />
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, textTransform: "uppercase" }}>
                    Código de Vinculación Acumulado
                  </Text>
                </View>
                <Text className="font-black" style={{ fontSize: 22, letterSpacing: 3, color: VOLT }}>
                  {profile?.joinCode ?? "—"}
                </Text>
              </View>

              {/* Card 3 — Tarifa Global */}
              <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <DollarSign size={16} color={SILVER} />
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, textTransform: "uppercase" }}>
                    Tarifa Global
                  </Text>
                </View>
                <Text className="font-black" style={{ fontSize: 22, color: "#fff" }}>
                  ${profile?.monthlyPrice?.toLocaleString("es-MX") ?? "—"} <Text style={{ fontSize: 13, color: SILVER }}>MXN/mes</Text>
                </Text>
              </View>
            </>
          )}

          {/* ── Logout command latch ── */}
          <PulseButton
            glowColor="#ef4444"
            onPress={handleLogout}
            style={{
              height: 50, borderRadius: 16, marginTop: 12,
              backgroundColor: "rgba(239, 68, 68, 0.05)", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)",
              flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
            }}
          >
            <LogOut size={15} color="#f87171" />
            <Text className="font-black uppercase" style={{ fontSize: 12, letterSpacing: 1, color: "#f87171", fontStyle: "italic" }}>
              CERRAR SESIÓN // SALIR
            </Text>
          </PulseButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
