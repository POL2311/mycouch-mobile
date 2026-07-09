import {
  View, Text, Pressable, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal, StyleSheet,
  KeyboardAvoidingView, Platform, type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { MotiView } from "moti";
import { PulseButton } from "@/components/ui/PulseButton";
import { useState, useEffect, useRef, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { BlurView } from "expo-blur";
import { Heart, Zap, Check, ChevronLeft, Settings, Dumbbell, Minus, Plus, Play, Pause } from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useWorkout } from "@/lib/workout";
import { usePortal } from "@/lib/portal";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { VOLT, ON_VOLT } from "@/components/workout-ui";
import type { RoutineExercise } from "@/lib/portal";

type Lift = "squat" | "deadlift" | "bench";
const LIFT_LABEL: Record<Lift, string> = {
  squat: "SENTADILLA", deadlift: "PESO MUERTO", bench: "BANCA",
};

// ── Pantalla 2/3 tracker tokens ──────────────────────────────────────────────
const GOLD      = "#D4AF37";  // Récord Personal rim
const TEAL      = "#40E0D0";  // recovery-state accent / EN CURSO badge fill
const TEAL_RIM  = "#1F4E49";  // recovery badge border
const PANEL     = "#1C1C1E";  // capsule / card / tile fill
const KEY_BG    = "#252528";  // stepper adjuster key fill
const TRACK     = "#2C2C2E";  // progress rail track
const REST_BG   = "#121212";  // Pantalla 3 matte slate canvas
const SILVER    = "#8e8e93";
const MUTED     = "#C5C5C5";
const GUTTER    = 16;         // 361pt-wide content on the 393pt reference frame

// Heavy condensed-oblique athletic type (system black-italic until Inter ships).
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Rest chronometer geometry — 280 concentric frame, 8pt foundation ring
// hugging the edge, 4pt live progress arc at the 260/130 inner radius.
const HALO_SIZE = 280, HALO_FOUNDATION_R = 136, HALO_R = 130, HALO_CIRC = 2 * Math.PI * HALO_R;
const CORE_SIZE = 180; // volumetric glow disc behind the countdown digits

// ── Frosted glass bento card (Pantalla 3 premium recipe) ─────────────────────
// The shadow lives on an outer wrapper: iOS clips shadows on views that carry
// overflow:'hidden', which the BlurView needs for its rounded corners.
function GlassCard({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  return (
    <View
      style={[
        {
          borderRadius: 20,
          shadowColor: "#000000", shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
        },
        style,
      ]}
    >
      <BlurView
        intensity={20}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={{
          flex: 1, borderRadius: 20, overflow: "hidden", padding: 16,
          backgroundColor: "rgba(28, 28, 30, 0.6)",
          borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)",
          justifyContent: "space-between",
        }}
      >
        {children}
      </BlurView>
    </View>
  );
}

// Keyword lift detection — master blueprint §4.1 (verbatim mapping).
function detectLift(name: string): Lift | null {
  const n = name.toLowerCase();
  if (n.includes("squat") || n.includes("sentadilla")) return "squat";
  if (n.includes("deadlift") || n.includes("peso muerto")) return "deadlift";
  if (n.includes("bench") || n.includes("press de banca") || n.includes("pecho")) return "bench";
  return null;
}

// Bottom dark fade — "linear-gradient(to top, #070708 0%, transparent 100%)".
function VideoMask() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="videoMask" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#070708" stopOpacity="0" />
          <Stop offset="1" stopColor="#070708" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#videoMask)" />
    </Svg>
  );
}

// ── Vertical oval load-selector capsule (§3) — 172×190, radius 40, glowing
// volt display digits over the dual −/+ stepper adjuster keys. ───────────────
function StepperCapsule({ label, value, onMinus, onPlus }: {
  label: string; value: number; onMinus: () => void; onPlus: () => void;
}) {
  return (
    <BlurView
      intensity={20}
      tint="dark"
      experimentalBlurMethod="dimezisBlurView"
      style={{
        flex: 1, maxWidth: 172, height: 190, borderRadius: 40, overflow: "hidden",
        // Razor-thin liquid-cyan rim — this capsule always represents the
        // in-progress set (only rendered while !exDone), so its border reads
        // as the "active set" state per the Tactical Telemetry spec.
        backgroundColor: "rgba(28, 28, 30, 0.6)", borderWidth: 1, borderColor: "rgba(64, 224, 208, 0.4)",
        alignItems: "center", paddingVertical: 16, justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 10, letterSpacing: 0.5, fontWeight: "800", color: SILVER, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className="font-mono"
        style={{
          fontSize: 64, fontWeight: "900", color: VOLT, paddingHorizontal: 10, fontVariant: ["tabular-nums"],
          textShadowColor: "rgba(204, 255, 0, 0.5)", textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {value}
      </Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={onMinus}
          style={{ width: 54, height: 40, borderRadius: 20, backgroundColor: KEY_BG, justifyContent: "center", alignItems: "center" }}
        >
          <Minus size={20} color={VOLT} strokeWidth={2.5} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={onPlus}
          style={{ width: 54, height: 40, borderRadius: 20, backgroundColor: KEY_BG, justifyContent: "center", alignItems: "center" }}
        >
          <Plus size={20} color={VOLT} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </BlurView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMPONENT A — <ActiveWorkoutView /> (the tracker engine, isResting === false)
// ═════════════════════════════════════════════════════════════════════════════
function ActiveWorkoutView({
  ex, videoSource, player, vidPlaying, toggleVideo, watchStatus,
  exDone, doneSetsForEx, focusWeight, focusReps, bumpWeight, bumpReps,
  lift, displayPR, onOpenPR, onSetComplete, dockClear,
}: {
  ex: RoutineExercise;
  videoSource: string | null;
  player: VideoPlayer;
  vidPlaying: boolean;
  toggleVideo: () => void;
  watchStatus: "IDLE" | "SCANNING" | "CONNECTED";
  exDone: boolean;
  doneSetsForEx: number;
  focusWeight: number;
  focusReps: number;
  bumpWeight: (d: number) => void;
  bumpReps: (d: number) => void;
  lift: Lift | null;
  displayPR: number;
  onOpenPR: () => void;
  onSetComplete: () => void;
  dockClear: number;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: dockClear + 28 }}
    >
      {/* ── 1 · Retina superior video canvas card ── */}
      <View
        style={{
          height: 200, borderRadius: 24, overflow: "hidden", position: "relative",
          marginHorizontal: GUTTER, marginTop: 16, backgroundColor: "#1E1E1E",
        }}
      >
        {videoSource ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "#1E1E1E" }} />
        )}
        <VideoMask />

        {/* Center translucent play controller */}
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={toggleVideo}
            style={{
              width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255, 255, 255, 0.15)",
              justifyContent: "center", alignItems: "center", opacity: videoSource ? 1 : 0.4,
            }}
          >
            {vidPlaying && videoSource
              ? <Pause size={24} color="#fff" fill="#fff" />
              : <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />}
          </TouchableOpacity>
        </View>

        {/* Absolute EN CURSO badge — lower left */}
        <View
          style={{
            position: "absolute", bottom: 12, left: 12, width: 85, height: 24,
            backgroundColor: TEAL, borderRadius: 6, justifyContent: "center", alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "bold", letterSpacing: 1, color: "#ffffff", textTransform: "uppercase" }}>
            EN CURSO
          </Text>
        </View>
      </View>

      {/* Wearable pairing micro-status — live while the telemetry scan runs */}
      {watchStatus === "SCANNING" && (
        <View
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            marginHorizontal: GUTTER, marginTop: 10, paddingVertical: 8, borderRadius: 12,
            backgroundColor: "rgba(204,255,0,0.05)", borderWidth: 1, borderColor: "rgba(204,255,0,0.2)",
          }}
        >
          <ActivityIndicator size="small" color={VOLT} />
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: VOLT }}>
            ⚡ SINCRONIZANDO SMARTWATCH
          </Text>
        </View>
      )}

      {/* Exercise identity */}
      <View style={{ paddingHorizontal: GUTTER, marginTop: 16 }}>
        {ex.muscleGroup && (
          <Text style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER, textTransform: "uppercase" }}>
            {ex.muscleGroup}
          </Text>
        )}
        <Text style={{ ...athletic, fontSize: 30, lineHeight: 32, letterSpacing: -0.8, color: "#ffffff", marginTop: 2 }}>
          {ex.name}
        </Text>
      </View>

      {/* ── 2 · Kinetic gold-rimmed RÉCORD PERSONAL card ──
          Shadow lives on this outer wrapper: iOS clips shadows on views that
          carry overflow:'hidden', which the inner BlurView needs for its
          rounded corners. */}
      <View
        style={{
          marginTop: 20, marginHorizontal: GUTTER,
          shadowColor: VOLT, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
        }}
      >
        <BlurView
          intensity={20}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={{
            height: 130, borderRadius: 24, overflow: "hidden",
            backgroundColor: "rgba(28, 28, 30, 0.6)",
            borderWidth: 1, borderColor: GOLD, padding: 20,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12, justifyContent: "center" }}>
            <Text style={{ fontSize: 10, letterSpacing: 2, fontWeight: "bold", color: GOLD, textTransform: "uppercase" }}>
              RÉCORD PERSONAL
            </Text>
            {lift ? (
              <>
                <Text className="font-black" style={{ fontSize: 40, color: "#ffffff", lineHeight: 44, marginTop: 4 }}>
                  {displayPR > 0 ? displayPR : "—"}
                  {displayPR > 0 && <Text style={{ fontSize: 15, color: SILVER }}> kg</Text>}
                </Text>
                <Text style={{ fontSize: 9, letterSpacing: 1, color: SILVER, textTransform: "uppercase" }}>
                  {LIFT_LABEL[lift]}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 12, color: SILVER, marginTop: 8 }}>
                Sin récord rastreado para este ejercicio.
              </Text>
            )}
          </View>

          {/* SUBIR PR action pill */}
          {lift && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onOpenPR}
              style={{
                width: 100, height: 32, borderRadius: 16, borderWidth: 1, borderColor: VOLT,
                justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 5,
              }}
            >
              <Zap size={11} fill={VOLT} color={VOLT} />
              <Text className="font-black" style={{ fontSize: 10, letterSpacing: 1, color: VOLT, textTransform: "uppercase" }}>
                SUBIR PR
              </Text>
            </TouchableOpacity>
          )}
        </BlurView>
      </View>

      {!exDone ? (
        <>
          {/* ── 3 · Symmetric dual oval capsule control grid ── */}
          <View
            style={{
              flexDirection: "row", justifyContent: "space-between", gap: 16,
              marginTop: 20, paddingHorizontal: GUTTER, width: "100%",
            }}
          >
            <StepperCapsule
              label="PESO (KG)"
              value={focusWeight}
              onMinus={() => bumpWeight(-2.5)}
              onPlus={() => bumpWeight(2.5)}
            />
            <StepperCapsule
              label="REPS OBJETIVO"
              value={focusReps}
              onMinus={() => bumpReps(-1)}
              onPlus={() => bumpReps(1)}
            />
          </View>

          {/* ── 4 · Master floor action CTA — SET COMPLETE ──
               Light haptic + set capture fire inside onSetComplete; the shared
               rest engine flips isResting → <RestTimerView/> mounts. */}
          <PulseButton
            glowColor={VOLT}
            onPress={onSetComplete}
            style={{
              width: 280, height: 56, borderRadius: 28, backgroundColor: "#121212",
              borderWidth: 1.5, borderColor: VOLT, alignSelf: "center", marginTop: 32,
              justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8,
            }}
          >
            <Check size={17} color={VOLT} strokeWidth={3} />
            <Text style={{ ...athletic, color: VOLT, fontSize: 16, letterSpacing: 1 }}>
              SET COMPLETE
            </Text>
          </PulseButton>

          <Text
            style={{
              fontSize: 9, letterSpacing: 2, fontWeight: "bold", color: SILVER,
              textTransform: "uppercase", textAlign: "center", marginTop: 12,
            }}
          >
            SET {doneSetsForEx + 1} DE {ex.sets}
          </Text>
        </>
      ) : (
        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 12, stiffness: 180 }}
          style={{
            marginTop: 20, marginHorizontal: GUTTER, borderRadius: 24, padding: 20,
            alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
            backgroundColor: "rgba(204,255,0,0.06)", borderWidth: 1, borderColor: "rgba(204,255,0,0.3)",
          }}
        >
          <Check size={16} color={VOLT} strokeWidth={3} />
          <Text className="font-black uppercase" style={{ fontSize: 14, color: VOLT, letterSpacing: 1 }}>
            EJERCICIO COMPLETADO
          </Text>
        </MotiView>
      )}
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMPONENT B — <RestTimerView /> (the reactor countdown, isResting === true)
// ═════════════════════════════════════════════════════════════════════════════
function RestTimerView({
  restSecs, restPct, bpm, nextWeight, nextSet, totalSets, overallPct,
  onExtend, onNext, dockClear,
}: {
  restSecs: number;
  restPct: number;
  bpm: number;
  nextWeight: number;
  nextSet: number;
  totalSets: number;
  overallPct: number;
  onExtend: () => void;
  onNext: () => void;
  dockClear: number;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: dockClear + 24 }}
    >
      <MotiView
        from={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", damping: 14 }}
        style={{ width: "100%" }}
      >
        {/* ── 2 · Encapsulated RECUPERACIÓN ACTIVA LED badge ── */}
        <View
          style={{
            width: 210, height: 32, borderRadius: 16, alignSelf: "center", marginTop: 24,
            backgroundColor: PANEL, borderWidth: 1, borderColor: TEAL_RIM,
            flexDirection: "row", justifyContent: "center", alignItems: "center",
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TEAL, marginRight: 8 }} />
          <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: TEAL, textTransform: "uppercase" }}>
            RECUPERACIÓN ACTIVA
          </Text>
        </View>

        {/* ── 3 · Concentric three-dimensional rest chronometer ── */}
        <View
          style={{
            width: HALO_SIZE, height: HALO_SIZE, alignSelf: "center", marginTop: 40,
            position: "relative", justifyContent: "center", alignItems: "center",
          }}
        >
          <Svg width={HALO_SIZE} height={HALO_SIZE} style={StyleSheet.absoluteFill}>
            {/* Outer foundation ring */}
            <Circle
              cx={HALO_SIZE / 2} cy={HALO_SIZE / 2} r={HALO_FOUNDATION_R}
              stroke={PANEL} strokeWidth={8} fill="none"
            />
            {/* Active digital progress arc — live restPct drive */}
            <Circle
              cx={HALO_SIZE / 2} cy={HALO_SIZE / 2} r={HALO_R}
              stroke={TEAL} strokeWidth={4} fill="none"
              strokeLinecap="round"
              strokeDasharray={`${HALO_CIRC}`}
              strokeDashoffset={HALO_CIRC * (1 - restPct)}
              rotation={-90}
              origin={`${HALO_SIZE / 2}, ${HALO_SIZE / 2}`}
            />
          </Svg>

          {/* Volumetric core — simulated radial glow disc behind the digits */}
          <View
            style={{
              position: "absolute",
              top: (HALO_SIZE - CORE_SIZE) / 2, left: (HALO_SIZE - CORE_SIZE) / 2,
              width: CORE_SIZE, height: CORE_SIZE, borderRadius: CORE_SIZE / 2,
              backgroundColor: "rgba(64, 224, 208, 0.12)",
              shadowColor: TEAL, shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8, shadowRadius: 35, elevation: 15,
            }}
          />
          <Text
            className="font-mono"
            style={{
              fontSize: 54, fontWeight: "700", color: VOLT, fontVariant: ["tabular-nums"],
              textShadowColor: "rgba(204, 255, 0, 0.4)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
            }}
          >
            {String(Math.floor(restSecs / 60)).padStart(2, "0")}:{String(restSecs % 60).padStart(2, "0")}
          </Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 8, textAlign: "center", letterSpacing: 1.2, textTransform: "uppercase" }}>
            SEGUNDOS RESTANTES
          </Text>
        </View>

        {/* ── 4 · Matte metrics grid — BPM / Carga tiles ── */}
        <View
          style={{
            flexDirection: "row", justifyContent: "space-between", gap: 16,
            marginTop: 32, paddingHorizontal: GUTTER, width: "100%",
          }}
        >
          <GlassCard style={{ flex: 1, maxWidth: 172, height: 110 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Heart size={14} color="#F87171" fill="#F87171" />
              <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: MUTED, textTransform: "uppercase" }}>
                BPM
              </Text>
            </View>
            <Text className="font-black" style={{ fontSize: 26, color: "#fff" }}>
              {bpm || 142}
            </Text>
            <Text style={{ fontSize: 10, color: SILVER }}>recuperación activa</Text>
          </GlassCard>

          <GlassCard style={{ flex: 1, maxWidth: 172, height: 110 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Dumbbell size={14} color={TEAL} />
              <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: MUTED, textTransform: "uppercase" }}>
                CARGA SIG.
              </Text>
            </View>
            <Text className="font-black" style={{ fontSize: 26, color: "#fff" }}>
              {nextWeight > 0 ? `${nextWeight}` : "—"}
              {nextWeight > 0 && <Text style={{ fontSize: 14, color: SILVER }}> kg</Text>}
            </Text>
            <Text style={{ fontSize: 10, color: SILVER }}>
              SET {nextSet} DE {totalSets}
            </Text>
          </GlassCard>
        </View>

        {/* ── Session linear progress card ── */}
        <GlassCard style={{ height: 95, marginTop: 16, marginHorizontal: GUTTER }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: MUTED, textTransform: "uppercase" }}>
              PROGRESO DE SESIÓN
            </Text>
            <Text className="font-black" style={{ fontSize: 10, letterSpacing: 1, color: TEAL, textTransform: "uppercase" }}>
              SERIE {nextSet} DE {totalSets}
            </Text>
          </View>
          <View style={{ backgroundColor: TRACK, height: 6, borderRadius: 3 }}>
            {/* Glowing light-tube fill — no overflow clamp on the track, or the
                aura would be clipped to the 6pt rail */}
            <View
              style={{
                width: `${Math.min(Math.max(overallPct, 0), 100)}%`, height: "100%", borderRadius: 3,
                backgroundColor: TEAL,
                shadowColor: TEAL, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
              }}
            />
          </View>
          <Text style={{ fontSize: 10, color: SILVER, textAlign: "right" }}>
            {overallPct}%
          </Text>
        </GlassCard>

        {/* ── 5 · Dual action navigation control stack ── */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onExtend}
          style={{
            height: 48, borderRadius: 24, borderWidth: 1, borderColor: TRACK, backgroundColor: PANEL,
            marginTop: 24, marginHorizontal: GUTTER, justifyContent: "center", alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "bold", color: TEAL }}>
            +15s
          </Text>
        </TouchableOpacity>

        <PulseButton
          glowColor={TEAL}
          onPress={onNext}
          style={{
            height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: TEAL,
            backgroundColor: "rgba(64, 224, 208, 0.08)",
            marginTop: 12, marginHorizontal: GUTTER,
            flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
          }}
        >
          <Play size={15} color={TEAL} fill={TEAL} />
          <Text style={{ ...athletic, fontSize: 15, letterSpacing: 1, color: TEAL }}>
            SIGUIENTE
          </Text>
        </PulseButton>
      </MotiView>
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  SCREEN — the absolute interchange
// ═════════════════════════════════════════════════════════════════════════════
export default function ExerciseFocusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idx = Number(id);
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { student, refresh } = usePortal();
  const {
    exercises, setActiveExIdx, doneSets, doneEx, handleSetComplete,
    restOn, restSecs, restTotal, skipRest, extendRest, biometrics, overallPct,
    watchStatus,
  } = useWorkout();

  // Exit routing: the exercise tracker is a hidden tab, so router.back() can
  // resolve to whichever tab was focused before (the DIETA initial route on a
  // cold start) — every exit navigates explicitly to the Workout hub instead.
  const exitToHub = useCallback(() => router.navigate("/(portal)"), []);

  // ── THE ABSOLUTE INTERCHANGE ─────────────────────────────────────────────
  // The spec asks for a local `useState(false)`, but a parallel boolean would
  // desync from the shared rest engine: the provider's `restOn` is flipped
  // true by handleSetComplete→startRest (which owns the live countdown
  // interval) and false by skipRest. Aliasing it delivers the exact requested
  // state machine — SET COMPLETE mounts <RestTimerView/>, SIGUIENTE unmounts
  // it — with a single source of truth and no dead buttons on either branch.
  const isResting = restOn;

  // ── Dual PESO/REPS adjustment controller ─────────────────────────────────
  const [focusWeight, setFocusWeight] = useState(0);
  const [focusReps,   setFocusReps]   = useState(0);

  useEffect(() => {
    if (Number.isFinite(idx)) setActiveExIdx(idx);
  }, [idx, setActiveExIdx]);

  const ex = exercises[idx];

  // Reset to prescribed weight/reps when the focused exercise changes —
  // keyed on ex.name only; routine data never changes mid-session.
  useEffect(() => {
    const w = parseFloat((ex?.weight ?? "").replace(/[^\d.]/g, "")) || 0;
    const r = parseInt(ex?.reps ?? "", 10) || 10;
    setFocusWeight(w);
    setFocusReps(r);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex?.name]);

  const bumpWeight = useCallback(async (delta: number) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusWeight(w => Math.max(0, +(w + delta).toFixed(1)));
  }, []);
  const bumpReps = useCallback(async (delta: number) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusReps(r => Math.max(0, r + delta));
  }, []);

  // ── PR sheet state ──────────────────────────────────────────────────────
  const [prSheetOpen, setPrSheetOpen] = useState(false);
  const [prInput,     setPrInput]     = useState("");
  const [prSaving,    setPrSaving]    = useState(false);
  const [prError,     setPrError]     = useState<string | null>(null);
  const [optimisticPR, setOptimisticPR] = useState<number | null>(null);

  const lift = ex ? detectLift(ex.name) : null;
  const currentPR = lift === "squat" ? student?.prSquat
    : lift === "deadlift" ? student?.prDeadlift
    : lift === "bench" ? student?.prBench
    : null;
  const displayPR = Math.max(optimisticPR ?? 0, currentPR ?? 0);

  const submitPR = useCallback(async () => {
    if (!lift || !token) return;
    const kg = parseFloat(prInput.replace(",", "."));
    if (!Number.isFinite(kg) || kg <= 0) { setPrError("VALOR INVÁLIDO"); return; }
    setPrError(null);
    setPrSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (kg > (currentPR ?? 0)) setOptimisticPR(kg);
    try {
      // Real contract: PATCH /api/me/prs — the Student model only carries
      // prSquat/prDeadlift/prBench scalars; no per-exercise PR table exists.
      await api("/api/me/prs", { method: "PATCH", token, body: { lift, kg } });
      await refresh();
      setPrSheetOpen(false);
      setPrInput("");
    } catch (e: unknown) {
      setOptimisticPR(null);
      setPrError(e instanceof Error ? e.message.toUpperCase() : "ERROR AL GUARDAR RÉCORD");
    } finally {
      setPrSaving(false);
    }
  }, [lift, token, prInput, currentPR, refresh]);

  // SET COMPLETE: Light haptic + set log (inside the shared handler) + the
  // engine's startRest flips the interchange to <RestTimerView/>. Silent
  // auto-PR fires when the captured weight beats the record.
  const handleSetCompleteWithCapture = useCallback(async () => {
    const weight = focusWeight;
    const reps   = focusReps;
    await handleSetComplete({ weight, reps });
    if (lift && token && weight > (currentPR ?? 0)) {
      setOptimisticPR(weight);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      api("/api/me/prs", { method: "PATCH", token, body: { lift, kg: weight } })
        .then(() => refresh())
        .catch(() => setOptimisticPR(null));
    }
  }, [handleSetComplete, focusWeight, focusReps, lift, currentPR, token, refresh]);

  // ── Video ────────────────────────────────────────────────────────────────
  const videoSource = ex?.videoUrl ?? null;
  const [vidPlaying, setVidPlaying] = useState(true);
  const player = useVideoPlayer(videoSource, p => {
    if (videoSource) { p.loop = true; p.muted = true; p.play(); }
  });
  const toggleVideo = useCallback(async () => {
    if (!videoSource) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (vidPlaying) player.pause(); else player.play();
    setVidPlaying(v => !v);
  }, [videoSource, vidPlaying, player]);

  // ── Auto-return to lobby once this exercise's last set completes ────────
  const doneSetsForEx = ex ? Math.min(doneSets[idx] ?? 0, ex.sets) : 0;
  const exDone        = ex ? (doneEx.has(idx) || doneSetsForEx >= ex.sets) : false;
  const wasExDone      = useRef(false);
  useEffect(() => {
    if (exDone && !wasExDone.current) {
      wasExDone.current = true;
      const t = setTimeout(() => router.navigate("/(portal)"), 2000);
      return () => clearTimeout(t);
    }
    if (!exDone) wasExDone.current = false;
  }, [exDone]);

  // Dock clearance: the master floor dock is an 84px flat bar anchored to the
  // viewport floor plus the device safe-area inset.
  const DOCK_CLEAR = 84 + insets.bottom + 12;

  if (!ex) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#070708" }}>
        <View className="flex-1 items-center justify-center px-8">
          <Dumbbell size={40} color="rgba(255,255,255,0.35)" strokeWidth={1.5} />
          <Text className="text-center mt-3" style={{ fontSize: 13, color: "#8e8e93" }}>
            Ejercicio no disponible.
          </Text>
          <Pressable onPress={exitToHub} className="mt-5 px-5 py-2.5 border border-zinc-800 rounded-2xl">
            <Text className="uppercase" style={{ fontSize: 11, letterSpacing: 1, color: "#a1a1aa" }}>
              ← Volver al lobby
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Pantalla 3 flips the whole environment to the matte slate canvas and
  // re-tints the shared header chrome teal while the recovery engine runs.
  const chromeTint = isResting ? TEAL : VOLT;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: isResting ? REST_BG : "#070708" }}>

      {/* ── 1 · Minimalist structural navigation header — shared chrome for
          BOTH branches, so the back affordance never disappears mid-workout ── */}
      <View
        style={{
          paddingTop: insets.top, height: insets.top + 56, paddingHorizontal: GUTTER,
          flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%",
        }}
      >
        <Pressable
          onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); exitToHub(); }}
          hitSlop={12}
          style={{ width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" }}
        >
          <ChevronLeft size={22} color={chromeTint} strokeWidth={2.5} />
        </Pressable>
        <Text style={{ fontSize: 20, color: "#FFFFFF", fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" }}>
          MYCOACH
        </Text>
        <Pressable
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          hitSlop={12}
          style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}
        >
          <Settings size={22} color={isResting ? TEAL : "#ffffff"} strokeWidth={2.5} />
        </Pressable>
      </View>

      {isResting ? (
        <RestTimerView
          restSecs={restSecs}
          restPct={Math.min(restSecs / Math.max(restTotal, 1), 1)}
          bpm={biometrics.avgHeartRate}
          nextWeight={focusWeight}
          nextSet={Math.min(doneSetsForEx + 1, ex.sets)}
          totalSets={ex.sets}
          overallPct={overallPct}
          onExtend={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); extendRest(15); }}
          onNext={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); skipRest(); }}
          dockClear={DOCK_CLEAR}
        />
      ) : (
        <ActiveWorkoutView
          ex={ex}
          videoSource={videoSource}
          player={player}
          vidPlaying={vidPlaying}
          toggleVideo={toggleVideo}
          watchStatus={watchStatus}
          exDone={exDone}
          doneSetsForEx={doneSetsForEx}
          focusWeight={focusWeight}
          focusReps={focusReps}
          bumpWeight={bumpWeight}
          bumpReps={bumpReps}
          lift={lift}
          displayPR={displayPR}
          onOpenPR={() => setPrSheetOpen(true)}
          onSetComplete={handleSetCompleteWithCapture}
          dockClear={DOCK_CLEAR}
        />
      )}

      {/* ── SUBIR PR override sheet ── */}
      <Modal visible={prSheetOpen} transparent animationType="slide" onRequestClose={() => setPrSheetOpen(false)}>
        <BlurView
          intensity={60}
          tint="dark"
          style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,19,19,0.6)" }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPrSheetOpen(false)} />
          <BlurView
            intensity={50}
            tint="dark"
            style={{
              backgroundColor: "rgba(42,42,42,0.85)",
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              overflow: "hidden",
              padding: 20, paddingBottom: insets.bottom + 20,
              borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderBottomWidth: 0,
            }}
          >
            <View className="items-center mb-4">
              <View style={{ width: 36, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)" }} />
            </View>
            <Text className="font-black uppercase" style={{ fontSize: 9, letterSpacing: 2, color: VOLT }}>
              NUEVO RÉCORD
            </Text>
            <Text className="font-black uppercase" style={{ fontSize: 22, color: "#fff", marginTop: 4, marginBottom: 20 }}>
              {lift && LIFT_LABEL[lift]}
            </Text>
            <TextInput
              value={prInput}
              onChangeText={t => { setPrInput(t); setPrError(null); }}
              keyboardType="decimal-pad"
              placeholder={String(currentPR ?? 0)}
              placeholderTextColor="#71717a"
              autoFocus
              className="font-black"
              style={{
                fontSize: 64, color: "#fff", textAlign: "center",
                borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.15)",
                paddingVertical: 12,
              }}
            />
            {prError && (
              <Text style={{ color: "#f87171", fontSize: 11, marginTop: 8, textAlign: "center" }}>{prError}</Text>
            )}
            <Pressable
              onPress={submitPR}
              disabled={prSaving || !prInput}
              className="flex-row items-center justify-center"
              style={{
                gap: 8,
                marginTop: 20, backgroundColor: VOLT, borderRadius: 12, paddingVertical: 16,
                opacity: prSaving || !prInput ? 0.5 : 1,
                shadowColor: VOLT, shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
              }}
            >
              {prSaving
                ? <ActivityIndicator color={ON_VOLT} />
                : (
                  <>
                    <Check size={16} color={ON_VOLT} strokeWidth={3} />
                    <Text
                      className="font-black uppercase italic tracking-tighter text-center"
                      style={{ fontSize: 14, color: ON_VOLT }}
                    >
                      GUARDAR RÉCORD
                    </Text>
                  </>
                )
              }
            </Pressable>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
