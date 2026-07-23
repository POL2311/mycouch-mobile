import {
  View, Text, TouchableOpacity, Pressable, ScrollView, Modal, ImageBackground, StyleSheet, TextInput, Image, Share,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { PulseButton } from "@/components/ui/PulseButton";
import { ShimmerScreen } from "@/components/ShimmerLoader";
import * as Haptics from "expo-haptics";
import { triggerImpact, triggerSuccess, triggerWarning } from "@/lib/haptics";
import { neonGlow } from "@/lib/neon";
import {
  Flame, Check, Star, Lock, LogOut, Mail, Zap, Settings, X, Droplet, Dumbbell, Utensils,
  Camera, ShieldCheck, Share2, Award, Eye, EyeOff, Activity, Link2,
} from "lucide-react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { usePortal, uploadProgressPhoto, isSelfCoached, joinCommunityRoom } from "@/lib/portal";
import { useAuth } from "@/lib/session";
import { useWorkout, todayDateStr } from "@/lib/workout";
import { useGamification, RANK_TIERS } from "@/lib/gamification";
import { WATER_TARGET_ML } from "@/components/workout-ui";
import { api } from "@/lib/api";

// ── Perfil ecosystem tokens ──────────────────────────────────────────────────
const VOLT   = "#CCFF00";
const CYAN   = "#00F0FF";
const OLED   = "#070708";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;

const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const HERO_IMG = "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=60";

// ══════════════════════════════════════════════════════════════════════════════
//  CONTRACTS — verbatim from MYCOACH_PROFILE_WEB_BLUEPRINT.md
// ══════════════════════════════════════════════════════════════════════════════
interface BioSession {
  id: string; name: string; date: string; completed: boolean;
  biometrics: {
    avgHeartRate: number | null; maxHeartRate: number | null;
    activeCalories: number | null; totalCalories: number | null;
    deviceSource: string | null;
    heartRateSeries: { t: string; bpm: number }[] | null;
  } | null;
}

// RankTier/RANK_TIERS ya no se definen aquí — vienen de lib/gamification.tsx,
// el único sistema de rango real de la app (unificación .cursorrules Parte
// 3: antes este archivo tenía su propia escalera basada en Student.streak,
// completamente desconectada del motor de XP que ya usaba portal/index.tsx).

// Shield style registry (blueprint §2.3 RANK_SHIELD_CFG, RN color mapping) —
// ahora indexado por posición en RANK_TIERS (0-5) en vez de por `level`.
const RANK_SHIELD_CFG: Record<number, { bg: string; borderColor: string; borderWidth: number; iconColor: string }> = {
  0: { bg: "rgba(120,53,15,0.25)", borderColor: "rgba(217,119,6,0.65)",  borderWidth: 1.5, iconColor: "#d97706" },
  1: { bg: "rgba(24,24,27,0.5)",   borderColor: "rgba(63,63,70,0.8)",    borderWidth: 1,   iconColor: "#71717a" },
  2: { bg: "rgba(15,23,42,0.5)",   borderColor: "rgba(100,116,139,0.5)", borderWidth: 1,   iconColor: "#94a3b8" },
  3: { bg: "rgba(66,32,6,0.3)",    borderColor: "rgba(234,179,8,0.5)",   borderWidth: 1.5, iconColor: "#eab308" },
  4: { bg: "rgba(24,24,27,0.5)",   borderColor: "rgba(63,63,70,0.7)",    borderWidth: 1,   iconColor: "#71717a" },
  5: { bg: "rgba(26,46,5,0.5)",    borderColor: "#a3e635",               borderWidth: 1.5, iconColor: "#a3e635" },
};

// ── Hero scrim — linear-gradient(to top, #070708 0%, transparent 100%) ──────
function HeroScrim() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="heroScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={OLED} stopOpacity="0.15" />
          <Stop offset="1" stopColor={OLED} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#heroScrim)" />
    </Svg>
  );
}

// ── HR sparkline — verbatim algorithm (blueprint §2.6) ───────────────────────
function HRSparkline({ series }: { series: { t: string; bpm: number }[] }) {
  const bpms   = series.map(p => p.bpm);
  const maxBpm = Math.max(...bpms);
  const minBpm = Math.min(...bpms);
  const range  = Math.max(maxBpm - minBpm, 1);
  const SAMPLE = 80;
  const step   = series.length > SAMPLE ? Math.ceil(series.length / SAMPLE) : 1;
  const points = series.filter((_, i) => i % step === 0).slice(0, SAMPLE);

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 28, gap: 1, marginTop: 8 }}>
      {points.map((p, i) => {
        const hPct  = Math.max(((p.bpm - minBpm) / range) * 100, 8);          // 8% floor
        const color = p.bpm >= maxBpm * 0.85 ? "#ef4444"                     // red zone
          : p.bpm >= maxBpm * 0.65 ? "#a3e635"                               // lime zone
          : "#3f3f46";                                                        // resting
        return (
          <View key={i} style={{ flex: 1, minWidth: 2, maxWidth: 6, height: `${hPct}%`, borderRadius: 1, backgroundColor: color }} />
        );
      })}
    </View>
  );
}

// ── 44×24 preference toggle (blueprint §3.3 switch spec) ─────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggle(); }}
      style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: on ? VOLT : "rgba(255, 255, 255, 0.06)", justifyContent: "center" }}
    >
      <MotiView
        animate={{ translateX: on ? 22 : 2 }}
        transition={{ type: "timing", duration: 200 }}
        style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? "#000000" : "rgba(255,255,255,0.3)" }}
      />
    </Pressable>
  );
}

// ── PREFERENCIAS overlay — local theater by design (blueprint §3.3 / sharp
// edge #3: toggles persist nothing; GUARDAR is a 1.6 s latch) ────────────────
function SettingsOverlay({ visible, onClose, name, planLabel }: {
  visible: boolean; onClose: () => void; name: string; planLabel: string;
}) {
  const [notifWorkout,   setNotifWorkout]   = useState(true);
  const [notifNutrition, setNotifNutrition] = useState(true);
  const [notifCommunity, setNotifCommunity] = useState(false);
  const [saved,          setSaved]          = useState(false);
  const insets = useSafeAreaInsets();

  const rows = [
    { title: "Recordatorios de Entrenamiento", sub: "Push al inicio de tu sesión programada", on: notifWorkout,   set: setNotifWorkout },
    { title: "Alertas de Nutrición",           sub: "Recordatorio de comidas y macros",       on: notifNutrition, set: setNotifNutrition },
    { title: "Actividad de Comunidad",         sub: "Nuevos posts y retos del equipo",        on: notifCommunity, set: setNotifCommunity },
  ];

  const save = () => {
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1600);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", padding: 24, paddingTop: insets.top + 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Text style={{ ...athletic, fontSize: 20, color: "#fff" }}>PREFERENCIAS</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            style={{
              flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
              backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)",
            }}
          >
            <X size={12} color={VOLT} />
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
          </TouchableOpacity>
        </View>

        <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER, marginBottom: 12 }}>
          🔔 NOTIFICACIONES
        </Text>
        {rows.map(row => (
          <View key={row.title} style={{ ...GLASS, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>{row.title}</Text>
              <Text style={{ fontSize: 10, color: SILVER, marginTop: 2 }}>{row.sub}</Text>
            </View>
            <Toggle on={row.on} onToggle={() => row.set(v => !v)} />
          </View>
        ))}

        <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER, marginTop: 14, marginBottom: 12 }}>
          👤 CUENTA
        </Text>
        {[["NOMBRE", name], ["EMAIL", "configurado en perfil"], ["PLAN", planLabel]].map(([label, value]) => (
          <View key={label} style={{ ...GLASS, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between" }}>
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER }}>{label}</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#d4d4d8" }}>{value}</Text>
          </View>
        ))}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={save}
          disabled={saved}
          style={{
            marginTop: 16, borderRadius: 999, paddingVertical: 15, alignItems: "center",
            backgroundColor: saved ? "transparent" : VOLT,
            borderWidth: saved ? 1.5 : 0, borderColor: VOLT,
          }}
        >
          <Text style={{ ...athletic, fontSize: 12, letterSpacing: 0.5, color: saved ? VOLT : "#000" }}>
            {saved ? "✓ PREFERENCIAS GUARDADAS" : "GUARDAR CAMBIOS"}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── IDENTIDAD Y SEGURIDAD overlay (Módulo 5) ──────────────────────────────────
// Alcance real vs. simulado, deliberado y documentado:
//  · Avatar   → REAL: sube vía POST /api/me/photos (uploadProgressPhoto, ya
//    real desde Módulo 4) con label "AVATAR"; se muestra la foto AVATAR más
//    reciente de detail.photos (el schema no tiene un campo avatarUrl propio
//    — Student solo tiene avatarInitials/avatarColor — así que "cuál foto es
//    el avatar activo" es una convención de cliente sobre datos reales).
//  · Peso base → REAL: mismo POST /api/me/biometrics que ya usa stats/index.tsx.
//  · Nombre/Email → NO existe ningún endpoint self-service para CLIENT en
//    mycouch (solo PATCH/PUT /api/students/[id], coach/admin-only). Se editan
//    y persisten SOLO en este dispositivo (AsyncStorage) — la UI lo declara
//    explícitamente, nunca finge una sincronización que no existe.
//  · Contraseña → NO existe endpoint de cambio de contraseña para CLIENT.
//    La validación reactiva es 100% real y funcional; el guardado queda
//    detrás de un candado "PRÓXIMAMENTE" — mismo patrón ya usado en
//    RetosTab (salas/index.tsx) para features con UI lista pero sin backend.
const PROFILE_OVERRIDE_KEY = "mc:profile_override";

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: ok ? VOLT : "rgba(255,255,255,0.08)" }}>
        {ok && <Check size={9} color="#000" strokeWidth={3.5} />}
      </View>
      <Text className="font-mono" style={{ fontSize: 9, color: ok ? VOLT : SILVER }}>{label}</Text>
    </View>
  );
}

function IdentityModal({ visible, onClose, student, avatarUrl, token, onRefresh }: {
  visible: boolean; onClose: () => void;
  student: { name?: string; email?: string; currentWeight?: number } | null;
  avatarUrl: string | null;
  token: string | null;
  onRefresh: () => void;
}) {
  const [name,   setName]   = useState(student?.name ?? "");
  const [email,  setEmail]  = useState(student?.email ?? "");
  const [weight, setWeight] = useState(student?.currentWeight ? String(student.currentWeight) : "");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(student?.name ?? "");
    setEmail(student?.email ?? "");
    setWeight(student?.currentWeight ? String(student.currentWeight) : "");
    AsyncStorage.getItem(PROFILE_OVERRIDE_KEY).then(raw => {
      if (!raw) return;
      const override = JSON.parse(raw) as { name?: string; email?: string };
      if (override.name)  setName(override.name);
      if (override.email) setEmail(override.email);
    }).catch(() => {});
  }, [visible, student?.name, student?.email, student?.currentWeight]);

  const pwRules = {
    length: newPassword.length >= 8,
    upper:  /[A-Z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    match:  newPassword.length > 0 && newPassword === confirmPassword,
  };
  const pwValid = pwRules.length && pwRules.upper && pwRules.number && pwRules.match;

  const pickAvatar = useCallback(async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { triggerWarning(); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    const uploaded = await uploadProgressPhoto(result.assets[0].uri, "AVATAR", token);
    setUploadingAvatar(false);
    if (uploaded) { triggerSuccess(); onRefresh(); } else { triggerWarning(); }
  }, [token, onRefresh]);

  const save = useCallback(async () => {
    setSaving(true);
    await AsyncStorage.setItem(PROFILE_OVERRIDE_KEY, JSON.stringify({ name, email })).catch(() => {});

    const kg = Math.round(parseFloat(weight.replace(",", ".")) * 10) / 10;
    if (Number.isFinite(kg) && kg >= 20 && kg <= 500 && kg !== student?.currentWeight && token) {
      try {
        await api("/api/me/biometrics", { method: "POST", token, body: { weight: kg, date: todayDateStr() } });
        onRefresh();
      } catch { /* peso local ya reflejado en el input; se reintenta en la próxima apertura */ }
    }

    setSaving(false);
    setSaved(true);
    triggerSuccess();
    setTimeout(() => setSaved(false), 1800);
  }, [name, email, weight, student?.currentWeight, token, onRefresh]);

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Responsive fix: insets explícitos + KeyboardAvoidingView — este
          modal tiene varios TextInput (nombre/correo/peso/contraseña); sin
          esto, el teclado tapaba GUARDAR CAMBIOS y el botón CERRAR quedaba a
          merced de un SafeAreaView que un <Modal> no siempre resuelve bien. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.97)", paddingTop: insets.top + 12, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} color={VOLT} />
                <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>IDENTIDAD Y SEGURIDAD</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onClose}
                hitSlop={10}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)" }}
              >
                <X size={12} color={VOLT} />
                <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
              </TouchableOpacity>
            </View>

            {/* Avatar rápido — sube foto real vía POST /api/me/photos */}
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
                <View style={{ width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: VOLT, alignItems: "center", justifyContent: "center", backgroundColor: "#1C1C1E", overflow: "hidden" }}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text className="font-black" style={{ fontSize: 26, color: "#fff" }}>{(name || "AT").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: VOLT, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#070708" }}>
                  <Camera size={14} color="#000" />
                </View>
              </Pressable>
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER, marginTop: 10 }}>
                {uploadingAvatar ? "SUBIENDO..." : "TOCA PARA CAMBIAR FOTO"}
              </Text>
            </View>

            {/* Datos de perfil */}
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1.5, color: SILVER, marginBottom: 10 }}>DATOS DE PERFIL</Text>
            {[
              { label: "NOMBRE COMPLETO", value: name, set: setName, kb: "default" as const },
              { label: "CORREO",         value: email, set: setEmail, kb: "email-address" as const },
              { label: "PESO BASE (KG)", value: weight, set: setWeight, kb: "decimal-pad" as const },
            ].map(f => (
              <View key={f.label} style={{ marginBottom: 10 }}>
                <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER, marginBottom: 4 }}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.set}
                  keyboardType={f.kb}
                  autoCapitalize={f.kb === "email-address" ? "none" : "words"}
                  placeholderTextColor="#52525b"
                  selectionColor={VOLT}
                  style={{ backgroundColor: "#1C1C1E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", fontSize: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
                />
              </View>
            ))}
            <Text className="font-mono" style={{ fontSize: 8, color: SILVER, lineHeight: 12, marginBottom: 4 }}>
              Nombre y correo se guardan solo en este dispositivo — mycouch aún no expone un endpoint de autoedición para alumnos. El peso base sí sincroniza con tu bitácora real.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              disabled={saving}
              onPress={save}
              style={{ marginTop: 8, borderRadius: 999, paddingVertical: 14, alignItems: "center", backgroundColor: saved ? "transparent" : VOLT, borderWidth: saved ? 1.5 : 0, borderColor: VOLT }}
            >
              <Text style={{ ...athletic, fontSize: 12, color: saved ? VOLT : "#000" }}>
                {saved ? "✓ GUARDADO" : saving ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
              </Text>
            </TouchableOpacity>

            {/* Cambio de contraseña — validación reactiva real, guardado
                detrás de PRÓXIMAMENTE (sin endpoint CLIENT en mycouch). */}
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1.5, color: SILVER, marginTop: 26, marginBottom: 10 }}>CAMBIAR CONTRASEÑA</Text>
            <View style={{ ...GLASS, borderRadius: 16, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#1C1C1E", borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 8 }}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Nueva contraseña"
                  placeholderTextColor="#52525b"
                  secureTextEntry={!showPw}
                  selectionColor={VOLT}
                  style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 12 }}
                />
                <Pressable onPress={() => setShowPw(v => !v)} hitSlop={8}>
                  {showPw ? <EyeOff size={16} color={SILVER} /> : <Eye size={16} color={SILVER} />}
                </Pressable>
              </View>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirmar contraseña"
                placeholderTextColor="#52525b"
                secureTextEntry={!showPw}
                selectionColor={VOLT}
                style={{ backgroundColor: "#1C1C1E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", fontSize: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <PasswordRule ok={pwRules.length} label="8+ CARACTERES" />
                <PasswordRule ok={pwRules.upper}  label="1 MAYÚSCULA" />
                <PasswordRule ok={pwRules.number} label="1 NÚMERO" />
                <PasswordRule ok={pwRules.match}  label="COINCIDE" />
              </View>
              <View style={{ marginTop: 14, borderRadius: 12, overflow: "hidden" }}>
                <View style={{ paddingVertical: 13, alignItems: "center", backgroundColor: pwValid ? "rgba(204,255,0,0.12)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: pwValid ? "rgba(204,255,0,0.35)" : "rgba(255,255,255,0.08)", borderRadius: 12 }}>
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: pwValid ? VOLT : SILVER }}>
                    {pwValid ? "⚡ LISTO — DISPONIBLE PRÓXIMAMENTE" : "COMPLETA LOS REQUISITOS PARA CONTINUAR"}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── VINCULAR CON UN COACH (Módulo 1 "[ 🛡️ UNIRME A UN COACH ]") — la mitad
// real de la elección de modo operativo del onboarding. mycouch no tiene
// registro público de cuentas, así que ese modal previo al login solo podía
// cachear la intención localmente (app/auth/onboarding.tsx); esta es la
// pieza que SÍ puede ejecutar algo real, porque ya hay una sesión
// autenticada: el mismo POST /api/community/join (código privado) que Salas
// ya usa para unirse a una sala — linkStudentToCoach() del lado servidor
// pisa Student.coachId de verdad. Solo visible cuando isSelfCoached(student)
// — un alumno que ya tiene coach no necesita ni debe poder reemplazarlo aquí.
function CoachLinkModal({ visible, onClose, token, onLinked }: {
  visible: boolean; onClose: () => void; token: string | null; onLinked: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const result = await joinCommunityRoom({ code: trimmed }, token);
    setBusy(false);
    if (result.ok) {
      triggerSuccess();
      setSuccess(result.coachName ?? "tu coach");
      onLinked();
      setTimeout(() => { setSuccess(null); setCode(""); onClose(); }, 1400);
    } else {
      triggerWarning();
      setError(result.error ?? "CÓDIGO INVÁLIDO");
    }
  }, [code, token, onLinked, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", padding: 24, paddingTop: 90, justifyContent: "center" }}>
        <View style={{ ...GLASS, borderRadius: 20, padding: 22 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Link2 size={16} color={VOLT} />
              <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>VINCULAR CON UN COACH</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={16} color={SILVER} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: SILVER, lineHeight: 17, marginBottom: 16 }}>
            Ingresa el código táctico que te compartió tu coach. Al vincularte, tus rutinas y dietas locales de auto-entrenador quedan en tu dispositivo — el coach asignará las suyas cuando lo considere.
          </Text>
          <TextInput
            value={code}
            onChangeText={t => { setCode(t.toUpperCase()); setError(null); }}
            placeholder="CÓDIGO TÁCTICO"
            placeholderTextColor="#52525b"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy && !success}
            selectionColor={VOLT}
            className="font-black"
            style={{
              height: 54, textAlign: "center", fontSize: 16, letterSpacing: 3, color: success ? VOLT : error ? "#f87171" : "#fff",
              backgroundColor: "#1C1C1E", borderRadius: 14, borderWidth: 1.5,
              borderColor: success ? VOLT : error ? "#f87171" : "rgba(255,255,255,0.1)",
            }}
          />
          {error && (
            <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 0.5, color: "#f87171", marginTop: 8 }}>
              ✕ {error}
            </Text>
          )}
          {success && (
            <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 0.5, color: VOLT, marginTop: 8 }}>
              ⚡ VINCULADO CON {success.toUpperCase()}
            </Text>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy || !code.trim() || !!success}
            onPress={submit}
            style={{
              marginTop: 16, borderRadius: 999, paddingVertical: 14, alignItems: "center",
              backgroundColor: VOLT, opacity: busy || !code.trim() || !!success ? 0.5 : 1,
            }}
          >
            <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>
              {busy ? "VINCULANDO..." : "VINCULAR"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── BITÁCORA TÁCTICA / telemetría de ritmo cardíaco — encapsulada en su
// propio modal (limpieza de UI). Antes esta lista (potencialmente larga: una
// tarjeta por sesión de entreno con BPM/KCAL de Apple Watch) vivía inline en
// el scroll principal del Perfil y lo saturaba visualmente; ahora vive
// aislada, detrás de un único botón de acceso. Misma lógica de render
// (loading shimmer / vacío / lista con HRSparkline), solo movida de sitio. ──
function TelemetryLogModal({ visible, onClose, loading, history }: {
  visible: boolean; onClose: () => void; loading: boolean; history: BioSession[];
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.97)", paddingTop: insets.top + 12, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 }}>
          <View>
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER }}>ARCHIVO DE MISIONES</Text>
            <Text style={{ ...athletic, fontSize: 20, color: "#fff", marginTop: 2 }}>BITÁCORA TÁCTICA</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)" }}
          >
            <X size={12} color={VOLT} />
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {loading ? (
            [0, 1, 2].map(i => (
              <MotiView
                key={i}
                from={{ opacity: 0.4 }}
                animate={{ opacity: 0.9 }}
                transition={{ type: "timing", duration: 600, loop: true, repeatReverse: true }}
                style={{ height: 72, borderRadius: 14, backgroundColor: "rgba(24,24,27,0.6)", marginBottom: 10 }}
              />
            ))
          ) : history.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: "#d4d4d8" }}>
                SIN SESIONES REGISTRADAS
              </Text>
              <Text className="text-center" style={{ fontSize: 11, color: SILVER, marginTop: 6, lineHeight: 16 }}>
                Tus sesiones apareceran aqui tras completar tu primer entrenamiento.
              </Text>
            </View>
          ) : (
            history.map(session => {
              const dateLabel = (session.date ?? "").slice(0, 10).split("-").reverse().join("/");
              const bio       = session.biometrics;
              const hasHrData = Array.isArray(bio?.heartRateSeries) && (bio?.heartRateSeries?.length ?? 0) > 0;
              const hasAnyBio = !!bio && (bio.avgHeartRate != null || bio.activeCalories != null || !!bio.deviceSource);
              return (
                <View key={session.id} style={{ ...GLASS, borderRadius: 16, marginBottom: 10, padding: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: VOLT, alignItems: "center", justifyContent: "center" }}>
                          <Check size={10} color="#000" strokeWidth={3.5} />
                        </View>
                        <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: "#d4d4d8" }}>{dateLabel}</Text>
                      </View>
                      <Text style={{ ...athletic, fontSize: 14, color: "#fff", marginTop: 6 }} numberOfLines={2}>
                        {session.name}
                      </Text>
                      {hasHrData && bio?.heartRateSeries && (
                        <>
                          <Text className="font-mono" style={{ fontSize: 7, letterSpacing: 1, color: SILVER, marginTop: 8 }}>
                            HR CURVE · {bio.heartRateSeries.length} PTS
                          </Text>
                          <HRSparkline series={bio.heartRateSeries} />
                        </>
                      )}
                    </View>
                    <View style={{ gap: 4, alignItems: "flex-end" }}>
                      {hasAnyBio && bio ? (
                        <>
                          {bio.avgHeartRate != null && (
                            <View style={{ backgroundColor: "rgba(24,24,27,0.6)", borderWidth: 1, borderColor: "rgba(39,39,42,0.8)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: "#f87171" }}>❤ {bio.avgHeartRate} BPM</Text>
                            </View>
                          )}
                          {bio.maxHeartRate != null && (
                            <View style={{ backgroundColor: "rgba(24,24,27,0.6)", borderWidth: 1, borderColor: "rgba(39,39,42,0.8)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: "#d4d4d8" }}>MAX {bio.maxHeartRate} BPM</Text>
                            </View>
                          )}
                          {bio.activeCalories != null && (
                            <View style={{ backgroundColor: "rgba(24,24,27,0.6)", borderWidth: 1, borderColor: "rgba(39,39,42,0.8)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: VOLT }}>⚡ {bio.activeCalories} KCAL</Text>
                            </View>
                          )}
                          {bio.deviceSource && (
                            <View style={{ backgroundColor: "rgba(24,24,27,0.6)", borderWidth: 1, borderColor: "rgba(39,39,42,0.8)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: CYAN }}>◈ {bio.deviceSource.slice(0, 20)}</Text>
                            </View>
                          )}
                        </>
                      ) : (
                        <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: SILVER }}>
                          [ SIN REGISTRO TELEMÉTRICO ]
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function PerfilScreen() {
  const { student, detail, isLoading, refresh } = usePortal();
  const { token, logout } = useAuth();
  const { doneEx, allDone } = useWorkout();
  const { totalXP, currentRank, progressPct, nextThresholdXP, addXP } = useGamification();
  const insets = useSafeAreaInsets();

  const streak = student?.streak ?? 0;
  const stage  = student?.stage ?? "Definición";

  const planLabel = stage === "Volumen" ? "Plan Berserker" : stage === "Definición" ? "Plan Shredder" : "Plan Performance";
  const monthPct  = Math.min(100, Math.round((streak / 30) * 100));

  // ── Rango unificado (.cursorrules Parte 3 "Unificación de la Lógica de
  // Nivel") — el ascenso es 100% por XP real (lib/gamification.tsx), nunca
  // por racha. La racha solo define la FECHA LÍMITE de la temporada actual:
  // una ventana recurrente de 14 días para acumular el XP necesario, no una
  // vía alterna de ascenso. Antes esta pantalla tenía su PROPIA escalera
  // basada en streak, contradiciendo el texto "150 XP" que ya vivía en el
  // primer tier — ya no: currentRank/progressPct/nextThresholdXP son los
  // mismos que ve portal/index.tsx en su header.
  const activeTierIdx = Math.max(0, RANK_TIERS.findIndex(t => t.name === currentRank));
  const activeTier     = RANK_TIERS[activeTierIdx]!;
  const SEASON_LENGTH_DAYS   = 14;
  const daysIntoSeason       = streak % SEASON_LENGTH_DAYS;
  const daysRemainingInSeason = SEASON_LENGTH_DAYS - daysIntoSeason;

  // ── Misiones diarias — otorgan XP real (useGamification().addXP) sobre
  // señales reales, no simuladas: agua (mismo endpoint que portal/index.tsx
  // y nutrition/index.tsx), sets de hoy (useWorkout().allDone — el bloqueo
  // duro de exceedsThreshold en exercise/[id].tsx ya impide registrar un set
  // por debajo del mínimo, así que "todos los sets de hoy" implica "todos
  // cumplieron el mínimo"), y comidas (GET /api/me/checks, mismo endpoint
  // que nutrition/index.tsx usa para su propio checklist). ─────────────────
  const [waterMl, setWaterMl] = useState(0);
  const [mealsCheckedToday, setMealsCheckedToday] = useState(0);
  const [claimedMissions, setClaimedMissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    const today = todayDateStr();
    api<{ totalMl: number }>(`/api/student/water?date=${today}`, { token })
      .then(r => setWaterMl(r.totalMl ?? 0)).catch(() => {});
    api<{ checks: { itemKey: string }[] }>(`/api/me/checks?date=${today}`, { token })
      .then(r => setMealsCheckedToday(Array.isArray(r.checks) ? r.checks.length : 0))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    AsyncStorage.getItem(`mc:missions_claimed:${todayDateStr()}`)
      .then(raw => { if (raw) setClaimedMissions(new Set(JSON.parse(raw))); })
      .catch(() => {});
  }, []);

  const claimMission = useCallback((id: string, xp: number) => {
    if (claimedMissions.has(id)) return;
    triggerSuccess();
    addXP(xp);
    setClaimedMissions(prev => {
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(`mc:missions_claimed:${todayDateStr()}`, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, [claimedMissions, addXP]);

  const totalMealsToday = detail?.diet.meals.length ?? 0;
  const missions = [
    {
      id: "water", xp: 25, icon: Droplet,
      label: "Completar checklist de agua de hoy",
      done: waterMl >= WATER_TARGET_ML,
    },
    {
      id: "sets", xp: 50, icon: Dumbbell,
      label: "Cumplir el peso mínimo en todas las series de entreno",
      done: allDone,
    },
    {
      id: "meals", xp: 50, icon: Utensils,
      label: "Registrar racha perfecta de comidas",
      done: totalMealsToday > 0 && mealsCheckedToday >= totalMealsToday,
    },
  ];

  // Auto-otorgamiento — cero interacción manual (.cursorrules "Automatización
  // de Misiones Diarias"). En cuanto la señal real de negocio confirma que
  // una misión se cumplió, se reclama sola; el checkbox de abajo es de solo
  // lectura, nunca un botón. claimMission ya es idempotente por día
  // (claimedMissions persistido), así que este efecto puede re-evaluar en
  // cada cambio de señal sin riesgo de otorgar el mismo XP dos veces.
  useEffect(() => {
    for (const m of missions) {
      if (m.done && !claimedMissions.has(m.id)) claimMission(m.id, m.xp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waterMl, allDone, totalMealsToday, mealsCheckedToday, claimedMissions]);

  // ── Streak matrix (D1–D7) ─────────────────────────────────────────────────
  // The web reads local-week nutrition/workout Sets; those stores don't exist
  // on mobile yet, so past cells light while the streak covers them and today
  // lights once any set lands. Swap for real per-day Sets when they ship.
  const activeDayIndex = ((new Date().getDay() + 6) % 7) + 1;   // 1=Mon…7=Sun
  const todayActive    = doneEx.size > 0;
  const isDayDone = (dayId: number) =>
    dayId === activeDayIndex ? todayActive : dayId < activeDayIndex && activeDayIndex - dayId <= streak;

  // ── Wallet (read-only rail; hydrated like the web root, fallback 0) ──────
  const [walletBalance, setWalletBalance] = useState(0);
  useEffect(() => {
    if (!token) return;
    api<{ student?: { walletBalance?: number } }>("/api/me", { token })
      .then(d => setWalletBalance(d.student?.walletBalance ?? 0))
      .catch(() => {});
  }, [token]);

  // ── Bitácora Táctica (real: WorkoutSession + WorkoutBiometrics) ───────────
  const [bioHistory, setBioHistory] = useState<BioSession[]>([]);
  const [bioLoading, setBioLoading] = useState(true);
  useEffect(() => {
    if (!token) { setBioLoading(false); return; }
    api<BioSession[]>("/api/student/workout-session/history", { token })
      .then(data => { if (Array.isArray(data)) setBioHistory(data); })
      .catch(() => {})
      .finally(() => setBioLoading(false));
  }, [token]);

  // ── Overlays ──────────────────────────────────────────────────────────────
  const [showRankDrawer, setShowRankDrawer] = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showIdentity,   setShowIdentity]   = useState(false);
  const [showCoachLink,  setShowCoachLink]  = useState(false);
  const selfCoachedStudent = isSelfCoached(student);
  const [showTelemetry,  setShowTelemetry]  = useState(false);

  // Avatar activo (Módulo 5) — la foto AVATAR más reciente entre las fotos
  // reales de detail.photos (mismo dato que alimenta la galería mensual de
  // Módulo 4). El schema de Student no tiene un campo de foto de perfil
  // propio, así que "cuál es el avatar" es una convención de cliente.
  const avatarUrl = detail?.photos?.find(p => p.label === "AVATAR")?.url ?? null;

  const shareBadge = useCallback(async () => {
    triggerImpact();
    try {
      await Share.share({
        message: `🏅 Soy ${currentRank} en MyCoach — ${activeTier.sub}\n${totalXP} XP acumulados · ${streak} días de racha.\n\nÚnete al equipo y supera tu propio récord.`,
      });
    } catch { /* usuario canceló el share sheet — nada que hacer */ }
  }, [currentRank, activeTier.sub, totalXP, streak]);

  const shareChallenge = useCallback(async () => {
    triggerImpact();
    try {
      await Share.share({
        message: `⚡ Te reto a superar mi marca en MyCoach.\nRango actual: ${currentRank} · PR Deadlift ${student?.prDeadlift ?? 0}kg\n\nÚnete a mi unidad: mycoach://salas`,
      });
    } catch { /* usuario canceló el share sheet — nada que hacer */ }
  }, [currentRank, student?.prDeadlift]);

  // ── Logout — pure state teardown, no navigation call. app/_layout.tsx now
  // gates (portal)/(coach)/index behind <Stack.Protected guard={...}>, so the
  // moment token/user clear here, the root layout's guards flip in the same
  // commit and Expo Router itself unmounts this entire protected tree and
  // lands on the login screen — no router.replace() race is possible because
  // there's no longer an imperative call on either side of it.
  const handleLogout = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await logout();
    } catch (error) {
      console.error("Logout pipeline exception trapped:", error);
    }
  };

  const prRows = [
    { label: "SQUAT",    kg: student?.prSquat    ?? 0, accent: VOLT },
    { label: "DEADLIFT", kg: student?.prDeadlift ?? 0, accent: CYAN },
    { label: "BENCH",    kg: student?.prBench    ?? 0, accent: "#808080" },
  ];

  // Without this gate, rank/streak/PRs all briefly render their ?? 0 / ??
  // "Definición" fallbacks before the real portal fetch resolves — not a
  // crash, but a flash of wrong numbers (e.g. "0 días de racha") on mount.
  if (isLoading) {
    return (
      <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: OLED }}>
        <ShimmerScreen variant="macro-card" label="CARGANDO PERFIL..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: OLED }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>

        {/* ── 1 · Retina hero banner ── */}
        <ImageBackground
          source={{ uri: HERO_IMG }}
          resizeMode="cover"
          imageStyle={{ opacity: 0.55 }}
          style={{ height: 220, justifyContent: "flex-end" }}
        >
          <HeroScrim />

          {/* Glass identity capsule — top right */}
          <View
            style={{
              position: "absolute", top: 56, right: 20,
              flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: "rgba(28,28,30,0.65)", borderRadius: 16,
              borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)",
              paddingHorizontal: 12, paddingVertical: 7,
            }}
          >
            <MotiView
              from={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              transition={{ type: "timing", duration: 700, loop: true, repeatReverse: true }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: VOLT }} />
            </MotiView>
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: "#fff", textTransform: "uppercase" }}>
              {(student?.name ?? "ATLETA").split(" ")[0]} · {stage} · E{student?.stageNumber ?? 1}
            </Text>
          </View>

          {/* Flagship motivation stack */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <Text style={{ ...athletic, fontSize: 26, lineHeight: 28, letterSpacing: -0.5, color: "#ffffff" }}>
              UNA SERIE MÁS,{"\n"}UNA COMIDA MÁS.
            </Text>
            <Text style={{ ...athletic, fontSize: 15, color: VOLT, marginTop: 4 }}>
              DISCIPLINA ABSOLUTA.
            </Text>
          </View>
        </ImageBackground>

        {/* ── 2 · RACHA DE DÍAS matrix ── */}
        <View style={{ ...GLASS, borderRadius: 20, marginHorizontal: 20, marginTop: 16, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
              RACHA DE DÍAS
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text className="font-black" style={{ fontSize: 15, color: VOLT }}>{streak} DÍAS</Text>
              <Flame size={15} color={VOLT} fill={VOLT} />
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {[1, 2, 3, 4, 5, 6, 7].map((dayId, i) => {
              const done    = isDayDone(dayId);
              const isToday = dayId === activeDayIndex;
              return (
                <View key={dayId} style={{ alignItems: "center", gap: 5 }}>
                  <MotiView
                    from={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", damping: 14, delay: i * 55 }}
                    style={{
                      width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
                      backgroundColor: done ? VOLT : "rgba(255,255,255,0.04)",
                      borderWidth: isToday ? 2 : 1,
                      borderColor: isToday ? CYAN : done ? VOLT : "rgba(255, 255, 255, 0.06)",
                      ...(done ? { shadowColor: VOLT, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : null),
                    }}
                  >
                    {done
                      ? <Check size={13} color="#000" strokeWidth={3.5} />
                      : <Text className="font-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{dayId}</Text>}
                  </MotiView>
                  <Text className="font-mono" style={{ fontSize: 7, letterSpacing: 0.5, color: isToday ? CYAN : "#52525b" }}>
                    D{dayId}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── 3 · RANGO card → Jerarquía drawer — elemento crítico activo
             (Módulo 3): lleva el resplandor LED permanente de lib/neon.ts. ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { triggerImpact(); setShowRankDrawer(true); }}
          style={{ ...GLASS, ...neonGlow, borderRadius: 20, marginHorizontal: 20, marginTop: 12, padding: 16, minHeight: 110 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
                RANGO · {totalXP} XP
              </Text>
              <Text className="font-black uppercase" style={{ fontSize: 24, color: "#fff", marginTop: 4 }}>{currentRank}</Text>
              <Text className="font-black" style={{ fontSize: 11, letterSpacing: 1, color: VOLT, marginTop: 2 }}>{activeTier.sub}</Text>
            </View>
            <Star size={30} color={CYAN} fill="rgba(0,240,255,0.2)" />
          </View>

          {/* Barra de XP hacia el siguiente rango — track #1C1C1E, fill
              #CCFF00 (.cursorrules §2/§3), directamente bajo el bloque de
              texto principal como pide el rediseño. Progreso 100% real
              (lib/gamification.tsx), no derivado de la racha. */}
          <View style={{ marginTop: 14 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: "#1C1C1E", overflow: "hidden" }}>
              <MotiView
                from={{ width: "0%" }}
                animate={{ width: `${progressPct}%` }}
                transition={{ type: "timing", duration: 600 }}
                style={{
                  height: "100%", borderRadius: 3, backgroundColor: VOLT,
                  shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                }}
              />
            </View>
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER, marginTop: 6, textTransform: "uppercase" }}>
              {nextThresholdXP !== null
                ? `${nextThresholdXP - totalXP} XP PARA EL SIGUIENTE RANGO`
                : "RANGO MÁXIMO ALCANZADO"}
            </Text>
          </View>

          {/* Fecha límite de temporada — el tiempo ya NO otorga el ascenso
              por sí mismo, solo marca cuándo se reinicia la ventana para
              acumular XP (.cursorrules Parte 3 "Unificación"). */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
            <Flame size={11} color={CYAN} />
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: CYAN, textTransform: "uppercase" }}>
              TEMPORADA ACTUAL · {daysRemainingInSeason} {daysRemainingInSeason === 1 ? "DÍA RESTANTE" : "DÍAS RESTANTES"}
            </Text>
          </View>

          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginTop: 10 }}>
            VER JERARQUÍA ›
          </Text>
        </TouchableOpacity>

        {/* ── 3B · MISIONES DIARIAS — cero interacción manual (.cursorrules
             "Automatización de Misiones Diarias"): el checkbox es puramente
             de lectura, refleja la regla de negocio real (agua ≥3.0L, sets
             de hoy sin bloqueo de peso mínimo, checklist de comidas 100%) y
             el XP ya se otorgó automáticamente por el useEffect de arriba en
             el instante en que la señal se cumplió — no hay nada que tocar. ── */}
        <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase", marginTop: 20, paddingHorizontal: 20, marginBottom: 10 }}>
          Misiones diarias
        </Text>
        <View style={{ marginHorizontal: 20, gap: 8 }}>
          {missions.map(m => {
            const claimed = claimedMissions.has(m.id);
            const Icon = m.icon;
            return (
              <View
                key={m.id}
                style={{
                  ...GLASS, borderRadius: 14, padding: 14,
                  flexDirection: "row", alignItems: "center", gap: 12,
                  borderColor: claimed ? "rgba(204,255,0,0.4)" : "rgba(255,255,255,0.06)",
                  borderWidth: claimed ? 1.5 : 1,
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center",
                    backgroundColor: claimed ? VOLT : "transparent",
                    borderWidth: 1.5, borderColor: claimed ? VOLT : "rgba(255,255,255,0.2)",
                  }}
                >
                  {claimed && <Check size={14} color="#000" strokeWidth={3.5} />}
                </View>
                <Icon size={15} color={claimed ? VOLT : m.done ? VOLT : SILVER} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12, fontWeight: "700",
                      color: claimed ? "rgba(255,255,255,0.4)" : "#fff",
                      textDecorationLine: claimed ? "line-through" : "none",
                    }}
                  >
                    {m.label}
                  </Text>
                </View>
                <Text className="font-black" style={{ fontSize: 12, color: claimed ? SILVER : VOLT }}>
                  +{m.xp} XP
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── 4 · BILLETERA TÁCTICA ── */}
        <View style={{ ...GLASS, borderRadius: 20, marginHorizontal: 20, marginTop: 12, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
              BILLETERA TÁCTICA
            </Text>
            <View style={{ borderWidth: 1, borderColor: "rgba(204,255,0,0.3)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text className="font-mono" style={{ fontSize: 7, letterSpacing: 1, color: VOLT }}>ESCROW</Text>
            </View>
          </View>
          <Text className="font-black" style={{ fontSize: 34, color: VOLT, marginTop: 6 }}>
            $ {walletBalance.toLocaleString()} <Text style={{ fontSize: 14, color: "rgba(204,255,0,0.5)" }}>USD</Text>
          </Text>
        </View>

        {/* ── 5 · RÉCORDS PERSONALES 3-col grid ── */}
        <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase", marginTop: 20, paddingHorizontal: 20, marginBottom: 10 }}>
          RÉCORDS PERSONALES
        </Text>
        <View style={{ ...GLASS, borderRadius: 20, marginHorizontal: 20, padding: 16, flexDirection: "row" }}>
          {prRows.map((row, i) => (
            <View
              key={row.label}
              style={{
                flex: 1, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: row.accent,
                marginLeft: i > 0 ? 12 : 0,
              }}
            >
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>{row.label}</Text>
              <Text className="font-black" style={{ fontSize: 20, color: "#fff", marginTop: 4 }}>
                {row.kg > 0 ? row.kg : "—"}
              </Text>
              <Text className="font-mono" style={{ fontSize: 8, color: SILVER }}>
                {row.kg > 0 ? "KG" : "SIN LOG"}
              </Text>
            </View>
          ))}
        </View>

        {/* ── 6 · MURO DE HONOR ── */}
        <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase", marginTop: 20, paddingHorizontal: 20, marginBottom: 10 }}>
          MURO DE HONOR
        </Text>
        <View style={{ marginHorizontal: 20, gap: 10 }}>
          <View style={{ ...GLASS, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Mail size={16} color={SILVER} />
            <View>
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>CORREO</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", marginTop: 1 }}>
                {student?.email ?? "atleta@elite.com"}
              </Text>
            </View>
          </View>
          {/* paymentStatus isn't in the mobile portal payload yet, so the
              conditional `Cancelar` chip + cancellation sheet stay web-only. */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Zap size={16} color={VOLT} fill={VOLT} />
            <View>
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>SUSCRIPCIÓN</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", marginTop: 1 }}>{planLabel}</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { triggerImpact(); setShowIdentity(true); }}
            style={{ ...GLASS, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <ShieldCheck size={16} color={VOLT} />
            <View style={{ flex: 1 }}>
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>IDENTIDAD Y SEGURIDAD</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", marginTop: 1 }}>Nombre, correo, peso, contraseña y avatar</Text>
            </View>
            <Text style={{ fontSize: 14, color: SILVER }}>›</Text>
          </TouchableOpacity>
          {selfCoachedStudent && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { triggerImpact(); setShowCoachLink(true); }}
              style={{ ...GLASS, borderColor: "rgba(204,255,0,0.25)", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Link2 size={16} color={VOLT} />
              <View style={{ flex: 1 }}>
                <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>MODO AUTO-ENTRENADOR</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", marginTop: 1 }}>Vincular con un coach</Text>
              </View>
              <Text style={{ fontSize: 14, color: SILVER }}>›</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowSettings(true)}
            style={{ ...GLASS, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Settings size={16} color={SILVER} />
            <View style={{ flex: 1 }}>
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>AJUSTES</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", marginTop: 1 }}>Preferencia de cuenta</Text>
            </View>
            <Text style={{ fontSize: 14, color: SILVER }}>›</Text>
          </TouchableOpacity>

          {/* Compartir — Share API nativa (Módulo 5), sin librería extra */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={shareBadge}
              style={{ ...GLASS, flex: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 6 }}
            >
              <Award size={18} color={VOLT} />
              <Text className="font-mono text-center" style={{ fontSize: 8, letterSpacing: 0.8, color: "#fff" }}>COMPARTIR{"\n"}INSIGNIA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={shareChallenge}
              style={{ ...GLASS, flex: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 6 }}
            >
              <Share2 size={18} color={CYAN} />
              <Text className="font-mono text-center" style={{ fontSize: 8, letterSpacing: 0.8, color: "#fff" }}>COMPARTIR{"\n"}RETO</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 7 · PROGRESO MENSUAL ── */}
        <View style={{ marginHorizontal: 20, marginTop: 20 }}>
          <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase", marginBottom: 8 }}>
            PROGRESO MENSUAL <Text style={{ color: VOLT }}>{monthPct}% COMPLETADO</Text>
          </Text>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <MotiView
              from={{ width: "0%" }}
              animate={{ width: `${monthPct}%` }}
              transition={{ type: "timing", duration: 700 }}
              style={{
                height: "100%", borderRadius: 5, backgroundColor: VOLT,
                shadowColor: VOLT, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
              }}
            />
          </View>
        </View>

        {/* ── 8 · Acceso encapsulado a la Bitácora Táctica (limpieza de UI)
             — la lista de sesiones con BPM/KCAL vive ahora en su propio
             modal (TelemetryLogModal), no en el scroll principal. ── */}
        <View style={{ marginHorizontal: 20, marginTop: 24 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { triggerImpact(); setShowTelemetry(true); }}
            style={{ ...GLASS, width: "100%", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Activity size={18} color={VOLT} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...athletic, fontSize: 13, color: "#fff" }}>Ver estadísticas de ritmo cardíaco</Text>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: SILVER, marginTop: 2 }}>
                {bioLoading ? "Cargando..." : `${bioHistory.length} sesión${bioHistory.length === 1 ? "" : "es"} registrada${bioHistory.length === 1 ? "" : "s"}`}
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: SILVER }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── 9 · Logout command latch — the ONLY session-destruction surface
            in the app; SALIR was purged from the tab dock entirely. ── */}
        <PulseButton
          glowColor="#ef4444"
          onPress={handleLogout}
          style={{
            height: 50, borderRadius: 16, marginHorizontal: 20, marginTop: 24,
            borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)", backgroundColor: "rgba(239, 68, 68, 0.05)",
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <LogOut size={15} color="#f87171" />
          <Text className="font-black uppercase" style={{ fontSize: 12, letterSpacing: 1, color: "#f87171", fontStyle: "italic" }}>
            CERRAR SESIÓN // SALIR
          </Text>
        </PulseButton>
      </ScrollView>

      {/* ── JERARQUÍA Y RANGOS DE PODER drawer ── */}
      <Modal visible={showRankDrawer} transparent animationType="fade" onRequestClose={() => setShowRankDrawer(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, paddingBottom: 64 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <View>
                <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER }}>🏅 SISTEMA DE RANGO</Text>
                <Text style={{ ...athletic, fontSize: 22, lineHeight: 24, color: "#fff", marginTop: 4 }}>
                  JERARQUÍA Y{"\n"}RANGOS DE PODER
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowRankDrawer(false)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                  backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)",
                }}
              >
                <X size={12} color={VOLT} />
                <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
              </TouchableOpacity>
            </View>

            {/* Roadmap vertical — línea neón conectando los 6 rangos
                (.cursorrules Parte 3 "Rediseño del Roadmap de Insignias").
                Bloqueado/desbloqueado ahora depende de totalXP real, no de
                streak — un tier ya superado (por debajo del rango activo)
                se distingue de uno todavía bloqueado, cosa que la lista
                plana anterior no distinguía. */}
            <View style={{ position: "relative" }}>
              <View
                pointerEvents="none"
                style={{ position: "absolute", left: 21, top: 22, bottom: 22, width: 2, backgroundColor: "rgba(204,255,0,0.15)" }}
              />
              {RANK_TIERS.map((tier, i) => {
                const active   = tier.name === currentRank;
                const unlocked = totalXP >= tier.minXP;
                const locked   = !unlocked;
                const passed   = unlocked && !active;
                const shield = active || tier.voltTheme
                  ? RANK_SHIELD_CFG[i]!
                  : RANK_SHIELD_CFG[1]!;                       // locked/passed tiers force the zinc shield
                const xpNeeded = Math.max(0, tier.minXP - totalXP);
                return (
                  <View
                    key={tier.name}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 14,
                      borderRadius: 16, padding: 14, marginBottom: 10,
                      opacity: locked ? 0.4 : 1,
                      backgroundColor: active ? "rgba(204,255,0,0.06)" : tier.voltTheme ? "rgba(204,255,0,0.03)" : "rgba(255,255,255,0.02)",
                      borderWidth: active ? 1.5 : 1,
                      borderColor: active ? "rgba(204,255,0,0.4)" : tier.voltTheme ? "rgba(204,255,0,0.2)" : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {/* Shield — la insignia del nivel activo brilla con el
                        resplandor LED exterior (.cursorrules §3). */}
                    <View
                      style={{
                        width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
                        backgroundColor: shield.bg, borderWidth: shield.borderWidth, borderColor: shield.borderColor,
                        ...(active
                          ? { shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 }
                          : null),
                      }}
                    >
                      {locked
                        ? <Lock size={14} color="#52525b" />
                        : <Text style={{ fontSize: 20, color: shield.iconColor }}>{tier.icon}</Text>}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text className="font-black uppercase" style={{ fontSize: 13, color: active ? "#fff" : locked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.6)" }}>
                          {tier.name}
                        </Text>
                        {active && (
                          <View style={{ backgroundColor: VOLT, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5 }}>
                            <Text className="font-mono" style={{ fontSize: 7, fontWeight: "900", color: "#000" }}>ACTIVO</Text>
                          </View>
                        )}
                        {tier.voltTheme && !active && (
                          <View style={{ borderWidth: 1, borderColor: "rgba(204,255,0,0.3)", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5 }}>
                            <Text className="font-mono" style={{ fontSize: 7, fontWeight: "900", color: "rgba(204,255,0,0.6)" }}>ELITE</Text>
                          </View>
                        )}
                      </View>
                      <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, marginTop: 2, color: active ? VOLT : locked ? "rgba(255,255,255,0.2)" : "rgba(204,255,0,0.5)" }}>
                        {active ? `${tier.sub} · RANGO ACTUAL` : passed ? `${tier.sub} · RANGO SUPERADO` : `NIVEL ${i + 1} · BLOQUEADO`}
                      </Text>
                      <Text style={{ fontSize: 10, lineHeight: 14, color: SILVER, marginTop: 4 }}>
                        {active
                          ? `Acumula XP en tus misiones diarias antes de que termine la temporada.`
                          : passed
                            ? "Ya superaste este rango."
                            : `Requiere ${tier.minXP} XP totales — te faltan ${xpNeeded} XP.`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── PREFERENCIAS overlay ── */}
      <SettingsOverlay
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        name={student?.name ?? "—"}
        planLabel={stage === "Volumen" ? "Plan Berserker" : "Plan Performance"}
      />

      {/* ── IDENTIDAD Y SEGURIDAD overlay (Módulo 5) ── */}
      <IdentityModal
        visible={showIdentity}
        onClose={() => setShowIdentity(false)}
        student={student}
        avatarUrl={avatarUrl}
        token={token}
        onRefresh={refresh}
      />

      {/* ── VINCULAR CON UN COACH (Módulo 1 — mitad real de "UNIRME A UN COACH") ── */}
      <CoachLinkModal
        visible={showCoachLink}
        onClose={() => setShowCoachLink(false)}
        token={token}
        onLinked={refresh}
      />

      {/* ── BITÁCORA TÁCTICA / telemetría de ritmo cardíaco (encapsulada) ── */}
      <TelemetryLogModal
        visible={showTelemetry}
        onClose={() => setShowTelemetry(false)}
        loading={bioLoading}
        history={bioHistory}
      />
    </SafeAreaView>
  );
}
