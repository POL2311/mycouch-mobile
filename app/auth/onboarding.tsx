import {
  View, Text, TouchableOpacity, Pressable, ScrollView, ImageBackground, StyleSheet, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MotiView } from "moti";
import { useState, useCallback, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { ChevronLeft, Check, ArrowRight, Shield, Zap } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Polygon } from "react-native-svg";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8e8e93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

type WizardStep = "WELCOME" | "STAGE" | "BIOMETRICS" | "LIFESTYLE";
const STEP_ORDER: WizardStep[] = ["WELCOME", "STAGE", "BIOMETRICS", "LIFESTYLE"];

export type OperationalMode = "COACH" | "SOLO";

// Device-local draft of the intake answers — there's no self-signup endpoint
// to submit this to (mycouch: accounts are provisioned by a coach via
// POST /api/students, coach/admin-only; there is no public registration
// route anywhere in the API surface), so it's cached the same way
// lib/workout.tsx caches an in-progress session. operationalMode/
// targetWeight/height ride along here too — a coach who later creates this
// person's real account has no way to read this cache, but a self-coached
// user (Módulo 2, lib/portal.tsx isSelfCoached) can act on it after they
// eventually log in, and "UNIRME A UN COACH" is honored for real post-login
// via the real /api/community/join code flow (see app/(portal)/perfil —
// "VINCULAR CON UN COACH"), not simulated here.
const INTAKE_CACHE_KEY = "mc:onboarding_intake";
export interface OnboardingIntake {
  stage: string;
  frictions: string[];
  operationalMode?: OperationalMode;
  targetWeight?: string;
  height?: string;
}

// Maps directly to Student.stage's real vocabulary (Volumen/Definición/
// Recomposición) — "Mantenimiento" is deliberately excluded here, matching
// product logic: you don't onboard a new athlete into maintenance mode, a
// coach moves you there later.
const STAGE_OPTIONS = [
  { id: "Definición",    emoji: "🔥",   title: "DEFINICIÓN",    desc: "Optimiza la pérdida de grasa y conserva tu masa muscular." },
  { id: "Volumen",       emoji: "💪🏼", title: "VOLUMEN",        desc: "Incrementa tu masa muscular, fuerza y densidad." },
  { id: "Recomposición", emoji: "❤️",  title: "RECOMPOSICIÓN", desc: "Quema grasa y construye músculo de forma simultánea." },
];

const FRICTION_OPTIONS = [
  { id: "antojos",     emoji: "🍰", label: "Antojos constantes" },
  { id: "constancia",  emoji: "🔋", label: "Falta de constancia" },
  { id: "tiempo",      emoji: "📅", label: "Falta de tiempo" },
  { id: "ansiedad",    emoji: "😟", label: "Comer por ansiedad" },
  { id: "social",      emoji: "🍻", label: "Las reuniones sociales" },
  { id: "no_se_que",   emoji: "❓", label: "No sé qué comer" },
];

// Monochromatic athletic reference frame — desaturated via Imgix query params
// on the same Unsplash CDN used elsewhere in this app (no native filter
// module required for the grayscale treatment).
const LIFESTYLE_IMG = "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&q=70&sat=-100";

// ── Shared floor dock — circular back key + forward action(s) ───────────────
function FloorDock({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 8 }}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onBack}
        style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center" }}
      >
        <ChevronLeft size={20} color="#fff" />
      </TouchableOpacity>
      {children}
    </View>
  );
}

function HeaderRow({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", height: 48, paddingHorizontal: 20 }}>
      <TouchableOpacity onPress={onBack} hitSlop={12} style={{ position: "absolute", left: 20 }}>
        <ChevronLeft size={22} color="#fff" />
      </TouchableOpacity>
      <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: SILVER, textTransform: "uppercase" }}>
        Onboarding
      </Text>
    </View>
  );
}

// ── State-driven onboarding wizard — WELCOME → STAGE → BIOMETRICS →
// LIFESTYLE ───────────────────────────────────────────────────────────────
// There's still no public self-signup endpoint anywhere in this app's API
// surface (accounts are provisioned by a coach via POST /api/students,
// coach/admin-only) — the old gateway's body-metrics/activity-frequency
// steps were pure local BMI/TDEE display theater, never submitted anywhere,
// so they're not carried forward here either. Every step's answer only ever
// reaches AsyncStorage (INTAKE_CACHE_KEY) — the funnel still terminates at
// /auth/login, the app's one real authenticated entry point, regardless of
// which operationalMode the user picked. "UNIRME A UN COACH" is honored for
// real post-login, not here — see app/(portal)/perfil/index.tsx's
// "VINCULAR CON UN COACH" action, which calls the real POST
// /api/community/join code flow once the user has an authenticated session.
export default function OnboardingWizard() {
  const [step, setStep] = useState<WizardStep>("WELCOME");
  const [operationalMode, setOperationalMode] = useState<OperationalMode | undefined>(undefined);
  const [stage, setStage] = useState<string>("Volumen");   // Volumen selected by default
  const [targetWeight, setTargetWeight] = useState("");
  const [height, setHeight] = useState("");
  const [frictions, setFrictions] = useState<Set<string>>(new Set());

  // ── Mount: hydrate any in-progress intake draft ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(INTAKE_CACHE_KEY);
        if (!raw) return;
        const cache = JSON.parse(raw) as OnboardingIntake;
        if (cache.stage) setStage(cache.stage);
        if (cache.frictions) setFrictions(new Set(cache.frictions));
        if (cache.operationalMode) setOperationalMode(cache.operationalMode);
        if (cache.targetWeight) setTargetWeight(cache.targetWeight);
        if (cache.height) setHeight(cache.height);
      } catch {}
    })();
  }, []);

  // ── Save on meaningful state change ───────────────────────────────────────
  useEffect(() => {
    const payload: OnboardingIntake = {
      stage, frictions: Array.from(frictions), operationalMode, targetWeight, height,
    };
    AsyncStorage.setItem(INTAKE_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [stage, frictions, operationalMode, targetWeight, height]);

  const stepIdx = STEP_ORDER.indexOf(step);

  const goBack = useCallback(() => {
    if (stepIdx > 0) { setStep(STEP_ORDER[stepIdx - 1]!); return; }
    router.back();
  }, [stepIdx]);

  const toggleFriction = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setFrictions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectMode = useCallback((mode: OperationalMode) => {
    Haptics.selectionAsync().catch(() => {});
    setOperationalMode(mode);
  }, []);

  const advance = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      
      // Guardado explícito y protegido de AsyncStorage antes de avanzar
      const payload: OnboardingIntake = {
        stage: stage || "Volumen",
        frictions: Array.from(frictions || []),
        operationalMode: operationalMode || "SOLO",
        targetWeight: targetWeight || "",
        height: height || "",
      };
      
      try {
        await AsyncStorage.setItem(INTAKE_CACHE_KEY, JSON.stringify(payload));
      } catch (storageError) {
        console.warn("AsyncStorage fallback applied:", storageError);
      }

      if (stepIdx < STEP_ORDER.length - 1) {
        setStep(STEP_ORDER[stepIdx + 1]!);
        return;
      }
      
      setTimeout(() => {
        router.push("/auth/login");
      }, 50);
    } catch (error) {
      console.warn("Error en flujo de Onboarding:", error);
      // Fallback en caso de error crítico
      if (stepIdx >= STEP_ORDER.length - 1) {
        setTimeout(() => {
          router.push("/auth/login");
        }, 50);
      } else {
        setStep(STEP_ORDER[stepIdx + 1]!);
      }
    }
  }, [stepIdx, stage, frictions, operationalMode, targetWeight, height]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      {step !== "WELCOME" && <HeaderRow onBack={goBack} label="Onboarding" />}

      {step === "WELCOME" ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 40, paddingBottom: 24, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: "timing", duration: 350 }}>
              {/* Isotipo MYCOACH — mismo diamante-F usado en Stats/Dieta/Salas */}
              <View style={{ alignItems: "center", marginBottom: 28 }}>
                <View style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
                  <Svg width={56} height={56} viewBox="0 0 62 62" style={StyleSheet.absoluteFill}>
                    <Polygon points="31,3 59,31 31,59 3,31" stroke={VOLT} strokeWidth={3} fill="none" />
                  </Svg>
                  <Text style={{ ...athletic, fontSize: 22, color: VOLT }}>F</Text>
                </View>
                <Text className="font-bold uppercase" style={{ color: "#fff", fontSize: 14, letterSpacing: 4, marginTop: 10 }}>
                  MYCOACH
                </Text>
              </View>

              <Text style={{ ...athletic, fontSize: 34, lineHeight: 36, color: "#fff", textAlign: "center", letterSpacing: -0.5 }}>
                DISCIPLINA{"\n"}Y CONTROL
              </Text>
              <Text className="text-center" style={{ fontSize: 13, color: SILVER, marginTop: 10, lineHeight: 18, paddingHorizontal: 10 }}>
                Elige cómo quieres operar. Puedes cambiarlo después desde tu perfil.
              </Text>

              <View style={{ marginTop: 32, gap: 12 }}>
                <Pressable
                  onPress={() => selectMode("COACH")}
                  style={{
                    borderRadius: 20, padding: 18, backgroundColor: "rgba(28,28,30,0.5)",
                    borderWidth: 1.5, borderColor: operationalMode === "COACH" ? VOLT : "rgba(255,255,255,0.1)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Shield size={22} color={operationalMode === "COACH" ? VOLT : "#fff"} />
                    <View style={{ flex: 1 }}>
                      <Text className="font-black" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.3 }}>
                        [ 🛡️ UNIRME A UN COACH ]
                      </Text>
                      <Text style={{ fontSize: 11, color: SILVER, marginTop: 3, lineHeight: 15 }}>
                        Un coach diseña y ajusta tu plan. Vincularás tu código después de iniciar sesión.
                      </Text>
                    </View>
                    {operationalMode === "COACH" && <Check size={18} color={VOLT} strokeWidth={3} />}
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => selectMode("SOLO")}
                  style={{
                    borderRadius: 20, padding: 18, backgroundColor: "rgba(28,28,30,0.5)",
                    borderWidth: 1.5, borderColor: operationalMode === "SOLO" ? VOLT : "rgba(255,255,255,0.1)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Zap size={22} color={operationalMode === "SOLO" ? VOLT : "#fff"} />
                    <View style={{ flex: 1 }}>
                      <Text className="font-black" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.3 }}>
                        [ ⚡ MODO AUTO-ENTRENADOR (SOLO) ]
                      </Text>
                      <Text style={{ fontSize: 11, color: SILVER, marginTop: 3, lineHeight: 15 }}>
                        Control total: eliges rutinas y dietas del catálogo por tu cuenta, sin coach.
                      </Text>
                    </View>
                    {operationalMode === "SOLO" && <Check size={18} color={VOLT} strokeWidth={3} />}
                  </View>
                </Pressable>
              </View>
            </MotiView>
          </ScrollView>

          <FloorDock onBack={goBack}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!operationalMode}
              onPress={advance}
              style={{
                flex: 1, height: 48, borderRadius: 24, backgroundColor: VOLT, opacity: operationalMode ? 1 : 0.35,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Text style={{ ...athletic, fontSize: 14, color: "#000" }}>Continuar</Text>
              <ArrowRight size={16} color="#000" />
            </TouchableOpacity>
          </FloorDock>
        </>
      ) : step === "BIOMETRICS" ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <MotiView from={{ opacity: 0, translateX: 24 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: "timing", duration: 300 }}>
              <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 2, color: CYAN, textTransform: "uppercase" }}>
                [ TELEMETRIC DATA INTAKE // BIOMETRICS ]
              </Text>
              <Text style={{ ...athletic, fontSize: 26, color: "#fff", marginTop: 10, letterSpacing: -0.5 }}>
                Tus métricas base
              </Text>
              <Text style={{ fontSize: 13, color: SILVER, marginTop: 4, marginBottom: 24 }}>
                Iniciará tu gráfica de progreso en cuanto crees tu cuenta.
              </Text>

              {[
                { label: "PESO OBJETIVO (KG)", value: targetWeight, set: setTargetWeight },
                { label: "ALTURA (CM)",        value: height,       set: setHeight },
              ].map(f => (
                <View key={f.label} style={{ marginBottom: 14 }}>
                  <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginBottom: 6 }}>{f.label}</Text>
                  <TextInput
                    value={f.value}
                    onChangeText={f.set}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#52525b"
                    selectionColor={VOLT}
                    style={{ backgroundColor: "rgba(28,28,30,0.5)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
                  />
                </View>
              ))}
            </MotiView>
          </ScrollView>

          <FloorDock onBack={goBack}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={advance}
              style={{
                flex: 1, height: 48, borderRadius: 24, backgroundColor: VOLT,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Text style={{ ...athletic, fontSize: 14, color: "#000" }}>Continuar</Text>
              <ArrowRight size={16} color="#000" />
            </TouchableOpacity>
          </FloorDock>
        </>
      ) : step === "STAGE" ? (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <MotiView from={{ opacity: 0, translateX: 24 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: "timing", duration: 300 }}>
              <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 2, color: CYAN, textTransform: "uppercase" }}>
                [ TELEMETRIC DATA INTAKE // STAGE BINDING ]
              </Text>
              <Text style={{ ...athletic, fontSize: 26, color: "#fff", marginTop: 10, letterSpacing: -0.5 }}>
                ¿Cuál es tu objetivo?
              </Text>
              <Text style={{ fontSize: 13, color: SILVER, marginTop: 4, marginBottom: 24 }}>
                Personalizaremos tu plan de entrenamiento.
              </Text>

              {STAGE_OPTIONS.map(opt => {
                const selected = stage === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setStage(opt.id); }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 14,
                      backgroundColor: "rgba(28,28,30,0.45)", borderRadius: 16, padding: 16, marginBottom: 12,
                      borderWidth: selected ? 1.5 : 1,
                      borderColor: selected ? CYAN : "rgba(255,255,255,0.06)",
                    }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text className="font-black" style={{ fontSize: 15, color: "#fff", letterSpacing: 0.3 }}>{opt.title}</Text>
                      <Text style={{ fontSize: 12, color: SILVER, marginTop: 2, lineHeight: 16 }}>{opt.desc}</Text>
                    </View>
                    {selected && (
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: CYAN, alignItems: "center", justifyContent: "center" }}>
                        <Check size={14} color="#000" strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </MotiView>
          </ScrollView>

          <FloorDock onBack={goBack}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={advance}
              style={{
                flex: 1, height: 48, borderRadius: 24, backgroundColor: VOLT,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Text style={{ ...athletic, fontSize: 14, color: "#000" }}>Continuar</Text>
              <ArrowRight size={16} color="#000" />
            </TouchableOpacity>
          </FloorDock>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <MotiView from={{ opacity: 0, translateX: 24 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: "timing", duration: 300 }}>
              <Text style={{ ...athletic, fontSize: 24, color: "#fff", letterSpacing: -0.5 }}>
                ¿Qué te impide alcanzar tus metas?
              </Text>
              <Text style={{ fontSize: 13, color: SILVER, marginTop: 4, marginBottom: 20 }}>
                Selecciona todos los que apliquen
              </Text>

              {FRICTION_OPTIONS.map(opt => {
                const selected = frictions.has(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => toggleFriction(opt.id)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 14,
                      backgroundColor: "rgba(28,28,30,0.45)", borderRadius: 16, padding: 15, marginBottom: 10,
                      borderWidth: 1, borderColor: selected ? "rgba(204,255,0,0.3)" : "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Text style={{ fontSize: 19 }}>{opt.emoji}</Text>
                    <Text className="font-bold" style={{ flex: 1, fontSize: 14, color: "#fff" }}>{opt.label}</Text>
                    <View
                      style={{
                        width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
                        backgroundColor: selected ? VOLT : "transparent",
                        borderWidth: 1.5, borderColor: selected ? VOLT : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {selected && <Check size={12} color="#000" strokeWidth={3} />}
                    </View>
                  </Pressable>
                );
              })}

              {/* Decorative panoramic reference frame */}
              <ImageBackground
                source={{ uri: LIFESTYLE_IMG }}
                resizeMode="cover"
                imageStyle={{ opacity: 0.75 }}
                style={{ height: 180, borderRadius: 24, overflow: "hidden", marginTop: 12, backgroundColor: "#101012", justifyContent: "flex-end" }}
              >
                <View style={StyleSheet.absoluteFill} />
              </ImageBackground>
            </MotiView>
          </ScrollView>

          <FloorDock onBack={goBack}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={advance}
              style={{
                flex: 1, height: 48, borderRadius: 24, backgroundColor: VOLT,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Text style={{ ...athletic, fontSize: 14, color: "#000" }}>Continuar</Text>
              <ArrowRight size={16} color="#000" />
            </TouchableOpacity>
          </FloorDock>
        </>
      )}
    </SafeAreaView>
  );
}
