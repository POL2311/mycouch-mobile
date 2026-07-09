import {
  View, Text, TouchableOpacity, Pressable, ScrollView, ImageBackground, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MotiView } from "moti";
import { useState, useCallback, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { ChevronLeft, Check, ArrowRight } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8e8e93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

type WizardStep = "STAGE" | "LIFESTYLE";

// Device-local draft of the intake answers — there's no self-signup endpoint
// to submit this to (see below), so it's cached the same way lib/workout.tsx
// caches an in-progress session, ready for a future signup step to read.
const INTAKE_CACHE_KEY = "mc:onboarding_intake";
interface OnboardingIntake {
  stage: string;
  frictions: string[];
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

// ── SCREENS 2 & 3 · state-driven onboarding wizard ───────────────────────────
// Only these two steps are pixel-specified. There's no public self-signup
// endpoint anywhere in this app's API surface (accounts are provisioned by
// coaches) — the old gateway's body-metrics/activity-frequency steps were
// pure local BMI/TDEE display theater, never submitted anywhere, so they're
// not carried forward here. Both forward actions on step 2 terminate the
// funnel at /auth/login, the app's one real authenticated entry point.
export default function OnboardingWizard() {
  const [step, setStep] = useState<WizardStep>("STAGE");
  const [stage, setStage] = useState<string>("Volumen");   // Volumen selected by default
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
      } catch {}
    })();
  }, []);

  // ── Save on meaningful state change ───────────────────────────────────────
  useEffect(() => {
    const payload: OnboardingIntake = { stage, frictions: Array.from(frictions) };
    AsyncStorage.setItem(INTAKE_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [stage, frictions]);

  const goBack = useCallback(() => {
    if (step === "LIFESTYLE") { setStep("STAGE"); return; }
    router.back();
  }, [step]);

  const toggleFriction = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setFrictions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const advance = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === "STAGE") { setStep("LIFESTYLE"); return; }
    router.push("/auth/login");
  }, [step]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <HeaderRow onBack={goBack} label="Onboarding" />

      {step === "STAGE" ? (
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
