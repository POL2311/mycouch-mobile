import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback, useMemo, useEffect } from "react";
import { PulseButton } from "@/components/ui/PulseButton";
import * as Haptics from "expo-haptics";
import { Scale, LayoutGrid } from "lucide-react-native";
import Svg, {
  Path, Circle, Polygon, Line, Rect, Text as SvgText, Defs, LinearGradient, Stop,
  Filter, FeGaussianBlur, FeMerge, FeMergeNode,
} from "react-native-svg";
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { usePortal } from "@/lib/portal";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { todayDateStr, useWorkout } from "@/lib/workout";

// ── Stats engine tokens ──────────────────────────────────────────────────────
const VOLT   = "#CCFF00";
const TEAL   = "#40E0D0";
const OLED   = "#070708";
const PANEL  = "#1C1C1E";
const SILVER = "#8e8e93";

// Premium glassmorphic bento shell (recomposition §2 layout criteria).
const BENTO = {
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.1)",
  borderRadius: 24,
  padding: 20,
  marginHorizontal: 20,
  marginTop: 16,
} as const;

const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// ══════════════════════════════════════════════════════════════════════════════
//  DOMAIN TYPES — verbatim from MYCOACH_STATS_WEB_BLUEPRINT.md §3.3
// ══════════════════════════════════════════════════════════════════════════════
interface WeightEntry { date: string; weight: number }                      // date = "YYYY-MM-DD"
interface BodyMeasurements {
  id?: string; date: string; chest: number; waist: number;
  hips: number; armL: number; armR: number; thighL: number; thighR: number;
}

// ── Chart geometry — verbatim web math (blueprint §2.1, lines 2949–2964) ────
const PW = 320, PH = 80, PAD = 10;

// Demo telemetry, used only while the server weight history has <2 points
// (mirrors the web's demo-value posture; 66→55 reproduces the -11kg mock).
const FALLBACK_WEIGHTS = [66, 64.5, 63, 62.5, 61, 59, 56.5, 55];

// Footer strip — DECORATIVE by design (blueprint sharp edge #1): selecting a
// tab recolors the label only; the chart always plots the full history.
const DAY_TABS = ["LUN", "MAR", "MIÉ", "HOY"];

// ── Biometric delta model (blueprint §2.5) ───────────────────────────────────
// The mobile portal payload doesn't carry measurement fields yet (only weight
// series), so this is invoked with undefined and renders the web's exact demo
// fallbacks. Wire `detail.measurements` rows in once the API exposes them.
function buildBioCards(latest?: BodyMeasurements, prev?: BodyMeasurements) {
  const rows = [
    { label: "BRAZO",   curr: latest?.armR  ?? 28.5, base: prev?.armR  ?? 28, unit: "cm", goodIfPos: true  },
    { label: "CINTURA", curr: latest?.waist ?? 68,   base: prev?.waist ?? 71, unit: "cm", goodIfPos: false },
  ];
  return rows.map(r => {
    const delta  = +(r.curr - r.base).toFixed(1);
    const isGood = r.goodIfPos ? delta >= 0 : delta <= 0;
    return {
      ...r,
      delta,
      deltaLabel: `${delta >= 0 ? "+" : ""}${delta}${r.unit}`,
      deltaColor: delta === 0 ? "#808080" : isGood ? "#4ade80" : "rgba(248,113,113,0.9)",
    };
  });
}

// ── Block A · macro radar geometry (blueprint §2.2: viewBox 200×216, R 72) ──
const RCX = 100, RCY = 108, RR = 72;
function radarXY(axis: number, frac: number): { x: number; y: number } {
  const a = -Math.PI / 2 + ((2 * Math.PI) / 3) * axis;
  return { x: RCX + RR * frac * Math.cos(a), y: RCY + RR * frac * Math.sin(a) };
}
function radarPt(axis: number, frac: number): string {
  const p = radarXY(axis, frac);
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}
// Consumed fractions are demo values until the mobile app tracks checked meals
// (the web derives them from checkedMeals × meals[].macros — blueprint §2.2).
const DEMO_MACRO_FRACS = [0.72, 0.55, 0.4] as const;

// ── Block B · 7-day timeline geometry (blueprint §2.3) ──────────────────────
const CW = 288, CH = 72, CP = 12;
const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];   // Wednesday is X here (blueprint §2.3)
const DEMO_INTAKE    = [1850, 2100, 1780, 2240, 1900, 1600, 2050];
const DEMO_EX_COUNTS = [4, 5, 3, 5, 4, 2, 3];             // per-day exercise logs; today is live

// ── Block C · PR sweep bar — 700 ms left→right fill, 120 ms row stagger ─────
function SweepBar({ pct, delay }: { pct: number; delay: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(pct, { duration: 700, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
  }, [pct, delay, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: "#2C2C2E", overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: 4, backgroundColor: VOLT }, fill]} />
    </View>
  );
}

// ── Block D · photo slots — seed frames until /api/me/photos ships mobile ───
const PHOTO_SEEDS = {
  before: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&q=60",
  after:  "https://images.unsplash.com/photo-1571731956672-f2b94d7dd0cb?w=600&q=60",
};

// Semi-translucent posture-comparison matrix (rule-of-thirds verticals +
// quarter horizontals) laid over both photo previews.
function GridMatrix() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1, 2].map(i => (
        <View
          key={`v${i}`}
          style={{ position: "absolute", left: `${(i / 3) * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.28)" }}
        />
      ))}
      {[1, 2, 3].map(i => (
        <View
          key={`h${i}`}
          style={{ position: "absolute", top: `${(i / 4) * 100}%`, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.28)" }}
        />
      ))}
    </View>
  );
}

// Bottom scrim keeping slot labels razor-sharp over photography.
function PhotoScrim() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="photoScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"    stopColor="#000000" stopOpacity="0" />
          <Stop offset="0.55" stopColor="#000000" stopOpacity="0.25" />
          <Stop offset="1"    stopColor="#000000" stopOpacity="0.92" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#photoScrim)" />
    </Svg>
  );
}

export default function StatsScreen() {
  const { student, detail, refresh, isLoading } = usePortal();
  const { token } = useAuth();
  const { doneEx } = useWorkout();

  // ── Optimistic weight-telemetry overlay (blueprint §1.2 handleWeightLog) ──
  // The portal provider owns server truth; these overlays render the optimistic
  // node immediately and are reconciled by refresh() after a confirmed write.
  const [localHistory, setLocalHistory] = useState<WeightEntry[] | null>(null);
  const [localWeight,  setLocalWeight]  = useState<number | null>(null);

  const realHistory: WeightEntry[] = useMemo(
    () => localHistory ?? detail?.weightHistory ?? [],
    [localHistory, detail?.weightHistory],
  );
  const usingFallback = realHistory.length < 2;
  const chartWeights  = usingFallback ? FALLBACK_WEIGHTS : realHistory.map(h => h.weight);

  const currentKg   = localWeight ?? student?.currentWeight ?? chartWeights[chartWeights.length - 1]!;
  // startWeight = weightHistory[0]?.weight ?? currentWeight (blueprint §1.1)
  const startWeight = usingFallback ? FALLBACK_WEIGHTS[0]! : (realHistory[0]?.weight ?? currentKg);
  const displayKg   = usingFallback ? FALLBACK_WEIGHTS[FALLBACK_WEIGHTS.length - 1]! : currentKg;

  // Delta pill — diff = +(currentWeight − startWeight).toFixed(1)
  const diff = +(displayKg - startWeight).toFixed(1);
  const pillText = diff < 0 ? `${diff}kg TOTAL` : diff > 0 ? `+${diff}kg TOTAL` : "0kg TOTAL";
  const stateCaption = diff < 0 ? "▼ PÉRDIDA ACTIVA" : diff > 0 ? "▲ GANANCIA" : "— SIN CAMBIO";
  const stateColor   = diff < 0 ? VOLT : diff > 0 ? "#f87171" : "#808080";

  // ── Inverted-Y success curve (blueprint §2.1 — deliberate, do not "fix") ──
  // Low weight (fat-loss success) plots to the TOP of the SVG, so a weight-loss
  // timeline draws an ascending left→right curve. X is index-based, not
  // date-proportional.
  const minW = Math.min(...chartWeights) - 0.8;
  const maxW = Math.max(...chartWeights) + 0.8;
  const toY = (w: number) => PAD + ((w - minW) / Math.max(maxW - minW, 0.01)) * (PH - PAD * 2);
  const toX = (i: number) => PAD + (i / Math.max(chartWeights.length - 1, 1)) * (PW - PAD * 2);
  const pts      = chartWeights.map((w, i) => `${toX(i).toFixed(1)},${toY(w).toFixed(1)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${toX(chartWeights.length - 1).toFixed(1)},${PH - PAD} L ${toX(0).toFixed(1)},${PH - PAD} Z`;
  const latestW  = chartWeights[chartWeights.length - 1] ?? maxW;

  // ── Decorative footer tab highlight (init 2 = MIÉ, blueprint §3.2) ────────
  const [dayTab, setDayTab] = useState(2);

  // ── LOG DE PESO modal state machine (blueprint §3.2 / §4.2) ───────────────
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput,     setWeightInput]     = useState("");
  const [weightSaveState, setWeightSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");

  const openWeightModal = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeightSaveState("idle");
    setWeightInput("");
    setShowWeightModal(true);
  }, []);

  // handleWeightSave → handleWeightLog: pre-validate, optimistic same-day
  // replace / append, POST, rollback on failure (blueprint §1.2 verbatim flow).
  const saveWeight = useCallback(async () => {
    const kg = Math.round(parseFloat(weightInput.replace(",", ".")) * 10) / 10;   // 1-decimal
    if (!Number.isFinite(kg) || kg < 20 || kg > 500) { setWeightSaveState("error"); return; }

    // Device-local date — deliberate fix of the web's UTC drift (sharp edge #3):
    // toISOString() would stamp evening logs onto tomorrow's date.
    const date = todayDateStr();
    setWeightSaveState("saving");

    const prevHistory = realHistory;              // rollback snapshots
    const prevWeight  = localWeight ?? student?.currentWeight ?? null;

    const existsAt = realHistory.findIndex(e => e.date === date);
    const newHistory = existsAt >= 0
      ? realHistory.map((e, i) => i === existsAt ? { ...e, weight: kg } : e)     // same-day: replace
      : [...realHistory, { date, weight: kg }];                                   // else: append
    setLocalHistory(newHistory);
    setLocalWeight(kg);

    try {
      await api("/api/me/biometrics", { method: "POST", token: token ?? undefined, body: { weight: kg, date } });
      setWeightSaveState("done");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refresh().catch(() => {});                  // server truth reconciles the overlay
      setTimeout(() => {                          // modal auto-closes 900 ms after done
        setShowWeightModal(false);
        setWeightSaveState("idle");
        setWeightInput("");
      }, 900);
    } catch {
      setLocalHistory(prevHistory);               // restore
      setLocalWeight(prevWeight);
      setWeightSaveState("error");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [weightInput, realHistory, localWeight, student?.currentWeight, token, refresh]);

  const bioCards = buildBioCards();               // demo fallbacks until the API exposes measurement fields

  // ── Block A inputs — real plan macro targets, demo consumption fractions ──
  const meals = detail?.diet.meals ?? [];
  const sumMacro = (pick: (m: { macros: { protein: number; carbs: number; fat: number } }) => number) =>
    meals.reduce((s, m) => s + (pick(m) || 0), 0);
  const tgtP = meals.length ? Math.max(1, sumMacro(m => m.macros?.protein ?? 0)) : 150;
  const tgtC = meals.length ? Math.max(1, sumMacro(m => m.macros?.carbs   ?? 0)) : 220;
  const tgtF = meals.length ? Math.max(1, sumMacro(m => m.macros?.fat     ?? 0)) : 70;
  const [fracP, fracC, fracF] = DEMO_MACRO_FRACS;
  const valP = Math.round(tgtP * fracP), valC = Math.round(tgtC * fracC), valF = Math.round(tgtF * fracF);
  const totalKcal    = valP * 4 + valC * 4 + valF * 9;
  const consumedPoly = DEMO_MACRO_FRACS.map((f, i) => radarPt(i, Math.max(f, 0.04))).join(" ");
  const radarLegend  = [
    { label: "PROTEÍNA", val: valP, tgt: tgtP, dot: TEAL },
    { label: "CARBS",    val: valC, tgt: tgtC, dot: "#FFFFFF" },
    { label: "GRASA",    val: valF, tgt: tgtF, dot: "#808080" },
  ];

  // ── Block B inputs — burn = 1800 + 60×exercises (web estimation formula);
  // today's exercise count is live from the workout engine, other days demo. ──
  const todayIdx = (new Date().getDay() + 6) % 7;   // Mon=0 … Sun=6
  const exCounts = DEMO_EX_COUNTS.map((c, i) => (i === todayIdx ? doneEx.size : c));
  const burns    = exCounts.map(c => 1800 + 60 * c);
  const intake   = DEMO_INTAKE;
  const allVals  = [...intake, ...burns];
  const minV = Math.max(0, Math.min(...allVals) - 150);
  const maxV = Math.max(...allVals) + 150;
  const tlX  = (i: number) => CP + (i / 6) * (CW - 2 * CP);
  const tlY  = (v: number) => CP + (1 - (v - minV) / Math.max(maxV - minV, 1)) * (CH - 2 * CP);
  const intakePath = `M ${intake.map((v, i) => `${tlX(i).toFixed(1)},${tlY(v).toFixed(1)}`).join(" L ")}`;
  const burnPath   = `M ${burns.map((v, i) => `${tlX(i).toFixed(1)},${tlY(v).toFixed(1)}`).join(" L ")}`;

  // ── Block C inputs — real PRs from the student record (blueprint §2.4) ────
  const prRows = [
    { label: "SQUAT",    kg: student?.prSquat    ?? 0 },
    { label: "DEADLIFT", kg: student?.prDeadlift ?? 0 },
    { label: "BENCH",    kg: student?.prBench    ?? 0 },
  ];
  const maxPR = Math.max(prRows[0]!.kg || 1, prRows[1]!.kg || 1, prRows[2]!.kg || 1, 1);

  // ── Block D — posture comparison grid toggle ──────────────────────────────
  const [gridOn, setGridOn] = useState(false);

  const inputBorder = weightSaveState === "error" ? "#f87171"
    : weightSaveState === "done" ? VOLT
    : "rgba(204,255,0,0.22)";

  // Without this gate, the chart briefly renders FALLBACK_WEIGHTS demo data
  // and student?.currentWeight ?? 0-style zeros before the real portal fetch
  // resolves — not a crash (everything here already has safe fallbacks), but
  // a jarring flash of wrong numbers on every mount.
  if (isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: OLED, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={VOLT} />
        <Text className="text-[11px] uppercase mt-3" style={{ color: SILVER, letterSpacing: 1.2 }}>
          CARGANDO ESTADÍSTICAS...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: OLED }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>

        {/* ── 2 · Brand row — vector diamond-F + volt-ringed profile badge ── */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginTop: 12, height: 48 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Svg width={40} height={40} viewBox="0 0 62 62" style={StyleSheet.absoluteFill}>
                <Polygon points="31,3 59,31 31,59 3,31" stroke={VOLT} strokeWidth={3} fill="none" />
              </Svg>
              <Text style={{ ...athletic, fontSize: 16, color: VOLT }}>F</Text>
            </View>
            <Text className="font-bold uppercase" style={{ color: "#fff", fontSize: 14, letterSpacing: 3 }}>
              MYCOACH
            </Text>
          </View>
          <View
            style={{
              position: "absolute", right: 20,
              width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: VOLT,
              justifyContent: "center", alignItems: "center", backgroundColor: PANEL,
            }}
          >
            <Text className="font-black" style={{ fontSize: 13, color: "#fff" }}>23</Text>
          </View>
        </View>

        {/* Verbatim branding headlines */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 3, color: SILVER, textTransform: "uppercase" }}>
            PERFORMANCE INTELLIGENCE
          </Text>
          <Text style={{ fontSize: 36, lineHeight: 38, letterSpacing: -1, color: "#ffffff", marginTop: 4, ...athletic }}>
            ANÁLISIS DE{"\n"}RENDIMIENTO
          </Text>
        </View>

        {/* ── 1 · Weight success curve — bento glass canvas ── */}
        <BlurView
          intensity={24}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={{
            height: 260, borderRadius: 24, marginHorizontal: 20, marginTop: 20, overflow: "hidden",
            backgroundColor: "rgba(28, 28, 30, 0.4)",
            borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)",
            padding: 20, justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {/* Left telemetry column */}
            <View>
              <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
                PROGRESO HACIA LA META
              </Text>
              <Text className="font-black" style={{ fontSize: 44, color: "#ffffff", lineHeight: 48, marginTop: 4 }}>
                {Number.isInteger(displayKg) ? displayKg : displayKg.toFixed(1)}
                <Text style={{ fontSize: 16, color: SILVER }}> KG</Text>
              </Text>
              <Text style={{ fontSize: 10, letterSpacing: 1, color: "#d4d4d8", fontWeight: "300", marginTop: 2 }}>
                Eficiencia de Quema ↑
              </Text>
            </View>

            {/* Dynamic status pills */}
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ backgroundColor: VOLT, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                <Text style={{ fontWeight: "900", fontSize: 12, color: "#000000" }}>{pillText}</Text>
              </View>
              <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: stateColor, marginTop: 6 }}>
                {stateCaption}
              </Text>
            </View>
          </View>

          {/* Neon SVG aura engine — feGaussianBlur glow + wGrad area fill.
              overflow: visible lets the chartGlow filter's 140% region bleed
              past the exact 80px viewport instead of getting clipped flat at
              the pixel edge (blueprint §2.1: rendered "overflow: visible"). */}
          <Svg width="100%" height={PH} viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
            <Defs>
              <LinearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0"   stopColor={VOLT} stopOpacity="0.25" />
                <Stop offset="0.6" stopColor={VOLT} stopOpacity="0.08" />
                <Stop offset="1"   stopColor={VOLT} stopOpacity="0" />
              </LinearGradient>
              <Filter id="chartGlow" x="-20%" y="-20%" width="140%" height="140%">
                <FeGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <FeMerge>
                  <FeMergeNode in="coloredBlur" />
                  <FeMergeNode in="SourceGraphic" />
                </FeMerge>
              </Filter>
            </Defs>
            <Path d={areaPath} fill="url(#wGrad)" />
            <Path
              d={linePath}
              stroke={VOLT} strokeWidth={2} fill="none"
              strokeLinecap="round" strokeLinejoin="round"
              filter="url(#chartGlow)"
            />
            {/* Live end-node dot */}
            <Circle cx={toX(chartWeights.length - 1)} cy={toY(latestW)} r={4} fill={VOLT} filter="url(#chartGlow)" />
          </Svg>

          {/* Static axis identifiers — 4-column grid, hairline dividers */}
          <View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10 }}>
            {DAY_TABS.map((day, i) => {
              const active = dayTab === i;
              return (
                <View key={day} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                  {i > 0 && <View style={{ width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.06)" }} />}
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDayTab(i); }}
                  >
                    <Text
                      className="font-black text-center"
                      style={{ fontSize: 11, letterSpacing: 1.5, color: active ? VOLT : "rgba(255,255,255,0.22)" }}
                    >
                      {day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </BlurView>

        {/* ── 3 · Log telemetry action latch → LOG DE PESO modal ── */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={openWeightModal}
          style={{
            height: 54, borderRadius: 16, backgroundColor: "rgba(28,28,30,0.35)",
            borderWidth: 1.5, borderColor: "rgba(255,255,255,0.06)",
            flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
            marginHorizontal: 20, marginTop: 16,
          }}
        >
          <Scale size={15} color={VOLT} strokeWidth={2.5} />
          <Text className="font-black uppercase" style={{ fontSize: 12, letterSpacing: 1, color: VOLT }}>
            LOG TELEMETRY // REGISTRAR PESO
          </Text>
        </TouchableOpacity>

        {/* ── Biometric grid ── */}
        <Text
          style={{
            fontSize: 12, fontWeight: "bold", color: "#808080", textTransform: "uppercase",
            marginTop: 24, paddingHorizontal: 20, marginBottom: 12, letterSpacing: 1.2,
          }}
        >
          MEDICIONES BIOMÉTRICAS
        </Text>
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 20 }}>
          {bioCards.map(card => (
            <BlurView
              key={card.label}
              intensity={20}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={{
                flex: 1, maxWidth: 172, height: 110, borderRadius: 20, overflow: "hidden",
                backgroundColor: "rgba(28, 28, 30, 0.4)", padding: 16, justifyContent: "space-between",
                borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)",
              }}
            >
              <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
                {card.label}
              </Text>
              <Text className="font-black" style={{ fontSize: 30, color: "#ffffff" }}>
                {card.curr}
                <Text style={{ fontSize: 13, color: SILVER }}> {card.unit}</Text>
              </Text>
              <Text className="font-black" style={{ fontSize: 10, color: card.deltaColor }}>
                {card.deltaLabel}
              </Text>
            </BlurView>
          ))}
        </View>

        {/* ── BLOCK A · ANÁLISIS DE INGESTA — 3-axis macro radar ── */}
        <View style={BENTO}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER, textTransform: "uppercase" }}>
                DISTRIBUCIÓN MACRO HOY
              </Text>
              <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5, marginTop: 2 }}>
                ANÁLISIS DE INGESTA
              </Text>
            </View>
            <Text className="font-mono" style={{ fontSize: 10, color: VOLT }}>TOTAL {totalKcal}kcal</Text>
          </View>

          <View style={{ alignItems: "center", marginTop: 6 }}>
            <Svg width={200} height={216} viewBox="0 0 200 216">
              {/* Target frame + concentric grid rings */}
              {[0.25, 0.5, 0.75, 1].map(r => (
                <Polygon
                  key={r}
                  points={[0, 1, 2].map(i => radarPt(i, r)).join(" ")}
                  fill={r === 1 ? "rgba(255,255,255,0.03)" : "none"}
                  stroke={r === 1 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}
                  strokeWidth={r === 1 ? 1.5 : 1}
                />
              ))}
              {/* Axis spokes */}
              {[0, 1, 2].map(i => {
                const p = radarXY(i, 1);
                return <Line key={i} x1={RCX} y1={RCY} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
              })}
              {/* Consumed polygon — translucent cyan core + solid perimeter */}
              <Polygon
                points={consumedPoly}
                fill="rgba(64, 224, 208, 0.35)"
                stroke={TEAL}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {DEMO_MACRO_FRACS.map((f, i) => {
                const p = radarXY(i, Math.max(f, 0.04));
                {/* Vertex dims to 20% when an axis is at the 4% floor (blueprint §2.2) */}
                return <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={TEAL} opacity={f <= 0.04 ? 0.2 : 1} />;
              })}
              <SvgText x={RCX} y={RCY - RR - 10} fill="#808080" fontSize={7.5} textAnchor="middle" letterSpacing={1.5}>PROTEÍNA</SvgText>
              <SvgText x={RCX + RR * 0.5 + 22} y={RCY + RR * 0.866 + 10} fill="#808080" fontSize={7.5} textAnchor="middle" letterSpacing={1.5}>CARBS</SvgText>
              <SvgText x={RCX - RR * 0.5 - 22} y={RCY + RR * 0.866 + 10} fill="#808080" fontSize={7.5} textAnchor="middle" letterSpacing={1.5}>GRASA</SvgText>
            </Svg>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            {radarLegend.map(item => (
              <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.dot }} />
                <View>
                  <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>{item.label}</Text>
                  <Text className="font-black" style={{ fontSize: 11, color: "#fff" }}>
                    {item.val}g<Text style={{ color: "#71717a" }}>/{item.tgt}g</Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── BLOCK B · KCAL CORE TIMELINE — dual-line 7-day chart ── */}
        <View style={BENTO}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER, textTransform: "uppercase" }}>
                CICLO 7 DÍAS
              </Text>
              <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5, marginTop: 2 }}>
                KCAL CORE TIMELINE
              </Text>
            </View>
            <View style={{ gap: 4, alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 18, height: 2, backgroundColor: "#FFFFFF" }} />
                <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>INGESTA</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Svg width={18} height={2}>
                  <Line x1={0} y1={1} x2={18} y2={1} stroke={VOLT} strokeWidth={2} strokeDasharray="4,2.5" />
                </Svg>
                <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>GASTO EST.</Text>
              </View>
            </View>
          </View>

          <Svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ marginTop: 14 }}>
            <Defs>
              <Filter id="tlGlow" x="-20%" y="-20%" width="140%" height="140%">
                <FeGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <FeMerge>
                  <FeMergeNode in="coloredBlur" />
                  <FeMergeNode in="SourceGraphic" />
                </FeMerge>
              </Filter>
            </Defs>
            {[0.25, 0.5, 0.75].map(f => (
              <Line
                key={f}
                x1={CP} x2={CW - CP}
                y1={CP + f * (CH - 2 * CP)} y2={CP + f * (CH - 2 * CP)}
                stroke="rgba(255,255,255,0.04)" strokeWidth={1}
              />
            ))}
            {/* GASTO EST. — 1800 + 60×exercises, glowing volt dashed */}
            <Path d={burnPath} stroke={VOLT} strokeWidth={2} fill="none" strokeDasharray="5,3" strokeLinecap="round" filter="url(#tlGlow)" />
            {/* INGESTA — high-visibility white */}
            <Path d={intakePath} stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {intake.map((v, i) => (
              <Circle
                key={i}
                cx={tlX(i)} cy={tlY(v)}
                r={i === todayIdx ? 4.5 : 2.5}
                fill={v > 0 ? VOLT : "#1A1A1A"}
                stroke={VOLT} strokeWidth={1.5}
              />
            ))}
          </Svg>

          <View style={{ flexDirection: "row", marginTop: 10, paddingHorizontal: 4 }}>
            {DAY_LABELS.map((d, i) => (
              <Text
                key={d}
                className="font-mono text-center"
                style={{ flex: 1, fontSize: 9, letterSpacing: 1, color: i === todayIdx ? VOLT : SILVER, fontWeight: i === todayIdx ? "900" : "normal" }}
              >
                {d}
              </Text>
            ))}
          </View>
        </View>

        {/* ── BLOCK C · MAX STRENGTH SCAN — PR sweep bars ── */}
        <View style={BENTO}>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER, textTransform: "uppercase" }}>
            REGISTROS PERSONALES
          </Text>
          <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5, marginTop: 2 }}>
            MAX STRENGTH SCAN
          </Text>
          {prRows.map((row, i) => (
            <View key={row.label} style={{ marginTop: i === 0 ? 16 : 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1.5, color: SILVER }}>{row.label}</Text>
                <Text className="font-black" style={{ fontSize: 12, color: "#fff" }}>
                  {row.kg > 0 ? `${row.kg} kg` : "—"}
                </Text>
              </View>
              <SweepBar pct={Math.round((row.kg / maxPR) * 100)} delay={i * 120} />
            </View>
          ))}
        </View>

        {/* ── BLOCK D · REGISTRO VISUAL — physique comparison slots ── */}
        <View style={BENTO}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER, textTransform: "uppercase" }}>
                REGISTRO VISUAL
              </Text>
              <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5, marginTop: 2 }}>
                COMPARA TU EVOLUCIÓN
              </Text>
            </View>
            {/* Posture matrix toggle */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setGridOn(v => !v); }}
              style={{
                width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: VOLT,
                backgroundColor: gridOn ? VOLT : "transparent",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <LayoutGrid size={16} color={gridOn ? "#000" : VOLT} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
            {[
              { uri: PHOTO_SEEDS.before, tag: "FOTO INICIAL",  volt: false },
              { uri: PHOTO_SEEDS.after,  tag: "ESTADO ACTUAL", volt: true  },
            ].map(slot => (
              <View
                key={slot.tag}
                style={{ flex: 1, height: 210, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)", backgroundColor: PANEL }}
              >
                <ImageBackground
                  source={{ uri: slot.uri }}
                  resizeMode="cover"
                  imageStyle={{ opacity: 0.82 }}
                  style={{ flex: 1, justifyContent: "flex-end" }}
                >
                  <PhotoScrim />
                  {gridOn && <GridMatrix />}
                  <View style={{ padding: 10 }}>
                    <View
                      style={{
                        alignSelf: "flex-start", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
                        backgroundColor: slot.volt ? VOLT : "rgba(0,0,0,0.55)",
                        borderWidth: slot.volt ? 0 : 1, borderColor: "rgba(255,255,255,0.2)",
                      }}
                    >
                      <Text className="font-black" style={{ fontSize: 8, letterSpacing: 1, color: slot.volt ? "#000" : "#d4d4d8" }}>
                        {slot.tag}
                      </Text>
                    </View>
                  </View>
                </ImageBackground>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER }}>
              PESO INICIAL {startWeight}kg
            </Text>
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: VOLT }}>
              PESO ACTUAL {displayKg}kg
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── LOG DE PESO modal (blueprint §4.2) ── */}
      <Modal visible={showWeightModal} transparent animationType="slide" onRequestClose={() => setShowWeightModal(false)}>
        <BlurView intensity={40} tint="dark" style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,7,8,0.88)" }} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowWeightModal(false)} />
          <View
            style={{
              backgroundColor: "#1A1A1A", borderTopLeftRadius: 28, borderTopRightRadius: 28,
              padding: 24, paddingBottom: 40,
              borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderBottomWidth: 0,
            }}
          >
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: VOLT, textTransform: "uppercase" }}>
              TELEMETRÍA BIOMÉTRICA
            </Text>
            <Text style={{ ...athletic, fontSize: 24, color: "#fff", marginTop: 4 }}>
              LOG DE PESO
            </Text>
            <Text style={{ fontSize: 12, lineHeight: 17, color: SILVER, marginTop: 8, marginBottom: 18 }}>
              Registra tu peso matutino. Se actualiza en el historial y recalcula la curva de progreso inmediatamente.
            </Text>

            <View
              style={{
                flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 18,
                backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1.5, borderColor: inputBorder,
              }}
            >
              <TextInput
                value={weightInput}
                onChangeText={t => { setWeightInput(t); if (weightSaveState !== "saving") setWeightSaveState("idle"); }}
                keyboardType="decimal-pad"
                placeholder={String(displayKg)}
                placeholderTextColor="#52525b"
                autoFocus
                editable={weightSaveState !== "saving" && weightSaveState !== "done"}
                onSubmitEditing={saveWeight}
                selectionColor={VOLT}
                className="font-black"
                style={{ flex: 1, fontSize: 40, color: "#fff", paddingVertical: 14 }}
              />
              <Text className="font-black" style={{ fontSize: 14, color: SILVER }}>KG</Text>
            </View>

            {weightSaveState === "error" && (
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.5, color: "#f87171", marginTop: 10 }}>
                ✕ VALOR INVÁLIDO — INGRESA UN PESO ENTRE 20 Y 500 KG
              </Text>
            )}
            {weightSaveState === "done" && (
              <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.5, color: VOLT, marginTop: 10 }}>
                ⚡ TELEMETRÍA SINCRONIZADA
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowWeightModal(false)}
                style={{
                  flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
                }}
              >
                <Text className="font-black" style={{ fontSize: 12, letterSpacing: 1, color: "#a1a1aa" }}>CANCELAR</Text>
              </TouchableOpacity>
              <PulseButton
                glowColor={VOLT}
                disabled={weightSaveState === "saving" || weightSaveState === "done"}
                onPress={saveWeight}
                style={{
                  flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center",
                  flexDirection: "row", gap: 8, backgroundColor: VOLT,
                  opacity: weightSaveState === "saving" ? 0.7 : 1,
                }}
              >
                {weightSaveState === "saving" && <ActivityIndicator size="small" color="#000" />}
                <Text style={{ ...athletic, fontSize: 12, letterSpacing: 0.5, color: "#000" }}>
                  {weightSaveState === "done" ? "⚡ LISTO" : weightSaveState === "saving" ? "GUARDANDO..." : "CONFIRMAR"}
                </Text>
              </PulseButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
