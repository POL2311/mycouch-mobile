import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowRight, Timer, Check, AlertTriangle } from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useWorkout } from "@/lib/workout";
import { useGamification } from "@/lib/gamification";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8E8E93";
const GLASS  = {
  backgroundColor: "rgba(25,25,27,0.5)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
} as const;

const RING_SIZE   = 200;
const RING_RADIUS = 88;
const RING_STROKE = 16;

// Simulated heart-rate feed only carries avg/max, never a time series (see
// lib/workout.tsx's NATIVE_BRIDGE comment) — this sparkline is illustrative
// chrome, same demo-data status as the rest of the biometrics bridge. Opacity
// ramps dim→bright left-to-right to read as a rising trend, matching the ref.
const SPARK_HEIGHTS = [12, 16, 10, 22, 28];
const SPARK_OPACITY = [0.35, 0.5, 0.4, 0.75, 1];

// ── Tactical Telemetry precision-matrix summary ──────────────────────────────
export default function WorkoutSuccessScreen() {
  const { durationStr, biometrics, resetSession, syncStatus, syncCompletedSession, setLifecycle } = useWorkout();
  const { addXP } = useGamification();
  const insets = useSafeAreaInsets();

  // This is a terminal success screen reached via router.push from the
  // WORKOUT tab, but that tab is registered with href:null (to hide it from
  // the dock) — which excludes it from expo-router's back-history entirely.
  // router.back() here throws "GO_BACK was not handled by any navigator"
  // since there's nothing to pop to. replace() to the real WORKOUT tab root
  // sidesteps that, and is arguably more correct anyway: a finished-session
  // screen shouldn't be revisitable via hardware back once dismissed.
  //
  // +100 XP here, not a streak increment — the app already has a real,
  // backend-owned Student.streak (see lib/portal.tsx) that drives the coach
  // dashboard's team telemetry. A second, client-only "streak" incremented
  // by this button would just be a confusing duplicate of a number that
  // already exists and already means something real.
  const leave = () => { addXP(100); resetSession(); router.replace("/(portal)"); };

  // "Continue" must NOT call resetSession() — that wipes doneSets/doneEx/
  // setLogs back to empty, which would make a button promising to let you
  // review your exercises instead erase them. Dropping lifecycle to PAUSED
  // (not COMPLETED) keeps all progress intact, shows the routine with sets
  // still marked done, and avoids re-triggering the completed→success
  // redirect on the lobby (which only fires while lifecycle === "COMPLETED").
  const continueViewing = () => { setLifecycle("PAUSED"); router.replace("/(portal)"); };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#000000" }}>
      <ScrollView
        style={{ flex: 1 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}
      >
        {/* ── Score ring centerpiece ── */}
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <View
            style={{
              width: RING_SIZE, height: RING_SIZE,
              shadowColor: VOLT, shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
              elevation: 14,
            }}
          >
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Defs>
                <LinearGradient id="scoreRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={CYAN} />
                  <Stop offset="1" stopColor={VOLT} />
                </LinearGradient>
              </Defs>
              <Circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                stroke="url(#scoreRingGrad)" strokeWidth={RING_STROKE} fill="none"
                strokeLinecap="round"
              />
            </Svg>
            <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 54, fontWeight: "800", letterSpacing: -1, color: "#fff" }}>
                98
              </Text>
              <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 4, color: SILVER, textTransform: "uppercase" }}>
                PUNTUACIÓN
              </Text>
            </View>
          </View>
        </View>

        {/* ── Header block ── */}
        <View style={{ alignItems: "center", marginTop: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", letterSpacing: 0.5, color: "#fff", marginBottom: 6, textAlign: "center" }}>
            RESUMEN DE SESIÓN
          </Text>
          <Text style={{ fontSize: 13, color: SILVER, textAlign: "center" }}>
            Análisis biomecánico y telemétrico finalizado con éxito.
          </Text>
        </View>

        {/* ── Bento row 1: heart-rate sparkline ── */}
        <View
          style={{
            width: "100%", height: 92, borderRadius: 24, padding: 16,
            flexDirection: "row", justifyContent: "space-between", alignItems: "center",
            marginTop: 24, ...GLASS,
          }}
        >
          <View>
            <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 2, color: CYAN, textTransform: "uppercase" }}>
              PROM. FC
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
              <Text style={{ fontSize: 32, fontWeight: "700", color: CYAN }}>
                {biometrics.avgHeartRate}
              </Text>
              <Text style={{ fontSize: 12, color: SILVER, marginLeft: 6 }}>BPM</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            {SPARK_HEIGHTS.map((h, i) => (
              <View
                key={i}
                style={{ width: 4, height: h, borderRadius: 2, backgroundColor: CYAN, opacity: SPARK_OPACITY[i], marginHorizontal: 2 }}
              />
            ))}
          </View>
        </View>

        {/* ── Bento row 2: energy + chrono ── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 12 }}>
          {/* ENERGÍA */}
          <View style={{ width: "48.5%", height: 110, borderRadius: 24, padding: 16, ...GLASS }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 14 }}>🔥</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: VOLT }}>+12%</Text>
            </View>
            <View style={{ marginTop: "auto" }}>
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER, textTransform: "uppercase", marginBottom: 4 }}>
                ENERGÍA
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontSize: 26, fontWeight: "700", color: "#fff" }}>
                  {biometrics.activeCalories}
                </Text>
                <Text style={{ fontSize: 11, color: SILVER, marginLeft: 4 }}>KCAL</Text>
              </View>
            </View>
          </View>

          {/* TIEMPO */}
          <View style={{ width: "48.5%", height: 110, borderRadius: 24, padding: 16, ...GLASS }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Timer size={14} color={CYAN} />
              <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: CYAN }}>FIX</Text>
            </View>
            <View style={{ marginTop: "auto" }}>
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER, textTransform: "uppercase", marginBottom: 4 }}>
                TIEMPO
              </Text>
              <Text className="font-mono" style={{ fontSize: 26, fontWeight: "700", letterSpacing: -0.5, color: "#fff" }}>
                {durationStr}
              </Text>
            </View>
          </View>
        </View>

        {/* Sync feedback isn't in the pixel spec, but the POST it reports on
            is what makes this session visible on the coach dashboard at all —
            dropping the retry affordance would silently lose finished
            sessions on a failed upload. */}
        <View style={{ alignItems: "center", marginTop: 24 }}>
          {syncStatus === "syncing" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={VOLT} />
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.8, color: SILVER, textTransform: "uppercase" }}>
                Sincronizando con servidor...
              </Text>
            </View>
          )}
          {syncStatus === "synced" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Check size={12} color={VOLT} />
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.8, color: VOLT, textTransform: "uppercase" }}>
                Sesión guardada en el servidor
              </Text>
            </View>
          )}
          {syncStatus === "error" && (
            <View style={{ alignItems: "center", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={12} color="#ef4444" />
                <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.8, color: "#ef4444", textTransform: "uppercase", textAlign: "center" }}>
                  No se pudo sincronizar — quedó guardada localmente
                </Text>
              </View>
              <Pressable onPress={syncCompletedSession} style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.8, color: SILVER, textTransform: "uppercase" }}>
                  Reintentar sincronización
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Master floor controller — closes the training loop. Now that the
          dock's gone from underneath this screen (see NO_DOCK_SCREENS in
          (portal)/_layout.tsx), this button sits directly above the OS home
          indicator — insets.bottom is what actually clears it, not a guess. */}
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 8 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={leave}
          style={{
            height: 56, borderRadius: 28, backgroundColor: VOLT,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Text style={{ fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", fontSize: 14, color: "#000" }}>
            Regresar al panel
          </Text>
          <ArrowRight size={16} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={continueViewing}
          style={{
            height: 56, borderRadius: 28, marginTop: 12,
            backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
            justifyContent: "center", alignItems: "center",
          }}
        >
          <Text
            className="font-mono"
            style={{ fontSize: 14, fontWeight: "700", letterSpacing: 1.5, color: CYAN, textTransform: "uppercase" }}
          >
            Ver ejercicios / continuar
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
