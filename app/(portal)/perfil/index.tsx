import {
  View, Text, TouchableOpacity, Pressable, ScrollView, Modal, ImageBackground, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useState, useEffect } from "react";
import { PulseButton } from "@/components/ui/PulseButton";
import * as Haptics from "expo-haptics";
import { Flame, Check, Star, Lock, LogOut, Mail, Zap, Settings, X } from "lucide-react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { usePortal } from "@/lib/portal";
import { useAuth } from "@/lib/session";
import { useWorkout } from "@/lib/workout";
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

interface RankTier {
  level: number; title: string; sub: string; icon: string; progress: string; voltTheme?: boolean;
}

// The 6 Power Ranks (blueprint §2.3). `active` is NOT stored here — the web
// hardcodes level 1 active forever (sharp edge #1); mobile binds it to the
// real streak-derived rank at render time.
const RANK_TIERS: RankTier[] = [
  { level: 1, title: "ATLETA INIT",  sub: "NIVEL 1",      icon: "⬡", progress: "Estás a 150 XP o 3 entrenamientos perfectos de subir de nivel." },
  { level: 2, title: "GUERRERO PRO", sub: "NIVEL 2",      icon: "◈", progress: "Completa 14 días de racha continua." },
  { level: 3, title: "TITÁN",        sub: "NIVEL 3",      icon: "◆", progress: "Alcanza 30 días de racha y 5 PRs." },
  { level: 4, title: "COMANDANTE",   sub: "NIVEL 4",      icon: "✦", progress: "Mantén el 90% de asistencia por 2 meses." },
  { level: 5, title: "PREDADOR",     sub: "NIVEL 5",      icon: "⬢", progress: "60 días de racha y liderazgo de equipo." },
  { level: 6, title: "BESTIA ÉLITE", sub: "NIVEL MÁXIMO", icon: "★", progress: "Liderazgo de sala activo · Credenciales de equipo elite.", voltTheme: true },
];

// Shield style registry (blueprint §2.3 RANK_SHIELD_CFG, RN color mapping).
const RANK_SHIELD_CFG: Record<number, { bg: string; borderColor: string; borderWidth: number; iconColor: string }> = {
  1: { bg: "rgba(120,53,15,0.25)", borderColor: "rgba(217,119,6,0.65)",  borderWidth: 1.5, iconColor: "#d97706" },
  2: { bg: "rgba(24,24,27,0.5)",   borderColor: "rgba(63,63,70,0.8)",    borderWidth: 1,   iconColor: "#71717a" },
  3: { bg: "rgba(15,23,42,0.5)",   borderColor: "rgba(100,116,139,0.5)", borderWidth: 1,   iconColor: "#94a3b8" },
  4: { bg: "rgba(66,32,6,0.3)",    borderColor: "rgba(234,179,8,0.5)",   borderWidth: 1.5, iconColor: "#eab308" },
  5: { bg: "rgba(24,24,27,0.5)",   borderColor: "rgba(63,63,70,0.7)",    borderWidth: 1,   iconColor: "#71717a" },
  6: { bg: "rgba(26,46,5,0.5)",    borderColor: "#a3e635",               borderWidth: 1.5, iconColor: "#a3e635" },
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
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", padding: 24, paddingTop: 70 }}>
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

// ══════════════════════════════════════════════════════════════════════════════
//  SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function PerfilScreen() {
  const { student } = usePortal();
  const { token, logout } = useAuth();
  const { doneEx } = useWorkout();

  const streak = student?.streak ?? 0;
  const stage  = student?.stage ?? "Definición";

  // ── Rank & plan derivations (blueprint §2.2, exact) ───────────────────────
  const rankTitle = streak >= 60 ? "LEYENDA" : streak >= 30 ? "BESTIA" : streak >= 14 ? "GUERRERO" : "ATLETA";
  const rankSub   = streak >= 30 ? "ELITE"   : streak >= 14 ? "PRO"    : "NIVEL 1";
  const planLabel = stage === "Volumen" ? "Plan Berserker" : stage === "Definición" ? "Plan Shredder" : "Plan Performance";
  const monthPct  = Math.min(100, Math.round((streak / 30) * 100));
  // Sharp-edge #1 fix: bind the drawer's active tier to the real derivation
  // instead of the web's hardcoded level 1.
  const activeLevel = streak >= 60 ? 5 : streak >= 30 ? 3 : streak >= 14 ? 2 : 1;

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

        {/* ── 3 · RANGO card → Jerarquía drawer ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setShowRankDrawer(true); }}
          style={{ ...GLASS, borderRadius: 20, marginHorizontal: 20, marginTop: 12, padding: 16, minHeight: 110 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
                RANGO · ATLETA
              </Text>
              <Text className="font-black uppercase" style={{ fontSize: 24, color: "#fff", marginTop: 4 }}>{rankTitle}</Text>
              <Text className="font-black" style={{ fontSize: 11, letterSpacing: 1, color: VOLT, marginTop: 2 }}>{rankSub}</Text>
            </View>
            <Star size={30} color={CYAN} fill="rgba(0,240,255,0.2)" />
          </View>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginTop: 12 }}>
            VER JERARQUÍA ›
          </Text>
        </TouchableOpacity>

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

        {/* ── 8 · ARCHIVO DE MISIONES // BITÁCORA TÁCTICA ── */}
        <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase", marginTop: 24, paddingHorizontal: 20, marginBottom: 10 }}>
          ARCHIVO DE MISIONES // BITÁCORA TÁCTICA
        </Text>

        {bioLoading ? (
          [0, 1, 2].map(i => (
            <MotiView
              key={i}
              from={{ opacity: 0.4 }}
              animate={{ opacity: 0.9 }}
              transition={{ type: "timing", duration: 600, loop: true, repeatReverse: true }}
              style={{ height: 72, borderRadius: 14, backgroundColor: "rgba(24,24,27,0.6)", marginHorizontal: 20, marginBottom: 10 }}
            />
          ))
        ) : bioHistory.length === 0 ? (
          <View style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, padding: 20, alignItems: "center" }}>
            <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: "#d4d4d8" }}>
              SIN SESIONES REGISTRADAS
            </Text>
            <Text className="text-center" style={{ fontSize: 11, color: SILVER, marginTop: 6, lineHeight: 16 }}>
              Tus sesiones apareceran aqui tras completar tu primer entrenamiento.
            </Text>
          </View>
        ) : (
          bioHistory.map(session => {
            // slice(0,10) guards against a full ISO datetime sneaking through
            // the contract's YYYY-MM-DD — reversed, that would mangle the label.
            const dateLabel = (session.date ?? "").slice(0, 10).split("-").reverse().join("/");
            const bio       = session.biometrics;
            const hasHrData = Array.isArray(bio?.heartRateSeries) && (bio?.heartRateSeries?.length ?? 0) > 0;
            const hasAnyBio = !!bio && (bio.avgHeartRate != null || bio.activeCalories != null || !!bio.deviceSource);
            return (
              <View key={session.id} style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, marginBottom: 10, padding: 14 }}>
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
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 70, paddingBottom: 64 }} showsVerticalScrollIndicator={false}>
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

            {RANK_TIERS.map(tier => {
              const active = tier.level === activeLevel;
              const locked = !active && !tier.voltTheme;
              const shield = active || tier.voltTheme
                ? RANK_SHIELD_CFG[tier.level]!
                : RANK_SHIELD_CFG[2]!;                       // locked tiers force the zinc shield
              return (
                <View
                  key={tier.level}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 14,
                    borderRadius: 16, padding: 14, marginBottom: 10,
                    opacity: locked ? 0.55 : 1,
                    backgroundColor: active ? "rgba(204,255,0,0.06)" : tier.voltTheme ? "rgba(204,255,0,0.03)" : "rgba(255,255,255,0.02)",
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? "rgba(204,255,0,0.4)" : tier.voltTheme ? "rgba(204,255,0,0.2)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Shield */}
                  <View
                    style={{
                      width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
                      backgroundColor: shield.bg, borderWidth: shield.borderWidth, borderColor: shield.borderColor,
                    }}
                  >
                    {locked
                      ? <Lock size={14} color="#52525b" />
                      : <Text style={{ fontSize: 20, color: shield.iconColor }}>{tier.icon}</Text>}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text className="font-black uppercase" style={{ fontSize: 13, color: active ? "#fff" : locked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.6)" }}>
                        {tier.title}
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
                      {active ? `${tier.sub} · RANGO ACTUAL` : locked ? `NIVEL ${tier.level} · BLOQUEADO` : `${tier.sub} · RANGO SUPREMO`}
                    </Text>
                    <Text style={{ fontSize: 10, lineHeight: 14, color: SILVER, marginTop: 4 }}>
                      {tier.progress}
                    </Text>
                  </View>
                </View>
              );
            })}
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
    </SafeAreaView>
  );
}
