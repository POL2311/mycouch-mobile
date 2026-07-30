import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, ImageBackground, StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MotiView } from "moti";
import { useEffect, useState, useCallback, useRef } from "react";
import { PulseButton } from "@/components/ui/PulseButton";
import { NeonGlowView } from "@/components/ui/NeonGlowView";
import { ShimmerScreen } from "@/components/ShimmerLoader";
import { Play, Pause, Check, Moon, Salad, Plus, Search, Edit2 } from "lucide-react-native";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { useWorkout, todayDateStr } from "@/lib/workout";
import { usePortal, isSelfCoached } from "@/lib/portal";
import { useSelfCoach } from "@/lib/selfCoach";
import { useGamification } from "@/lib/gamification";
import { useMotivation } from "@/lib/motivation";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VOLT, WATER_TARGET_ML, WATER_DOSE_ML } from "@/components/workout-ui";
import { TemplatePickerModal } from "@/components/portal/TemplatePickerModal";
import { EnterCoachCodeModal } from "@/components/portal/EnterCoachCodeModal";
import { generateBaseRoutinePlan } from "@/lib/routineGenerator";
import { generateBaseNutritionPlan } from "@/lib/nutritionGenerator";

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

const WEEKDAY_PILLS = ["L", "M", "MI", "J", "V", "S", "D"] as const;

function WeekdayStrip({ activeDay, onSelect }: {
  activeDay: number;
  onSelect: (day: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        marginHorizontal: GUTTER, marginTop: 16, gap: 6,
        backgroundColor: "rgba(24,24,27,0.4)", padding: 6,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 16,
      }}
    >
      {WEEKDAY_PILLS.map((label, i) => {
        const dayNum = i + 1;
        const isActive = activeDay === dayNum;
        return (
          <TouchableOpacity
            key={dayNum}
            activeOpacity={0.8}
            onPress={() => { triggerImpact(); onSelect(dayNum); }}
            style={{
              flex: 1, alignItems: "center", justifyContent: "center", height: 40,
              borderRadius: 12, backgroundColor: isActive ? VOLT : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 12, fontWeight: isActive ? "900" : "600",
                color: isActive ? "#000" : "#8e8e93",
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main workout tab — the "lobby" view. The set-execution "focus" view lives
// at app/(portal)/exercise/[id].tsx; all shared session state (lifecycle,
// sets, biometrics, timers) comes from useWorkout(). ─────────────────────────
export default function WorkoutTab() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const {
    exercises, dayFocus, semanaLabel, totalEx, hasAssignment, hasAnyRoutine, isLoading,
    lifecycle, setLifecycle, watchStatus, doneSets, doneEx, biometrics,
    setActiveExIdx, handleFinalizar, resetSession, syncCompletedSession,
    durationStr, allDone, sortedIndices, lifecycleLabel,
    activeDay, setActiveDay,
  } = useWorkout();
  const { currentRank, progressPct, nextThresholdXP, addXP, rankUpFlash, clearRankUpFlash } = useGamification();
  const { celebrate } = useMotivation();
  const { student } = usePortal();
  const { applyRoutineTemplate, applyBaseRoutine, applyBaseDiet, localRoutine, localDiet } = useSelfCoach();
  const selfCoached = isSelfCoached(student);
  const hasCoach = Boolean(student?.coachId && student.coachId !== null);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  const [showCoachCode, setShowCoachCode] = useState(false);

  // Módulo 1: Generación Automática del Plan Base
  useEffect(() => {
    if (selfCoached && !isLoading && student) {
      if (!localRoutine && !localDiet) {
        applyBaseRoutine(generateBaseRoutinePlan(4));
        applyBaseDiet(generateBaseNutritionPlan(25, student.currentWeight || 75, 175, "M", "Hipertrofia"));
      }
    }
  }, [selfCoached, isLoading, student, localRoutine, localDiet, applyBaseRoutine, applyBaseDiet]);

  // Auto-dismiss the rank-up toast a couple seconds after it fires.
  useEffect(() => {
    if (!rankUpFlash) return;
    const t = setTimeout(clearRankUpFlash, 2600);
    return () => clearTimeout(t);
  }, [rankUpFlash, clearRankUpFlash]);

  // Disparador de éxito único — "guardó la última serie del día": allDone
  // (lib/workout.tsx) se pone true en cuanto se completa el último set del
  // último ejercicio. Antes esto abría el modal motivacional AQUÍ y, por
  // separado, un botón FINALIZAR manual llevaba a workout/success.tsx (otra
  // pantalla de éxito completa) — dos "checks" consecutivos para el mismo
  // logro. Ahora el modal (¡Objetivo cumplido!) es la única presentación: su
  // CONTINUAR (onDismiss) YA hace todo lo que antes hacía el botón FINALIZAR
  // + workout/success.tsx's "Regresar al panel" — guarda la sesión, sincroniza
  // con el servidor, otorga el bono de +100 XP y resetea el lobby — sin
  // segunda pantalla ni botón manual de por medio.
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      celebrate(async () => {
        await handleFinalizar();
        await syncCompletedSession();
        addXP(100);
        resetSession();
      });
    }
    prevAllDone.current = allDone;
  }, [allDone, celebrate, handleFinalizar, syncCompletedSession, addXP, resetSession]);

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
    triggerImpact();
    setWaterBusy(true);
    const prev = waterMl;
    // The button is disabled once waterMl >= WATER_TARGET_ML (guard above),
    // so this can only cross the threshold once per day — no extra "already
    // awarded today" bookkeeping needed for the XP trigger below.
    const crossesTarget = prev < WATER_TARGET_ML && prev + WATER_DOSE_ML >= WATER_TARGET_ML;
    setWaterMl(prev + WATER_DOSE_ML); // optimistic
    try {
      await api("/api/student/water", {
        method: "POST",
        token,
        body: { amountMl: WATER_DOSE_ML, date: todayDateStr() },
      });
      // XP only on confirmed persistence, not the optimistic update — a
      // failed/rolled-back log shouldn't still pay out.
      if (crossesTarget) addXP(25);
    } catch {
      setWaterMl(prev); // rollback
    } finally {
      setWaterBusy(false);
    }
  }, [token, waterBusy, waterMl, addXP]);

  const openExercise = useCallback((idx: number) => {
    if (lifecycle === "IDLE") return;
    triggerImpact();
    setActiveExIdx(idx);
    router.push({ pathname: "/(portal)/exercise/[id]", params: { id: String(idx) } });
  }, [lifecycle, setActiveExIdx]);

  const setPhase = useCallback((l: "ACTIVE_TRACKING" | "PAUSED") => {
    // Si no hay assignment y es selfCoached, permitimos Entreno Libre, de lo contrario bloqueamos.
    if (!hasAssignment && !selfCoached) return;
    triggerImpact();
    setLifecycle(l);
  }, [setLifecycle, hasAssignment, selfCoached]);

  // ── Portal hydration gate — avoids flashing the "sin programación" empty
  // state during the brief window before the coach's assignment arrives. ────
  if (isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: BG }}>
        <ShimmerScreen variant="exercise-list" label="CARGANDO PLAN..." />
      </SafeAreaView>
    );
  }

  // ── Derived presentation state ────────────────────────────────────────────
  // Un solo botón de acción vive en pantalla en cualquier momento dado:
  // - lifecycle IDLE → solo la píldora superior ("INICIAR"), el latch
  //   inferior no se monta.
  // - lifecycle !== IDLE (ACTIVE_TRACKING/PAUSED, con o sin allDone) → solo
  //   el latch inferior (pausar/reanudar/finalizar), la píldora superior
  //   deja de renderizarse.
  // Antes ambos controles vivían simultáneamente en pausa (la píldora
  // arriba Y el latch abajo mostraban "REANUDAR ENTRENAMIENTO" a la vez) —
  // esa es la duplicidad reportada. `hasAssignment` también gatea el latch
  // explícitamente: sin eso, un lifecycle "PAUSED" que sobrevive de un día
  // con rutina hasta un día de descanso (el objeto WorkoutProvider no se
  // remonta solo porque cambió la fecha) dejaba el botón flotante visible
  // sobre un "Día de descanso" sin ejercicios que reanudar.
  const inSession   = lifecycle === "ACTIVE_TRACKING" || lifecycle === "PAUSED";
  // allDone ya dispara el modal ¡Objetivo cumplido! (ver el useEffect de
  // arriba) a pantalla completa, que hace todo el trabajo de "finalizar" en
  // su propio onDismiss — el latch inferior se oculta en cuanto allDone es
  // true en vez de mostrar un botón "FINALIZAR ENTRENAMIENTO" que quedaría
  // tapado por ese modal y nunca sería realmente tocable.
  const showLatch   = hasAssignment && inSession && !allDone;
  const hydroActive = Math.min(HYDRO_SEGS, Math.round((waterMl / WATER_TARGET_ML) * HYDRO_SEGS));

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Rank-up toast — floats above the header, auto-dismisses ── */}
      {rankUpFlash && (
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 220 }}
          style={{
            position: "absolute", top: insets.top + 8, left: GUTTER, right: GUTTER, zIndex: 10,
            backgroundColor: "rgba(204,255,0,0.12)", borderWidth: 1, borderColor: "rgba(204,255,0,0.4)",
            borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            shadowColor: VOLT, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Check size={14} color={VOLT} strokeWidth={3} />
          <Text style={{ fontSize: 12, fontWeight: "900", color: VOLT, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Rango ascendido · {rankUpFlash}
          </Text>
        </MotiView>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: showLatch ? 190 : 160 }}
      >
        {/* User Profile Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: GUTTER, marginTop: 12 }}>
          <TouchableOpacity onPress={() => router.push("/perfil")} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <UserAvatar image={user?.image || student?.avatarUrl} name={user?.name || student?.name} size={36} />
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>HOLA, {user?.name?.split(" ")[0] || "ATLETA"}</Text>
          </TouchableOpacity>
        </View>

        <WeekdayStrip activeDay={activeDay} onSelect={setActiveDay} />

        {/* Módulo 4: Banner de Conversión */}
        {!(hasCoach || hasAnyRoutine || inSession) && (
          <View style={{ marginHorizontal: GUTTER, marginTop: 16, borderRadius: 16, overflow: "hidden", ...GLASS, padding: 20 }}>
            <Text style={{ ...athletic, fontSize: 18, color: VOLT, marginBottom: 4 }}>¿QUIERES RESULTADOS 2X MÁS RÁPIDOS?</Text>
            <Text style={{ fontSize: 12, color: SILVER, marginBottom: 16, lineHeight: 18 }}>Sincroniza con tu coach para desbloquear métricas avanzadas y un plan 100% personalizado a tus objetivos.</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => router.push("/coaches" as any)} style={{ flex: 1, backgroundColor: VOLT, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>BUSCAR UN COACH</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCoachCode(true)} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}>
                <Search size={14} color="#fff" />
                <Text style={{ ...athletic, fontSize: 12, color: "#fff" }}>TENGO UN CÓDIGO</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
            {!!semanaLabel && (
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: CYAN, textTransform: "uppercase", marginTop: 4 }}>
                {semanaLabel}
              </Text>
            )}
          </View>
          <Text
            className="font-mono"
            style={{ color: VOLT, fontWeight: "700", fontSize: 14, textTransform: "uppercase", textAlign: "right", letterSpacing: 0.5, fontVariant: ["tabular-nums"] }}
          >
            {durationStr}{"\n"}{lifecycleLabel}
          </Text>
        </View>

        {/* ── Rank badge + XP progress — local-only engagement chrome, not a
             coach-visible metric (see lib/gamification.tsx). ── */}
        <View
          style={{
            ...GLASS, borderRadius: 16, marginHorizontal: GUTTER, marginTop: 10,
            paddingHorizontal: 14, paddingVertical: 10,
            flexDirection: "row", alignItems: "center", gap: 10,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "900", letterSpacing: 0.3, color: "#fff", textTransform: "uppercase" }}>
            {currentRank}
          </Text>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: SEG_OFF, overflow: "hidden" }}>
            <View style={{ width: `${progressPct}%`, height: "100%", borderRadius: 2, backgroundColor: VOLT }} />
          </View>
          <Text className="font-mono" style={{ fontSize: 10, color: SILVER, fontVariant: ["tabular-nums"] }}>
            {nextThresholdXP !== null ? `${progressPct}%` : "MAX"}
          </Text>
        </View>

        {/* ── 2 · Upper interactive pill — INICIAR only ──
             Hidden once a session exists (ACTIVE_TRACKING/PAUSED) — the
             bottom latch takes over as the single action control from that
             point on, and hidden entirely when the coach hasn't assigned
             today: there is nothing to start. */}
        {hasAssignment && lifecycle === "IDLE" && (
          <NeonGlowView style={{ marginHorizontal: GUTTER, marginTop: 16, borderRadius: 24 }}>
            <PulseButton
              glowColor={VOLT}
              onPress={() => setPhase("ACTIVE_TRACKING")}
              style={{
                height: 48, borderRadius: 24,
                alignSelf: "stretch",
                flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
              }}
            >
              <Play size={14} color={VOLT} fill={VOLT} />
              <Text style={{ ...athletic, fontSize: 14, color: VOLT }}>
                INICIAR ENTRENAMIENTO
              </Text>
            </PulseButton>
          </NeonGlowView>
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

        {/* Módulo de Plan Activo / Descanso */}
        {hasCoach && !hasAssignment ? (
          <View style={{ ...GLASS, borderRadius: 24, marginHorizontal: GUTTER, padding: 28, alignItems: "center", gap: 12 }}>
            <Moon size={26} color={CYAN} strokeWidth={1.5} />
            <Text style={{ ...athletic, fontSize: 20, color: "#fff", textAlign: "center" }}>
              Día de descanso programado por tu Coach 🌙
            </Text>
            <Text className="text-center" style={{ fontSize: 12, fontWeight: "700", color: SILVER, lineHeight: 18 }}>
              Tu coach no programó entrenamiento para hoy. Aprovecha para recuperar — el músculo crece en el descanso, no solo en el gimnasio.
            </Text>
          </View>
        ) : (
          <View style={{ ...GLASS, borderRadius: 24, marginHorizontal: GUTTER, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: SILVER, textTransform: "uppercase", letterSpacing: 0.5 }}>
              MI PLAN ACTIVO: {localRoutine?.nombre || "PLAN BASE"}
            </Text>
            
            {!hasAssignment && !hasCoach && (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Moon size={26} color={CYAN} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                <Text style={{ ...athletic, fontSize: 16, color: "#fff", textAlign: "center" }}>
                  DÍA DE DESCANSO
                </Text>
              </View>
            )}

            {!hasCoach && (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push("/quick-workout" as any)}
                  style={{ flexBasis: "48%", backgroundColor: VOLT, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                >
                  <Play size={14} color="#000" fill="#000" />
                  <Text style={{ ...athletic, fontSize: 11, color: "#000" }}>ENTRENO LIBRE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowRoutinePicker(true)}
                  style={{ flexBasis: "48%", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                >
                  <Search size={14} color="#fff" />
                  <Text style={{ ...athletic, fontSize: 11, color: "#fff" }}>PLANTILLAS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ flexBasis: "100%", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                >
                  <Edit2 size={14} color={SILVER} />
                  <Text style={{ ...athletic, fontSize: 11, color: SILVER }}>PERSONALIZAR DÍAS</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {sortedIndices?.map((i, rank) => {
          const ex            = exercises?.[i];
          if (!ex) return null;

          const setsLimit     = ex?.sets ?? 0;
          const doneSetsForEx = Math.min(doneSets?.[i] ?? 0, setsLimit);
          const exDone        = doneEx?.has(i) || (setsLimit > 0 && doneSetsForEx >= setsLimit);

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
                  source={{ uri: gymImageFor(ex?.name ?? "Ejercicio", ex?.muscleGroup) }}
                  resizeMode="cover"
                  imageStyle={{ opacity: 0.7 }}
                  style={{ flex: 1, justifyContent: "flex-end" }}
                >
                  <CardShade />
                  <View style={{ padding: 16, paddingRight: 76 }}>
                    {ex?.muscleGroup && (
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
                      {ex?.name || "EJERCICIO"}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: ZINC, marginTop: 6 }}>
                      {doneSetsForEx}/{setsLimit} SETS · {ex?.reps || 0} REPS
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

      {/* ── 6 · Glowing overlay bottom latch — el único control de acción
          una vez iniciada la sesión: PAUSAR / REANUDAR / FINALIZAR. La
          píldora superior (arriba) ya no se renderiza en ninguno de estos
          tres estados, así que nunca coexisten dos botones de acción. ── */}
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
            onPress={lifecycle === "ACTIVE_TRACKING" ? () => setPhase("PAUSED") : () => setPhase("ACTIVE_TRACKING")}
            style={{
              height: 54, borderRadius: 27, backgroundColor: LATCH_BG,
              borderWidth: 1.5, borderColor: VOLT,
              flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
            }}
          >
            {lifecycle === "ACTIVE_TRACKING"
              ? <Pause size={16} color={VOLT} fill={VOLT} />
              : <Play size={16} color={VOLT} fill={VOLT} />}
            <Text style={{ ...athletic, fontSize: 15, color: VOLT }}>
              {lifecycle === "ACTIVE_TRACKING" ? "PAUSAR ENTRENAMIENTO" : "REANUDAR ENTRENAMIENTO"}
            </Text>
          </PulseButton>
        </MotiView>
      )}

      <TemplatePickerModal
        visible={showRoutinePicker}
        onClose={() => setShowRoutinePicker(false)}
        type="routine"
        onApply={async tpl => {
          if (tpl.type !== "routine") return;
          await applyRoutineTemplate(tpl);
          triggerSuccess();
        }}
      />
      <EnterCoachCodeModal
        visible={showCoachCode}
        onClose={() => setShowCoachCode(false)}
        onSuccess={(name) => {
          setShowCoachCode(false);
          // Opcional: trigger un refetch del roster/estado del usuario aquí.
        }}
      />
    </SafeAreaView>
  );
}
