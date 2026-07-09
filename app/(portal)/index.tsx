import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, ImageBackground, StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { MotiView } from "moti";
import { useEffect, useState, useCallback } from "react";
import { PulseButton } from "@/components/ui/PulseButton";
import * as Haptics from "expo-haptics";
import { Play, Pause, Check, Activity } from "lucide-react-native";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { useWorkout, todayDateStr } from "@/lib/workout";
import { VOLT, WATER_TARGET_ML, WATER_DOSE_ML } from "@/components/workout-ui";

// ── Cinema Bento card imagery — placeholder gym stock photography keyed by
// muscle group, until the coach exercise catalog reliably supplies imageUrl.
// Swap for brand-owned photography before release. ──────────────────────────
const GYM_IMAGES: { match: RegExp; uri: string }[] = [
  { match: /pierna|sentadilla|squat|gluteo|cuádr/i, uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=60" },
  { match: /pecho|banca|bench|press.*banca/i,       uri: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=60" },
  { match: /espalda|remo|jal[oó]n/i,                 uri: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=60" },
  { match: /hombro|militar/i,                        uri: "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=800&q=60" },
  { match: /muerto|deadlift|posterior/i,             uri: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800&q=60" },
];
const GYM_IMAGE_DEFAULT = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=60";

function gymImageFor(name: string, muscleGroup?: string): string {
  const key = `${name} ${muscleGroup ?? ""}`;
  return GYM_IMAGES.find(g => g.match.test(key))?.uri ?? GYM_IMAGE_DEFAULT;
}

// Dark gradient scrim over the card photo — keeps overlaid text readable
// while the photography still shows through the top of the card.
function CardShade() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="exCardShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.1" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.75" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#exCardShade)" />
    </Svg>
  );
}

// ── Protocol dashboard tokens ────────────────────────────────────────────────
const BG        = "#000000";  // absolute OLED floor
const CYAN      = "#40E0D0";  // liquid cyan telemetry tag
const SEG_OFF   = "#2C2C2E";  // inactive hydration segment
const LATCH_BG  = "#162211";  // bottom latch deep volt-tinted fill
const SILVER    = "#8e8e93";  // silver-gray micro labels
const ZINC      = "#a1a1aa";  // silver-zinc card subtext
const GUTTER    = 20;         // strict horizontal margin
const HYDRO_SEGS = 5;
// Deep smoked-glass recipe — routine cards + banners.
const GLASS = {
  backgroundColor: "rgba(28, 28, 30, 0.65)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.08)",
} as const;

// Heavy condensed-oblique athletic type — Inter 900 Italic per spec; the Inter
// files aren't bundled yet, so this rides the system black-italic face until
// expo-font wires the real asset.
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// ── Main workout tab — the "lobby" view. The set-execution "focus" view lives
// at app/(portal)/exercise/[id].tsx; all shared session state (lifecycle,
// sets, biometrics, timers) comes from useWorkout(). ─────────────────────────
export default function WorkoutTab() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const {
    exercises, dayFocus, totalEx, hasAssignment, isLoading,
    lifecycle, setLifecycle, watchStatus, doneSets, doneEx, biometrics,
    workoutDone, setActiveExIdx, handleFinalizar,
    durationStr, allDone, sortedIndices, lifecycleLabel,
  } = useWorkout();

  // ── Hydration Táctica (lobby-only; independent of the exercise focus flow) ─
  const [waterMl,   setWaterMl]   = useState(0);
  const [waterBusy, setWaterBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ totalMl: number }>(`/api/student/water?date=${todayDateStr()}`, { token })
      .then(res => { if (!cancelled) setWaterMl(res.totalMl ?? 0); })
      .catch(() => { if (!cancelled) setWaterMl(0); });
    return () => { cancelled = true; };
  }, [token]);

  const addWater = useCallback(async () => {
    if (!token || waterBusy || waterMl >= WATER_TARGET_ML) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWaterBusy(true);
    const prev = waterMl;
    setWaterMl(prev + WATER_DOSE_ML); // optimistic
    try {
      await api("/api/student/water", {
        method: "POST",
        token,
        body: { amountMl: WATER_DOSE_ML, date: todayDateStr() },
      });
    } catch {
      setWaterMl(prev); // rollback
    } finally {
      setWaterBusy(false);
    }
  }, [token, waterBusy, waterMl]);

  const openExercise = useCallback(async (idx: number) => {
    if (lifecycle === "IDLE") return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveExIdx(idx);
    router.push({ pathname: "/(portal)/exercise/[id]", params: { id: String(idx) } });
  }, [lifecycle, setActiveExIdx]);

  const setPhase = useCallback(async (l: "ACTIVE_TRACKING" | "PAUSED") => {
    if (!hasAssignment) return;   // nothing assigned today — the pill is hidden, but guard the callback too
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLifecycle(l);
  }, [setLifecycle, hasAssignment]);

  // ── COMPLETED → hand off to the dedicated success screen (full-screen
  // modal, escapes the persistent tab dock). useFocusEffect, not a plain
  // useEffect: a plain effect only re-runs when workoutDone/lifecycle
  // actually change VALUE, so returning to this tab from another tab while
  // still stuck at a stale COMPLETED state (success.tsx dismissed some way
  // other than "REGRESAR AL PANEL" — swiped away, backgrounded, etc., so
  // resetSession() never ran) would never re-trigger the redirect, trapping
  // the user on the fallback below every time they revisit this tab.
  // useFocusEffect fires on every focus, so the redirect self-heals. Must be
  // declared before any early return below (isLoading gate, COMPLETED
  // fallback) — a hook called only on some renders violates the Rules of
  // Hooks and corrupts this component's hook order on the next render. ──────
  useFocusEffect(
    useCallback(() => {
      if (workoutDone && lifecycle === "COMPLETED") {
        router.push("/(portal)/workout/success");
      }
    }, [workoutDone, lifecycle]),
  );

  // ── Portal hydration gate — avoids flashing the "sin programación" empty
  // state during the brief window before the coach's assignment arrives. ────
  if (isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={VOLT} />
          <Text className="text-[11px] uppercase mt-3" style={{ color: SILVER, letterSpacing: 1.2 }}>
            CARGANDO PLAN...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Never a dead blank view: useFocusEffect above should redirect
  // immediately, but this is the escape hatch if that's ever delayed —
  // "Ver resumen" always works, and resetSession() on the button inside
  // success.tsx clears the stale COMPLETED state for good.
  if (workoutDone && lifecycle === "COMPLETED") {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <ActivityIndicator color={VOLT} />
        <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.4, color: SILVER, textTransform: "uppercase" }}>
          Abriendo resumen de sesión...
        </Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => router.push("/(portal)/workout/success")}
          style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.4, color: "#fff", textTransform: "uppercase" }}>
            Ver resumen
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Derived presentation state ────────────────────────────────────────────
  const inSession   = lifecycle === "ACTIVE_TRACKING" || lifecycle === "PAUSED";
  const showFinal   = allDone && inSession;
  const showLatch   = showFinal || lifecycle === "PAUSED";
  const hydroActive = Math.min(HYDRO_SEGS, Math.round((waterMl / WATER_TARGET_ML) * HYDRO_SEGS));

  const pillLabel = lifecycle === "IDLE" ? "INICIAR ENTRENAMIENTO"
    : lifecycle === "PAUSED" ? "REANUDAR ENTRENAMIENTO"
    : "PAUSAR ENTRENAMIENTO";
  const pillColor = lifecycle === "ACTIVE_TRACKING" ? SILVER : VOLT;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: showLatch ? 190 : 160 }}
      >

        {/* ── 1 · Informational header & live pause status stack ── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: GUTTER, marginTop: 12 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: VOLT, textTransform: "uppercase" }}
            >
              {hasAssignment ? `• FUERZA TOTAL · ${totalEx} EJERCICIOS · 45 MIN` : "• SIN PROGRAMACIÓN ASIGNADA"}
            </Text>
            <Text style={{ ...athletic, fontSize: 36, lineHeight: 38, letterSpacing: -1, color: "#ffffff", marginTop: 2 }}>
              {dayFocus}
            </Text>
          </View>
          <Text
            className="font-mono"
            style={{ color: VOLT, fontWeight: "700", fontSize: 14, textTransform: "uppercase", textAlign: "right", letterSpacing: 0.5, fontVariant: ["tabular-nums"] }}
          >
            {durationStr}{"\n"}{lifecycleLabel}
          </Text>
        </View>

        {/* ── 2 · Upper interactive pill — INICIAR / PAUSAR / REANUDAR ──
             Hidden entirely when the coach hasn't assigned today: there is
             nothing to start. */}
        {hasAssignment && (
          <PulseButton
            glowColor={pillColor}
            onPress={() => setPhase(lifecycle === "ACTIVE_TRACKING" ? "PAUSED" : "ACTIVE_TRACKING")}
            style={{
              height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: pillColor,
              marginHorizontal: GUTTER, marginTop: 16, alignSelf: "stretch",
              flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
            }}
          >
            {lifecycle === "ACTIVE_TRACKING"
              ? <Pause size={14} color={pillColor} fill={pillColor} />
              : <Play size={14} color={pillColor} fill={pillColor} />}
            <Text style={{ ...athletic, fontSize: 14, color: pillColor }}>
              {pillLabel}
            </Text>
          </PulseButton>
        )}

        {/* Wearable pairing micro-status — shows while the telemetry scan runs */}
        {watchStatus === "SCANNING" && (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 220 }}
            style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}
          >
            <ActivityIndicator size="small" color={VOLT} />
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: VOLT }}>
              🔍 BUSCANDO RELOJ...
            </Text>
          </MotiView>
        )}

        {/* ── 3 · Compact modular metrics grid ── */}
        {hasAssignment && inSession && (
          <View style={{ flexDirection: "row", paddingHorizontal: GUTTER - 4, marginTop: 16 }}>
            <BlurView
              intensity={20}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={{
                flex: 1, height: 90, borderRadius: 24, overflow: "hidden", padding: 12, marginHorizontal: 4,
                justifyContent: "space-between", ...GLASS,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: SILVER, textTransform: "uppercase" }}>
                RITMO CARDÍACO
              </Text>
              <MotiView
                from={{ opacity: 0.35 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 650, loop: true, repeatReverse: true }}
                style={{
                  position: "absolute", top: 12, right: 12,
                  width: 8, height: 8, borderRadius: 4, backgroundColor: "#30D158",
                  shadowColor: "#30D158", shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                }}
              />
              <Text className="font-black" style={{ fontSize: 24, color: "#ffffff" }}>
                {biometrics.avgHeartRate || "--"}
                <Text style={{ fontSize: 11, fontWeight: "normal", color: SILVER }}> BPM</Text>
              </Text>
            </BlurView>
            <BlurView
              intensity={20}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={{
                flex: 1, height: 90, borderRadius: 24, overflow: "hidden", padding: 12, marginHorizontal: 4,
                justifyContent: "space-between", ...GLASS,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: SILVER, textTransform: "uppercase" }}>
                ENERGÍA ACTIVA
              </Text>
              <Text className="font-black" style={{ fontSize: 24, color: "#ffffff" }}>
                {biometrics.activeCalories}
                <Text style={{ fontSize: 11, fontWeight: "normal", color: SILVER }}> KCAL</Text>
              </Text>
            </BlurView>
          </View>
        )}

        {/* ── 4 · Battery-style tactical hydration cap matrix ──
             Tapping the card logs one 250ml dose (optimistic, server-synced). */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={addWater}
          disabled={waterBusy || waterMl >= WATER_TARGET_ML}
          style={{ marginHorizontal: GUTTER, marginTop: 16, opacity: waterBusy ? 0.6 : 1 }}
        >
          <BlurView
            intensity={20}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={{
              height: 70, borderRadius: 24, overflow: "hidden",
              ...GLASS,
              paddingHorizontal: 16, flexDirection: "row", alignItems: "center",
            }}
          >
            <View>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.8 }}>
                HIDRATACIÓN TÁCTICA
              </Text>
              <Text className="font-black" style={{ fontSize: 16, color: VOLT, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                {(waterMl / 1000).toFixed(1)} / {(WATER_TARGET_ML / 1000).toFixed(1)} L
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 4, marginLeft: "auto" }}>
              {Array.from({ length: HYDRO_SEGS }, (_, s) => (
                <View
                  key={s}
                  style={{ width: 8, height: 32, borderRadius: 2, backgroundColor: s < hydroActive ? VOLT : SEG_OFF }}
                />
              ))}
            </View>
          </BlurView>
        </TouchableOpacity>

        {/* ── 5 · Cinematic Bento exercise composite feed ── */}
        <Text
          style={{
            textTransform: "uppercase", color: "#808080", fontSize: 11, fontWeight: "bold",
            paddingHorizontal: GUTTER, marginTop: 20, marginBottom: 10, letterSpacing: 1.2,
          }}
        >
          RUTINA DEL DÍA
        </Text>

        {/* Unassigned slate — coach hasn't programmed today's calendar day.
            §3: premium glassmorphic banner, verbatim tactical copy. */}
        {!hasAssignment && (
          <View style={{ ...GLASS, borderRadius: 24, marginHorizontal: GUTTER, padding: 24, alignItems: "center", gap: 10 }}>
            <Activity size={22} color={SILVER} strokeWidth={1.5} />
            <Text className="text-center" style={{ fontSize: 12, fontWeight: "800", color: SILVER }}>
              Sin programación asignada para este día
            </Text>
          </View>
        )}

        {sortedIndices.map((i, rank) => {
          const ex            = exercises[i]!;
          const doneSetsForEx = Math.min(doneSets[i] ?? 0, ex.sets);
          const exDone        = doneEx.has(i) || doneSetsForEx >= ex.sets;

          return (
            <MotiView
              key={i}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: exDone ? 0.45 : 1, translateY: 0 }}
              transition={{ type: "timing", duration: 280, delay: rank * 50 }}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openExercise(i)}
                style={{
                  height: 150, borderRadius: 24, marginBottom: 12, marginHorizontal: GUTTER,
                  overflow: "hidden", backgroundColor: "#101012",
                  borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)", borderTopColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <ImageBackground
                  source={{ uri: gymImageFor(ex.name, ex.muscleGroup) }}
                  resizeMode="cover"
                  imageStyle={{ opacity: 0.7 }}
                  style={{ flex: 1, justifyContent: "flex-end" }}
                >
                  <CardShade />
                  <View style={{ padding: 16, paddingRight: 76 }}>
                    {ex.muscleGroup && (
                      <Text
                        style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: CYAN, textTransform: "uppercase", marginBottom: 4 }}
                      >
                        {ex.muscleGroup}
                      </Text>
                    )}
                    <Text
                      style={{ fontWeight: "900", fontSize: 19, lineHeight: 21, letterSpacing: -0.3, color: "#ffffff", textTransform: "uppercase" }}
                      numberOfLines={2}
                    >
                      {ex.name}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: ZINC, marginTop: 6 }}>
                      {doneSetsForEx}/{ex.sets} SETS · {ex.reps} REPS
                    </Text>
                  </View>
                </ImageBackground>

                {/* Absolute right play launcher */}
                <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                  <View
                    style={{
                      width: 44, height: 44, borderRadius: 22, backgroundColor: VOLT,
                      justifyContent: "center", alignItems: "center",
                      shadowColor: VOLT, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
                    }}
                  >
                    {exDone
                      ? <Check size={18} color="#000" strokeWidth={3} />
                      : <Play size={18} color="#000" fill="#000" />}
                  </View>
                </View>
              </TouchableOpacity>
            </MotiView>
          );
        })}
      </ScrollView>

      {/* ── 6 · Glowing overlay bottom latch — REANUDAR / FINALIZAR ── */}
      {showLatch && (
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 260 }}
          // Floats 12pt above the 84pt anchored floor dock (+ device inset).
          style={{ position: "absolute", bottom: 84 + insets.bottom + 12, left: GUTTER, right: GUTTER }}
        >
          <PulseButton
            glowColor={VOLT}
            onPress={showFinal ? handleFinalizar : () => setPhase("ACTIVE_TRACKING")}
            style={{
              height: 54, borderRadius: 27, backgroundColor: LATCH_BG,
              borderWidth: 1.5, borderColor: VOLT,
              flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
            }}
          >
            {showFinal
              ? <Check size={16} color={VOLT} strokeWidth={3} />
              : <Play size={16} color={VOLT} fill={VOLT} />}
            <Text style={{ ...athletic, fontSize: 15, color: VOLT }}>
              {showFinal ? "FINALIZAR ENTRENAMIENTO" : "REANUDAR ENTRENAMIENTO"}
            </Text>
          </PulseButton>
        </MotiView>
      )}
    </SafeAreaView>
  );
}
