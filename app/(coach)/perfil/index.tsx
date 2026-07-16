import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback } from "react";
import { Mail, KeyRound, DollarSign, LogOut, User, Lock, Check } from "lucide-react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useAuth } from "@/lib/session";
import { fetchCoachRoomProfile, type CoachRoomProfile } from "@/lib/coach";
import { PulseButton } from "@/components/ui/PulseButton";
import { COACH_BG, COACH_CARD, COACH_BORDER, COACH_ACCENT, COACH_ALERT, COACH_MUTED } from "../_layout";

const CARD = { backgroundColor: COACH_CARD, borderWidth: 1, borderColor: COACH_BORDER } as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Vertical mesh scrim behind the hero block — same SVG-gradient substitute
// used everywhere else in this app (no react-native-linear-gradient dependency).
function HeroMesh() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="coachHeroMesh" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COACH_BG} stopOpacity="0.2" />
          <Stop offset="1" stopColor={COACH_BG} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#coachHeroMesh)" />
    </Svg>
  );
}

function FieldInput({ value, onChangeText, placeholder, ...rest }: {
  value: string; onChangeText: (t: string) => void; placeholder: string;
  secureTextEntry?: boolean; keyboardType?: "email-address" | "default"; autoCapitalize?: "none" | "words";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#52525b"
      style={{ ...CARD, borderRadius: 10, padding: 12, color: "#fff", fontSize: 13, marginBottom: 10 }}
      {...rest}
    />
  );
}

export default function CoachPerfilScreen() {
  const { user, token, logout, updateProfile, changePassword } = useAuth();
  const [profile, setProfile] = useState<CoachRoomProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchCoachRoomProfile(token).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  // ── Editar perfil ──────────────────────────────────────────────────────
  const [name,  setName]  = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => { setName(user?.name ?? ""); setEmail(user?.email ?? ""); }, [user]);

  const profileDirty = name.trim() !== (user?.name ?? "") || email.trim() !== (user?.email ?? "");
  const canSaveProfile = profileDirty && name.trim().length > 0 && email.trim().includes("@");

  const saveProfile = useCallback(async () => {
    if (!canSaveProfile || savingProfile) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      setProfileMsg({ kind: "ok", text: "Perfil actualizado." });
    } catch (e) {
      setProfileMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo actualizar el perfil." });
    } finally {
      setSavingProfile(false);
    }
  }, [canSaveProfile, savingProfile, name, email, updateProfile]);

  // ── Cambiar contraseña ─────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw,  setSavingPw]  = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSavePw = currentPw.length > 0 && newPw.length >= 6 && newPw === confirmPw;

  const savePassword = useCallback(async () => {
    if (!canSavePw || savingPw) return;
    setSavingPw(true);
    setPwMsg(null);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwMsg({ kind: "ok", text: "Contraseña actualizada." });
    } catch (e) {
      setPwMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo cambiar la contraseña." });
    } finally {
      setSavingPw(false);
    }
  }, [canSavePw, savingPw, currentPw, newPw, changePassword]);

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
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: COACH_BG }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>

        {/* ── Hero branding ── */}
        <View style={{ height: 160, justifyContent: "flex-end", backgroundColor: "#101012" }}>
          <HeroMesh />
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 2, color: COACH_ACCENT, textTransform: "uppercase" }}>
              PANEL DE ENTRENADOR
            </Text>
            <Text style={{ ...athletic, fontSize: 24, lineHeight: 27, color: "#fff", marginTop: 4 }}>
              {user?.name ? `COACH ${user.name}` : "COACH"}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {loading ? (
            <ActivityIndicator color={COACH_ACCENT} style={{ marginTop: 20 }} />
          ) : (
            <>
              {/* Card — Código de Acceso */}
              <View style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <KeyRound size={16} color={COACH_ACCENT} />
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase" }}>
                    Código de Vinculación
                  </Text>
                </View>
                <Text className="font-black" style={{ fontSize: 22, letterSpacing: 3, color: COACH_ACCENT }}>
                  {profile?.joinCode ?? "—"}
                </Text>
              </View>

              {/* Card — Tarifa Global */}
              <View style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <DollarSign size={16} color={COACH_MUTED} />
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase" }}>
                    Tarifa Global
                  </Text>
                </View>
                <Text className="font-black" style={{ fontSize: 22, color: "#fff" }}>
                  ${profile?.monthlyPrice?.toLocaleString("es-MX") ?? "—"} <Text style={{ fontSize: 13, color: COACH_MUTED }}>MXN/mes</Text>
                </Text>
              </View>
            </>
          )}

          {/* ── Editar perfil ── */}
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase", marginBottom: 10 }}>
            Datos personales
          </Text>
          <View style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <User size={16} color={COACH_MUTED} />
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase" }}>
                Nombre y correo
              </Text>
            </View>
            <FieldInput value={name} onChangeText={setName} placeholder="Nombre completo" autoCapitalize="words" />
            <FieldInput value={email} onChangeText={setEmail} placeholder="Correo electrónico" keyboardType="email-address" autoCapitalize="none" />
            {profileMsg && (
              <Text style={{ fontSize: 11, marginBottom: 10, color: profileMsg.kind === "ok" ? "#4ade80" : COACH_ALERT }}>
                {profileMsg.text}
              </Text>
            )}
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!canSaveProfile || savingProfile}
              onPress={saveProfile}
              style={{
                height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
                backgroundColor: COACH_ACCENT, opacity: !canSaveProfile || savingProfile ? 0.4 : 1,
              }}
            >
              {savingProfile
                ? <ActivityIndicator color="#000" />
                : (
                  <>
                    <Check size={14} color="#000" strokeWidth={3} />
                    <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>Guardar cambios</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>

          {/* ── Cambiar contraseña ── */}
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase", marginBottom: 10 }}>
            Seguridad
          </Text>
          <View style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Lock size={16} color={COACH_MUTED} />
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase" }}>
                Cambiar contraseña
              </Text>
            </View>
            <FieldInput value={currentPw} onChangeText={setCurrentPw} placeholder="Contraseña actual" secureTextEntry autoCapitalize="none" />
            <FieldInput value={newPw} onChangeText={setNewPw} placeholder="Nueva contraseña (mín. 6 caracteres)" secureTextEntry autoCapitalize="none" />
            <FieldInput value={confirmPw} onChangeText={setConfirmPw} placeholder="Confirmar nueva contraseña" secureTextEntry autoCapitalize="none" />
            {pwMismatch && (
              <Text style={{ fontSize: 11, color: COACH_ALERT, marginBottom: 10 }}>Las contraseñas no coinciden.</Text>
            )}
            {pwMsg && (
              <Text style={{ fontSize: 11, marginBottom: 10, color: pwMsg.kind === "ok" ? "#4ade80" : COACH_ALERT }}>
                {pwMsg.text}
              </Text>
            )}
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!canSavePw || savingPw}
              onPress={savePassword}
              style={{
                height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
                backgroundColor: COACH_ACCENT, opacity: !canSavePw || savingPw ? 0.4 : 1,
              }}
            >
              {savingPw
                ? <ActivityIndicator color="#000" />
                : (
                  <>
                    <Check size={14} color="#000" strokeWidth={3} />
                    <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>Actualizar contraseña</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>

          {/* ── Cuenta (read-only, real token identity) ── */}
          <View style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Mail size={18} color={COACH_MUTED} />
            <View>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: COACH_MUTED }}>SESIÓN ACTIVA</Text>
              <Text className="font-bold" style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{user?.email ?? "—"}</Text>
            </View>
          </View>

          {/* ── Logout command latch ── */}
          <PulseButton
            glowColor={COACH_ALERT}
            onPress={handleLogout}
            style={{
              height: 50, borderRadius: 16, marginTop: 12,
              backgroundColor: "rgba(255, 59, 48, 0.05)", borderWidth: 1, borderColor: "rgba(255, 59, 48, 0.2)",
              flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
            }}
          >
            <LogOut size={15} color={COACH_ALERT} />
            <Text className="font-black uppercase" style={{ fontSize: 12, letterSpacing: 1, color: COACH_ALERT, fontStyle: "italic" }}>
              CERRAR SESIÓN // SALIR
            </Text>
          </PulseButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
