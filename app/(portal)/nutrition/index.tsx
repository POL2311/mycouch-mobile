import {
  View, Text, ScrollView, Pressable, TouchableOpacity, ActivityIndicator, Modal,
  ImageBackground, StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { MotiView, AnimatePresence } from "moti";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Droplet, Check, ArrowLeftRight, Utensils, Plus } from "lucide-react-native";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
  interpolate, Extrapolation,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Stop, Rect, Polygon } from "react-native-svg";
import { usePortal, resolveDietDay, isSelfCoached } from "@/lib/portal";
import { useSelfCoach } from "@/lib/selfCoach";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";
import { ShimmerScreen } from "@/components/ShimmerLoader";
import { tacticalSubHeader } from "@/lib/typography";
import { TemplatePickerModal } from "@/components/portal/TemplatePickerModal";
import type { Meal } from "@/lib/portal";

// ── SF Dark Pro / Volt token registry (MYCOACH_GLOBAL_MASTER_SPEC §3.1) ──────
const VOLT       = "#CCFF00";
const VOLT_DIM   = "#a3e635";
const ON_VOLT    = "#000000";
const ICE        = "#F2FFF7";

const C_PROTEIN  = "#34d399";
const C_CARBS    = "#60a5fa";
const T_PRIMARY  = "#ffffff";
const T_TERTIARY = "#8e8e93";

// ── Calendar engine (spec §4.1.2 — device-local, app days 1=Lunes…7=Domingo) ─
const WEEKDAY_PILLS = ["L", "M", "MI", "J", "V", "S", "D"] as const;
const WEEKDAY_LONG: Record<number, string> = {
  1: "LUNES", 2: "MARTES", 3: "MIÉRCOLES", 4: "JUEVES",
  5: "VIERNES", 6: "SÁBADO", 7: "DOMINGO",
};

function initialsOf(name: string | undefined): string {
  if (!name) return "23";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function appToday(): number {
  const js = new Date().getDay();          // 0=Sunday … 6=Saturday
  return js === 0 ? 7 : js;                // → 1=Lunes … 7=Domingo
}

// Real calendar date of app-day N within the current week (device-local) —
// browsing tomorrow writes tomorrow's date, exactly like the web engine.
function realDateForDayIndex(dayIdx: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (dayIdx - appToday()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DailyCheck {
  kind:    string;
  itemKey: string;
}

interface FoodSubstitute {
  id:              string;
  category:        string;
  originalFood:    string;
  substituteFood:  string;
  ratio:           number;
}

interface Notice {
  id:         string;
  senderName: string;
  role:       string;
  content:    string;
  createdAt:  string;
}

// ── Hydration engine constants (spec §4.3.6 / overhaul spec §3) ──────────────
const WATER_TARGET_ML = 3000;
const WATER_DOSE_ML   = 250;
const WATER_DOSES     = WATER_TARGET_ML / WATER_DOSE_ML; // 12 indicator circles

// ── Cinematic meal-card image templates (overhaul spec §5) ───────────────────
// Placeholder stock art keyed by meal name until the API emits meal.imageUrl —
// swap for brand-owned photography before release. A failed load degrades to
// the dark surface with the same overlay, so contrast never breaks.
const MEAL_IMAGE_TEMPLATES: { match: RegExp; uri: string }[] = [
  { match: /desayuno|break/i,          uri: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=70" },
  { match: /snack|colaci|merienda/i,   uri: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=1080&q=70" },
  { match: /comida|almuerzo|lunch/i,   uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1080&q=70" },
  { match: /cena|dinner/i,             uri: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=1080&q=70" },
];
const MEAL_IMAGE_DEFAULT = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1080&q=70";

function mealImageFor(meal: Meal): string {
  if (meal.imageUrl) return meal.imageUrl;
  return MEAL_IMAGE_TEMPLATES.find(t => t.match.test(meal.name))?.uri ?? MEAL_IMAGE_DEFAULT;
}

// ═════════════════════════════════════════════════════════════════════════════
//  MACRO CONVERSION ENGINE (master spec §4.3.4 — exact web math)
// ═════════════════════════════════════════════════════════════════════════════

type MacroClass = "protein" | "carb";

const PROTEIN_KEYS = [
  "pollo", "pechuga", "atún", "atun", "huevo", "clara", "res", "carne", "pavo",
  "salmón", "salmon", "pescado", "whey", "proteína", "proteina", "yogur",
  "queso", "tofu", "camarón", "camaron",
];
const CARB_KEYS = [
  "arroz", "avena", "pan", "pasta", "papa", "camote", "tortilla", "plátano",
  "platano", "manzana", "fruta", "quinoa", "cereal", "galleta", "bagel",
];

interface ResolvedIngredient {
  key:      string;
  name:     string;
  grams:    number;
  calories: number;
  macros:   { protein: number; carbs: number; fat: number };
}

// Per-100g nutrition bank for delta math — the web ships this inline alongside
// the FoodSubstitute ratio rows (spec §4.3.4 "richer inline catalog").
const NUTRITION_PER_100G: { match: RegExp; kcal: number; fat: number }[] = [
  { match: /arroz integral/i,      kcal: 111, fat: 0.9  },
  { match: /arroz/i,               kcal: 130, fat: 0.3  },
  { match: /avena/i,               kcal: 389, fat: 6.9  },
  { match: /camote|batata/i,       kcal: 86,  fat: 0.1  },
  { match: /papa|patata/i,         kcal: 77,  fat: 0.1  },
  { match: /pasta/i,               kcal: 131, fat: 1.1  },
  { match: /pan integral/i,        kcal: 247, fat: 3.4  },
  { match: /pan/i,                 kcal: 265, fat: 3.2  },
  { match: /tortilla/i,            kcal: 218, fat: 2.9  },
  { match: /quinoa/i,              kcal: 120, fat: 1.9  },
  { match: /plátano|platano/i,     kcal: 89,  fat: 0.3  },
  { match: /pollo|pechuga/i,       kcal: 165, fat: 3.6  },
  { match: /pavo/i,                kcal: 135, fat: 1.0  },
  { match: /res|carne magra/i,     kcal: 187, fat: 10   },
  { match: /atún|atun/i,           kcal: 116, fat: 1.0  },
  { match: /salmón|salmon/i,       kcal: 208, fat: 13   },
  { match: /huevo/i,               kcal: 155, fat: 11   },
  { match: /clara/i,               kcal: 52,  fat: 0.2  },
  { match: /whey|proteína en polvo|proteina en polvo/i, kcal: 400, fat: 7 },
  { match: /tofu/i,                kcal: 76,  fat: 4.8  },
  { match: /pescado blanco|tilapia|merluza/i, kcal: 105, fat: 2.3 },
  { match: /queso cottage|cottage/i, kcal: 98, fat: 4.3 },
  { match: /yogur/i,               kcal: 59,  fat: 0.4  },
];
const PER_100G_FALLBACK: Record<MacroClass, { kcal: number; fat: number }> = {
  carb:    { kcal: 120, fat: 0.5 },
  protein: { kcal: 150, fat: 5   },
};

// lib/api.ts's api<T>() is a bare `res.json() as Promise<T>` — a type
// assertion, not runtime validation. TypeScript's `number` types on Meal/
// MealIngredient are therefore a hope, not a guarantee: a malformed backend
// record (null calories, a non-numeric macro) reaches this arithmetic as-is
// and silently poisons every downstream sum with NaN. num() is the one
// coercion point all raw external numeric fields pass through below.
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function per100gFor(foodName: string, cls: MacroClass): { kcal: number; fat: number } {
  return NUTRITION_PER_100G.find(n => n.match.test(foodName)) ?? PER_100G_FALLBACK[cls];
}

// Macro-class inference: keyword lists first, then protein ≥ carbs comparison.
function inferMacroClass(ing: ResolvedIngredient): MacroClass {
  const n = ing.name.toLowerCase();
  if (PROTEIN_KEYS.some(k => n.includes(k))) return "protein";
  if (CARB_KEYS.some(k => n.includes(k)))    return "carb";
  return ing.macros.protein >= ing.macros.carbs ? "protein" : "carb";
}

// Calorie-based macro estimation when an ingredient lacks explicit macros
// (spec §4.3.4): protein ≈ cal×0.25/4 · carbs ≈ cal×0.475/4 · fat ≈ cal×0.30/9.
function estimateMacros(calories: number) {
  const cal = num(calories);
  return {
    protein: Math.round((cal * 0.25)  / 4),
    carbs:   Math.round((cal * 0.475) / 4),
    fat:     Math.round((cal * 0.30)  / 9),
  };
}

// Resolve a meal into ingredient rows. Newer plans carry `ingredients[]` from
// dietJson; legacy plans only have `items: string[]`, which we synthesize into
// rows (grams parsed from the text when present, calories split evenly).
function resolveIngredients(meal: Meal): ResolvedIngredient[] {
  const mealCalories = num(meal.calories);
  if (meal.ingredients?.length) {
    const evenCal = Math.round(mealCalories / meal.ingredients.length);
    return meal.ingredients.map((ing, i) => {
      const calories = num(ing.calories, evenCal);
      const macros   = ing.macros ?? estimateMacros(calories);
      return {
        key:      `${i}-${ing.name}`,
        name:     ing.name,
        grams:    num(ing.grams, 100),
        calories,
        macros: {
          protein: num(macros.protein),
          carbs:   num(macros.carbs),
          fat:     num(macros.fat),
        },
      };
    });
  }
  const n = Math.max(meal.items.length, 1);
  const evenCal = Math.round(mealCalories / n);
  return meal.items.map((item, i) => {
    const gramsMatch = item.match(/(\d+)\s*g\b/i);
    return {
      key:      `${i}-${item}`,
      name:     item,
      grams:    gramsMatch ? Number(gramsMatch[1]) : 100,
      calories: evenCal,
      macros:   estimateMacros(evenCal),
    };
  });
}

interface AppliedSwap {
  substituteFood: string;
  newGrams:       number;
  kcalDelta:      number;
  fatDelta:       number;
}

interface SwapCandidate {
  id:             string;
  substituteFood: string;
  newGrams:       number;
  kcalDelta:      number;
  fatDelta:       number;
}

// The exact §4.3.4 math: preserve the dominant macro through the ratio bank.
function computeCandidates(
  ing: ResolvedIngredient,
  cls: MacroClass,
  substitutes: FoodSubstitute[],
): SwapCandidate[] {
  const lockedValue = num(cls === "protein" ? ing.macros.protein : ing.macros.carbs);
  const category    = cls === "protein" ? "Proteínas" : "Carbohidratos";
  return substitutes
    .filter(s => s.category === category)
    .map(s => {
      const newGrams = Math.round(lockedValue * num(s.ratio, 1));
      const per100   = per100gFor(s.substituteFood, cls);
      return {
        id:             s.id,
        substituteFood: s.substituteFood,
        newGrams,
        kcalDelta:      Math.round((newGrams * per100.kcal) / 100) - num(ing.calories),
        fatDelta:       Math.round(((newGrams * per100.fat) / 100 - num(ing.macros.fat)) * 10) / 10,
      };
    });
}

// Flat food illustration tiles — emoji stand-ins for the web's 20 hand-drawn
// SVG illustrations, rendered 28px inside 48px tiles (spec §3.2.7).
const FOOD_ICONS: { match: RegExp; icon: string }[] = [
  { match: /pollo|pechuga|pavo/i,               icon: "🍗" },
  { match: /res|carne/i,                        icon: "🥩" },
  { match: /huevo|clara/i,                      icon: "🥚" },
  { match: /pan|tortilla|bagel|galleta/i,       icon: "🍞" },
  { match: /arroz|quinoa/i,                     icon: "🍚" },
  { match: /avena|cereal/i,                     icon: "🥣" },
  { match: /camote|papa|batata/i,               icon: "🍠" },
  { match: /pescado|atún|atun|salmón|salmon/i,  icon: "🐟" },
  { match: /yogur|leche|queso|whey|proteína|proteina/i, icon: "🥛" },
  { match: /manzana|plátano|platano|fruta/i,    icon: "🍎" },
  { match: /ensalada|brócoli|brocoli|verdura|espinaca/i, icon: "🥦" },
  { match: /almendra|nuez|cacahuate|aceite/i,   icon: "🥜" },
];
function foodIconFor(name: string): string {
  return FOOD_ICONS.find(f => f.match.test(name))?.icon ?? "🍽️";
}

// ═════════════════════════════════════════════════════════════════════════════
//  VISUAL MODULES
// ═════════════════════════════════════════════════════════════════════════════

// ── Brand row — clonado 1:1 de la arquitectura de app/(portal)/stats/index.tsx
// (Módulo 3 "unificación de navegación"): isotype diamante "F" + wordmark
// MYCOACH a la izquierda, badge de perfil circular anillado en volt a la
// derecha. Dieta no tenía ningún header de marca — esta pantalla arrancaba
// directo en el StreakCard. El número del badge usa el streak real del
// alumno (usePortal) en vez del placeholder estático "23" que trae stats. ──
function BrandHeader({ initials, streak }: { initials: string; streak: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, height: 48 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Svg width={40} height={40} viewBox="0 0 62 62" style={StyleSheet.absoluteFill}>
            <Polygon points="31,3 59,31 31,59 3,31" stroke={VOLT} strokeWidth={3} fill="none" />
          </Svg>
          <Text style={{ fontWeight: "900", fontStyle: "italic", fontSize: 16, color: VOLT }}>F</Text>
        </View>
        <Text className="font-bold uppercase" style={{ color: "#fff", fontSize: 14, letterSpacing: 3 }}>
          MYCOACH
        </Text>
      </View>
      <View
        style={{
          position: "absolute", right: 0,
          width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: VOLT,
          justifyContent: "center", alignItems: "center", backgroundColor: "#1C1C1E",
        }}
      >
        <Text className="font-black" style={{ fontSize: 13, color: "#fff" }}>{streak > 0 ? streak : initials}</Text>
      </View>
    </View>
  );
}

// ── Cyber Command Banner — SYSTEM_ENFORCED_DIRECTIVE (overhaul spec §1) ──────
function DirectiveBanner({ text }: { text: string }) {
  return (
    <View
      className="p-5 mb-4"
      style={{
        backgroundColor: "#0a0a0b",
        borderWidth: 2,
        borderColor: VOLT,
        borderRadius: 4,
        overflow: "hidden",
        shadowColor: VOLT,
        shadowOpacity: 0.05,
        shadowRadius: 25,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
      }}
    >
      {/* Corner brackets */}
      <View style={{ position: "absolute", top: 0, right: 0, width: 10, height: 10, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: "rgba(204,255,0,0.25)" }} />
      <View style={{ position: "absolute", bottom: 0, left: 0, width: 10, height: 10, borderRightWidth: 1, borderTopWidth: 1, borderColor: "rgba(204,255,0,0.25)" }} />

      <View className="flex-row items-center mb-1.5" style={{ gap: 6 }}>
        {/* Live-status pulse */}
        <MotiView
          from={{ opacity: 0.25, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 800, loop: true, repeatReverse: true }}
        >
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: VOLT }} />
        </MotiView>
        <Text style={tacticalSubHeader}>
          SYSTEM_ENFORCED_DIRECTIVE
        </Text>
      </View>
      <Text
        className="font-black uppercase"
        style={{
          fontSize: 16,
          fontStyle: "italic",
          color: T_PRIMARY,
          lineHeight: 22,
          textShadowColor: "rgba(255,255,255,0.15)",
          textShadowRadius: 8,
          textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ── Glass slab — real backdrop blur + carbon tint + volt spine ───────────────
// Shadow lives on the outer wrapper (overflow:hidden would clip it); the blur
// capsule clips itself. `dimezisBlurView` enables true blur on Android.
function GlassSlab({ children, delay = 0, style, glow = false }: {
  children: React.ReactNode; delay?: number; style?: object; glow?: boolean;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 380, delay }}
      style={{
        borderRadius: 24,
        marginBottom: 24,
        shadowColor: VOLT,
        // Elemento crítico activo (Módulo 3, racha actual) — resplandor LED
        // pleno (lib/neon.ts's neonGlow) en vez del halo apenas perceptible
        // que llevan el resto de los bentos.
        shadowOpacity: glow ? 0.4 : 0.06,
        shadowRadius:  glow ? 12  : 20,
        shadowOffset: { width: 0, height: 0 },
        elevation: glow ? 8 : 0,
      }}
    >
      <BlurView
        intensity={30}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: "rgba(18,18,20,0.65)",
          borderWidth: 1,
          borderColor: glow ? VOLT : "rgba(255,255,255,0.05)",
          borderLeftWidth: 3,
          borderLeftColor: VOLT,
          ...style,
        }}
      >
        {children}
      </BlurView>
    </MotiView>
  );
}

// ── Streak card — racha block (master spec §3.2.4) — the layout crown ────────
function StreakCard({ dayLabel, streak, activeDate, perfectDay }: {
  dayLabel: string; streak: number; activeDate: string; perfectDay?: boolean;
}) {
  return (
    <GlassSlab glow style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 }}>
      <View
        className="items-center justify-center"
        style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: "rgba(204,255,0,0.08)" }}
      >
        <Text style={{ fontSize: 20 }}>🍽️</Text>
      </View>
      <View className="flex-1">
        <Text
          className="font-black uppercase"
          style={{ fontSize: 20, fontStyle: "italic", color: VOLT, letterSpacing: -0.3, lineHeight: 22 }}
          numberOfLines={1}
        >
          {dayLabel} · {streak} {streak === 1 ? "DÍA" : "DÍAS"} DE RACHA
        </Text>
        <Text className="uppercase mt-0.5" style={{ fontSize: 9, letterSpacing: 2.8, color: "#8e8e93" }}>
          RACHA ACTIVA · {activeDate}
        </Text>
      </View>
      {perfectDay && (
        <View
          className="px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: VOLT,
            shadowColor: VOLT, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Text className="font-black uppercase" style={{ fontSize: 8, letterSpacing: 0.8, color: ON_VOLT }}>
            DÍA PERFECTO
          </Text>
        </View>
      )}
    </GlassSlab>
  );
}

// ── Hydration Engine — HIDRATACIÓN row (overhaul spec §3) ────────────────────
function HydrationRow({ totalMl, syncing, onAdd }: {
  totalMl: number; syncing: boolean; onAdd: () => void;
}) {
  const filled       = Math.floor(Math.min(totalMl, WATER_TARGET_ML) / WATER_DOSE_ML);
  const limitReached = totalMl >= WATER_TARGET_ML;

  return (
    <GlassSlab delay={60} style={{ padding: 16 }}>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          {/* Explicit cyan — never inherits, so it can't vanish black-on-black */}
          <Droplet size={15} color={VOLT} strokeWidth={2.5} />
          <Text className="uppercase" style={{ fontSize: 10, letterSpacing: 1.2, color: T_TERTIARY }}>
            HIDRATACIÓN
          </Text>
        </View>
        <Text className="font-black" style={{ fontSize: 13, color: T_PRIMARY }}>
          {totalMl.toLocaleString()} / {WATER_TARGET_ML.toLocaleString()} ML
        </Text>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row flex-1 flex-wrap" style={{ gap: 6 }}>
          {Array.from({ length: WATER_DOSES }, (_, i) => {
            const isFilled = i < filled;
            return (
              // Keyed on fill state: a newly-lit circle remounts and springs
              // from 0.4 → 1 (the "bubble" pop); emptying springs the same way.
              <MotiView
                key={`${i}-${isFilled ? "on" : "off"}`}
                from={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 220 }}
                style={{
                  width: 16, height: 16, borderRadius: 8,
                  ...(isFilled
                    ? {
                        backgroundColor: VOLT,
                        shadowColor: VOLT, shadowOpacity: 0.5, shadowRadius: 6,
                        shadowOffset: { width: 0, height: 0 },
                      }
                    : { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)" }),
                }}
              />
            );
          })}
        </View>

        <Pressable
          onPress={onAdd}
          disabled={syncing || limitReached}
          className="rounded-full items-center justify-center ml-3"
          style={({ pressed }) => ({
            // Frozen state: opaque desaturated glass instead of volt
            backgroundColor: limitReached
              ? "rgba(255, 255, 255, 0.06)"
              : pressed ? "#a3e635" : VOLT,
            borderWidth: limitReached ? 1 : 0,
            borderColor: "rgba(255,255,255,0.10)",
            paddingHorizontal: 14,
            paddingVertical: 8,
            opacity: syncing ? 0.5 : 1,
            minWidth: 76,
          })}
        >
          {syncing
            ? <ActivityIndicator size="small" color="#000" />
            : (
              <View className="flex-row items-center" style={{ gap: 5 }}>
                <Droplet size={12} color={limitReached ? "#8e8e93" : VOLT} strokeWidth={2.5} />
                <Text
                  className="font-black uppercase"
                  style={{ fontSize: 11, letterSpacing: 0.8, color: limitReached ? "#8e8e93" : "#000" }}
                >
                  {limitReached ? "LÍMITE ALCANZADO" : "+ 250ML"}
                </Text>
              </View>
            )
          }
        </Pressable>
      </View>
    </GlassSlab>
  );
}

// ── Weekday pill strip — "L M MI J V S D" (spec §3.2.2) ──────────────────────
function WeekdayStrip({ activeDay, onSelect }: {
  activeDay: number;
  onSelect: (day: number) => void;
}) {
  return (
    <View
      className="flex-row items-center justify-between w-full mb-5"
      style={{
        gap: 6,
        backgroundColor: "rgba(24,24,27,0.4)",
        padding: 6,
        borderWidth: 1,
        borderColor: "rgba(39,39,42,0.8)",
        borderRadius: 12,
      }}
    >
      {WEEKDAY_PILLS.map((label, i) => {
        const dayNum   = i + 1;
        const isActive = activeDay === dayNum;
        return (
          <Pressable
            key={label}
            onPress={() => onSelect(dayNum)}
            className="flex-1 py-2 items-center"
            style={{
              borderWidth: 1,
              borderRadius: 8,
              borderColor: isActive ? VOLT : "transparent",
              backgroundColor: isActive ? "rgba(204,255,0,0.1)" : "transparent",
              ...(isActive ? {
                shadowColor: VOLT,
                shadowOpacity: 0.15,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 0 },
              } : null),
            }}
          >
            {/* Remount on activation → spring pop on the newly selected pill */}
            <MotiView
              key={isActive ? "on" : "off"}
              from={{ scale: isActive ? 0.8 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 12, stiffness: 260 }}
            >
              <Text
                className="text-xs uppercase"
                style={{
                  fontWeight: isActive ? "900" : "700",
                  color: isActive ? VOLT : "#71717a",
                  letterSpacing: 0.5,
                }}
              >
                {label}
              </Text>
            </MotiView>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Slim kcal tracking bar — remaining label + cyan→lime gradient (§3.2.3) ───
function KcalBar({ consumed, target }: { consumed: number; target: number }) {
  // 2% minimum so the bar is never invisible, matching web.
  const pct       = Math.max(Math.min(consumed / Math.max(target, 1), 1) * 100, 2);
  const remaining = Math.max(target - consumed, 0);

  return (
    <View className="mb-1">
      <View className="flex-row justify-between mb-1.5">
        <Text className="font-black uppercase" style={{ fontSize: 10, letterSpacing: 1.2, color: "#808080" }}>
          {remaining.toLocaleString()} KCAL RESTANTES
        </Text>
        <Text className="font-black uppercase" style={{ fontSize: 10, letterSpacing: 1.2, color: "#808080" }}>
          {target.toLocaleString()} KCAL OBJETIVO
        </Text>
      </View>
      <View
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
      >
        {/* Liquid fluid fill — same neon tube treatment as the reactor */}
        <MotiView
          animate={{ width: `${pct}%` as unknown as number }}
          transition={{ type: "timing", duration: 500 }}
          style={{
            height: "100%",
            borderRadius: 999,
            overflow: "hidden",
            shadowColor: VOLT,
            shadowOpacity: 0.7,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 0 },
            elevation: 6,
          }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="kcalGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={ICE} />
                <Stop offset="1" stopColor={VOLT} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#kcalGrad)" />
          </Svg>
        </MotiView>
      </View>
    </View>
  );
}

// ── Macro/kcal pill badge — true glassmorphism (spec §3.2.6 hero pills) ──────
// Real backdrop blur: over the meal photos the image bleeds through frosted,
// which is where the glass effect actually earns its keep.
function MacroPill({ label, value, labelColor = "#808080" }: {
  label: string; value: string; labelColor?: string;
}) {
  return (
    <BlurView
      intensity={25}
      tint="dark"
      experimentalBlurMethod="dimezisBlurView"
      style={{
        borderRadius: 16,
        overflow: "hidden",
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: "rgba(20,20,20,0.55)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.06)",
      }}
    >
      <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: labelColor }}>
        {label}
      </Text>
      <Text className="font-black" style={{ fontSize: 15, color: T_PRIMARY }}>
        {value}
      </Text>
    </BlurView>
  );
}

// ── Cinema meal card — image + vertical dark gradient mask (spec §3.2.6) ─────
// Mask stops (to top): rgba(0,0,0,0.95) 0% → 0.55 45% → 0.1 100%.
function MealCardShade() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="mealShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"    stopColor="#000" stopOpacity="0.10" />
          <Stop offset="0.55" stopColor="#000" stopOpacity="0.55" />
          <Stop offset="1"    stopColor="#000" stopOpacity="0.95" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#mealShade)" />
    </Svg>
  );
}

// ── Sheet hero mask — §3.2.6 detail-hero scrim over the 0.48-opacity image ───
// rgba(7,7,8,0) 0% → rgba(7,7,8,0.85) 85% → #070708 100%.
function HeroShade() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"    stopColor="#070708" stopOpacity="0" />
          <Stop offset="0.85" stopColor="#070708" stopOpacity="0.85" />
          <Stop offset="1"    stopColor="#070708" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#heroShade)" />
    </Svg>
  );
}

function CheckCircle({ checked, syncing, onToggle }: {
  checked: boolean; syncing: boolean; onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={syncing}
      hitSlop={10}
      className="w-8 h-8 rounded-full items-center justify-center"
      style={{
        borderWidth:     1.5,
        borderColor:     checked ? "rgba(204,255,0,0.7)" : "rgba(255,255,255,0.25)",
        backgroundColor: checked ? "rgba(204,255,0,0.15)" : "rgba(0,0,0,0.35)",
        opacity:         syncing ? 0.5 : 1,
        ...(checked ? {
          shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
        } : null),
      }}
    >
      {syncing
        ? <ActivityIndicator size="small" color={VOLT} />
        : checked && <Check size={18} color={VOLT} strokeWidth={3} />
      }
    </Pressable>
  );
}

function MealCard({ meal, checked, syncing, index, onToggle, onOpen }: {
  meal: Meal; checked: boolean; syncing: boolean; index: number;
  onToggle: () => void; onOpen: () => void;
}) {
  const macros = meal.macros;

  return (
    // Completed cards stay at full opacity — the reward is the neon perimeter,
    // never a dimmed/struck-out image.
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 350, delay: index * 70 }}
      style={{
        borderWidth: 1,
        borderColor: checked ? "rgba(204,255,0,0.45)" : "rgba(255,255,255,0.05)",
        borderRadius: 24,
        marginBottom: 12,
        overflow: "hidden",
        backgroundColor: "#1E1E1E",
        ...(checked ? {
          shadowColor: VOLT,
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
          elevation: 10,
        } : null),
      }}
    >
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
      >
        <ImageBackground
          source={{ uri: mealImageFor(meal) }}
          resizeMode="cover"
          imageStyle={{ opacity: 0.85 }}
          style={{ minHeight: 172 }}
        >
          <MealCardShade />
          <View className="p-4 flex-1 justify-between">
            {/* Top row: time + check control */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center" style={{ gap: 4 }}>
                {checked && <Check size={11} color={VOLT} strokeWidth={3.5} />}
                <Text
                  className="font-black uppercase"
                  style={{ fontSize: 9, letterSpacing: 2, color: VOLT }}
                >
                  {checked ? "COMPLETO" : meal.time}
                </Text>
              </View>
              <CheckCircle checked={checked} syncing={syncing} onToggle={onToggle} />
            </View>

            {/* Bottom: title + macro pills */}
            <View>
              <Text
                className="font-black text-[26px] uppercase"
                style={{
                  color: T_PRIMARY,
                  fontStyle: "italic",
                  letterSpacing: -0.5,
                  lineHeight: 27,
                }}
                numberOfLines={2}
              >
                {meal.name}
              </Text>
              <View className="flex-row gap-2 mt-3">
                <MacroPill label="KCAL"  value={`${meal.calories}`} />
                <MacroPill label="PROT"  value={`${macros.protein}g P`} labelColor={VOLT} />
                <MacroPill label="CARBS" value={`${macros.carbs}g C`} />
                <MacroPill label="GRASA" value={`${macros.fat}g G`} />
              </View>
            </View>
          </View>
        </ImageBackground>
      </Pressable>
    </MotiView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  MEAL DETAIL SHEET — ONE modal hosting two views (ingredients ⇄ substitution)
//  A single <Modal> avoids the iOS stacked-modal touch lock entirely; the swap
//  view replaces the sheet's content instead of presenting a second modal.
// ═════════════════════════════════════════════════════════════════════════════

// ── Ingredient row (spec §3.2.7 IngredientRow) ───────────────────────────────
function IngredientRow({ ing, swap, onSwapPress }: {
  ing: ResolvedIngredient;
  swap: AppliedSwap | undefined;
  onSwapPress: () => void;
}) {
  const displayName  = swap ? swap.substituteFood : ing.name;
  const displayGrams = swap ? swap.newGrams : ing.grams;
  const displayKcal  = swap ? ing.calories + swap.kcalDelta : ing.calories;

  return (
    <View
      className="flex-row items-center px-4 gap-3"
      style={{
        paddingVertical: 14,
        ...(swap ? {
          backgroundColor: "rgba(96,165,250,0.04)",
          borderLeftWidth: 2,
          borderLeftColor: "rgba(96,165,250,0.3)",
        } : null),
      }}
    >
      {/* Illustration tile */}
      <View
        className="items-center justify-center"
        style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)" }}
      >
        <Text style={{ fontSize: 28 }}>{foodIconFor(displayName)}</Text>
      </View>

      {/* Name + macro subtext stack */}
      <View className="flex-1">
        <Text style={{ fontSize: 15, fontWeight: "500", color: T_PRIMARY }} numberOfLines={2}>
          {displayName}
        </Text>
        <Text className="font-bold mt-0.5" style={{ fontSize: 11, letterSpacing: 1, color: "#e5e5ea" }}>
          P {ing.macros.protein}g · C {ing.macros.carbs}g · G {ing.macros.fat}g
        </Text>
        {swap && (
          <View className="flex-row items-center mt-0.5" style={{ gap: 4 }}>
            <ArrowLeftRight size={10} color={C_CARBS} strokeWidth={2.5} />
            <Text style={{ fontSize: 10, color: C_CARBS }}>
              sustituido{swap.kcalDelta !== 0 ? ` · ${swap.kcalDelta > 0 ? "+" : ""}${swap.kcalDelta} kcal` : ""}
            </Text>
          </View>
        )}
      </View>

      {/* Weight + kcal stack */}
      <View className="items-end">
        <Text className="font-black" style={{ fontSize: 17, color: T_PRIMARY }}>
          {displayGrams}g
        </Text>
        <Text style={{ fontSize: 10, color: T_TERTIARY }}>{displayKcal} kcal</Text>
      </View>

      {/* Exchange button */}
      <Pressable
        onPress={onSwapPress}
        hitSlop={8}
        className="items-center justify-center"
        style={{
          width: 28, height: 28, borderRadius: 12,
          backgroundColor: swap ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: swap ? "rgba(96,165,250,0.4)" : "rgba(255, 255, 255, 0.06)",
        }}
      >
        <ArrowLeftRight size={13} color={C_CARBS} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

interface SubsBank {
  items:   FoodSubstitute[];
  loading: boolean;
  error:   boolean;
  retry:   () => void;
}

function MealDetailSheet({
  meal, checked, confirming, swaps, subsBank,
  swapTarget, onSwapTarget, onClose, onConfirm, onApplySwap, onClearSwap,
}: {
  meal: Meal | null;
  checked: boolean;
  confirming: boolean;
  swaps: Record<string, AppliedSwap>;
  subsBank: SubsBank;
  swapTarget: ResolvedIngredient | null;
  onSwapTarget: (ing: ResolvedIngredient | null) => void;
  onClose: () => void;
  onConfirm: () => void;
  onApplySwap: (ing: ResolvedIngredient, swap: AppliedSwap) => void;
  onClearSwap: (ing: ResolvedIngredient) => void;
}) {
  const insets = useSafeAreaInsets();
  const ingredients = useMemo(() => (meal ? resolveIngredients(meal) : []), [meal]);

  // Swap-view derivations — cheap, memoized, and never mutate state in render.
  const cls: MacroClass = swapTarget ? inferMacroClass(swapTarget) : "carb";
  const lockedValue     = swapTarget ? (cls === "protein" ? swapTarget.macros.protein : swapTarget.macros.carbs) : 0;
  const candidates      = useMemo(
    () => (swapTarget ? computeCandidates(swapTarget, cls, subsBank.items) : []),
    [swapTarget, cls, subsBank.items],
  );

  if (!meal) return null;
  const appliedForTarget = swapTarget ? swaps[swapTarget.key] : undefined;

  const dismiss = () => {
    triggerImpact();
    if (swapTarget) onSwapTarget(null); else onClose();
  };

  return (
    <Modal
      visible={!!meal}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
        {/* Glass panel — translucent obsidian fill + real blur, not a flat box */}
        <BlurView
          intensity={45}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={{
            backgroundColor: "rgba(42,42,42,0.8)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
            borderBottomWidth: 0,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "90%",
            overflow: "hidden",
            paddingBottom: insets.bottom + 16,
          }}
        >
          {swapTarget === null ? (
            // ══ VIEW 1 — Cinematic hero + itemized ingredients ══
            <>
              {/* §3.2.6 hero: 0.48-opacity cover image under the vertical scrim */}
              <View style={{ height: 210 }}>
                <ImageBackground
                  source={{ uri: mealImageFor(meal) }}
                  resizeMode="cover"
                  imageStyle={{ opacity: 0.48 }}
                  style={{ flex: 1, justifyContent: "flex-end" }}
                >
                  <HeroShade />
                  {/* Grab handle floats over the hero */}
                  <View style={{ position: "absolute", top: 12, left: 0, right: 0, alignItems: "center" }}>
                    <View style={{ width: 36, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)" }} />
                  </View>
                  <View className="px-5 pb-4">
                    <Text
                      className="font-black uppercase"
                      style={{ fontSize: 9, letterSpacing: 2.4, color: VOLT }}
                    >
                      ELITE NUTRITION · {meal.time} · {meal.calories} KCAL
                    </Text>
                    <Text
                      className="font-black uppercase"
                      style={{ fontSize: 32, fontStyle: "italic", color: T_PRIMARY, letterSpacing: -0.5, lineHeight: 32 }}
                      numberOfLines={2}
                    >
                      {meal.name}
                    </Text>
                    <View className="flex-row gap-2 mt-3">
                      <MacroPill label="PROT"  value={`${meal.macros.protein}g`} labelColor={VOLT} />
                      <MacroPill label="CARBS" value={`${meal.macros.carbs}g`} />
                      <MacroPill label="GRASA" value={`${meal.macros.fat}g`} />
                    </View>
                  </View>
                </ImageBackground>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
                {ingredients.map((ing, i) => (
                  <View
                    key={ing.key}
                    style={i < ingredients.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }
                      : undefined}
                  >
                    <IngredientRow
                      ing={ing}
                      swap={swaps[ing.key]}
                      onSwapPress={() => onSwapTarget(ing)}
                    />
                  </View>
                ))}
                {ingredients.length === 0 && (
                  <Text className="text-center py-8" style={{ fontSize: 12, color: T_TERTIARY }}>
                    Sin componentes detallados para esta comida.
                  </Text>
                )}
              </ScrollView>

              {/* Cápsula CONFIRMAR COMIDA — sólida verde neón, esquinas
                  aerodinámicas, altura fija (.cursorrules §4 "Contraste").
                  El estado ya confirmado conserva su propia variante
                  translúcida con borde — sigue necesitando leerse distinto
                  de "aún sin confirmar", pero sin volver a caer en fondo
                  oscuro/negro para el estado primario. */}
              <View className="px-5 pt-4">
                <Pressable
                  onPress={onConfirm}
                  disabled={confirming}
                  className="items-center justify-center"
                  style={({ pressed }) => ({
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: checked ? "rgba(204,255,0,0.12)" : pressed ? VOLT_DIM : "#CCFF00",
                    borderWidth: checked ? 1.5 : 0,
                    borderColor: "rgba(204,255,0,0.5)",
                    opacity: confirming ? 0.6 : 1,
                    ...(checked ? {} : {
                      shadowColor: VOLT, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
                    }),
                  })}
                >
                  {confirming
                    ? <ActivityIndicator size="small" color={checked ? C_PROTEIN : "#000000"} />
                    : (
                      <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
                        {checked && <Check size={16} color={C_PROTEIN} strokeWidth={3} />}
                        <Text
                          className="uppercase"
                          style={{ fontSize: 16, fontWeight: "800", letterSpacing: 1, color: checked ? C_PROTEIN : "#000000" }}
                        >
                          {checked ? "COMIDA CONFIRMADA — DESMARCAR" : "CONFIRMAR COMIDA"}
                        </Text>
                      </View>
                    )
                  }
                </Pressable>
              </View>
            </>
          ) : (
            // ══ VIEW 2 — SustitucionModal content (same modal, swapped focus) ══
            <>
              <View className="items-center pt-3 mb-1">
                <View style={{ width: 36, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)" }} />
              </View>

              <View className="px-5 mb-3">
                <Pressable onPress={() => onSwapTarget(null)} hitSlop={8} className="mb-2">
                  <Text className="uppercase" style={{ fontSize: 11, letterSpacing: 0.8, color: T_TERTIARY }}>
                    ← VOLVER A LA COMIDA
                  </Text>
                </Pressable>
                <Text className="font-black uppercase" style={{ fontSize: 9, letterSpacing: 2, color: VOLT }}>
                  SUSTITUCIÓN
                </Text>
                <Text
                  className="font-black uppercase"
                  style={{ fontSize: 24, fontStyle: "italic", color: T_PRIMARY, letterSpacing: -0.5, lineHeight: 26 }}
                  numberOfLines={2}
                >
                  {swapTarget.name}
                </Text>

                {/* Active locked-macro filter pill */}
                <View
                  className="self-start rounded-full px-3 py-1.5 mt-2"
                  style={{
                    backgroundColor: cls === "protein" ? "rgba(0,240,255,0.08)" : "rgba(96,165,250,0.08)",
                    borderWidth: 1,
                    borderColor: cls === "protein" ? "rgba(0,240,255,0.35)" : "rgba(96,165,250,0.35)",
                  }}
                >
                  <Text
                    className="font-black uppercase"
                    style={{ fontSize: 9, letterSpacing: 1, color: cls === "protein" ? VOLT : C_CARBS }}
                  >
                    {cls === "protein" ? "PROTEÍNA" : "CARBOHIDRATO"} — FILTRO ACTIVO: {lockedValue}g {cls === "protein" ? "PROT" : "CARB"}
                  </Text>
                </View>
              </View>

              {subsBank.loading && (
                <View className="items-center py-10">
                  <ActivityIndicator color={VOLT} />
                </View>
              )}

              {subsBank.error && !subsBank.loading && (
                <View className="items-center py-8 px-5">
                  <Text className="text-center mb-3" style={{ fontSize: 12, color: T_TERTIARY }}>
                    No se pudo cargar el catálogo de equivalencias.
                  </Text>
                  <Pressable
                    onPress={subsBank.retry}
                    className="rounded-full px-4 py-2"
                    style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                  >
                    <Text className="uppercase" style={{ fontSize: 11, letterSpacing: 0.8, color: T_PRIMARY }}>
                      REINTENTAR
                    </Text>
                  </Pressable>
                </View>
              )}

              {!subsBank.loading && !subsBank.error && (
                <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
                  {appliedForTarget && (
                    <Pressable
                      onPress={() => onClearSwap(swapTarget)}
                      className="items-center rounded-2xl py-3 mb-2.5"
                      style={{ borderWidth: 1, borderColor: "rgba(248,113,113,0.35)", backgroundColor: "rgba(248,113,113,0.06)" }}
                    >
                      <Text className="font-black uppercase" style={{ fontSize: 11, letterSpacing: 0.8, color: "#f87171" }}>
                        QUITAR SUSTITUCIÓN — VOLVER A {swapTarget.name.slice(0, 24).toUpperCase()}
                      </Text>
                    </Pressable>
                  )}

                  {candidates.map(c => {
                    const isApplied = appliedForTarget?.substituteFood === c.substituteFood;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => onApplySwap(swapTarget, {
                          substituteFood: c.substituteFood,
                          newGrams:       c.newGrams,
                          kcalDelta:      c.kcalDelta,
                          fatDelta:       c.fatDelta,
                        })}
                        className="rounded-2xl p-4 mb-3"
                        style={{
                          backgroundColor: isApplied ? "rgba(96,165,250,0.08)" : "#1E1E1E",
                          borderWidth: 1,
                          borderColor: isApplied ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.05)",
                        }}
                      >
                        {/* Header: illustration + candidate name */}
                        <View className="flex-row items-center gap-3">
                          <View
                            className="items-center justify-center"
                            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)" }}
                          >
                            <Text style={{ fontSize: 24 }}>{foodIconFor(c.substituteFood)}</Text>
                          </View>
                          <Text className="flex-1" style={{ fontSize: 15, fontWeight: "600", color: T_PRIMARY }} numberOfLines={1}>
                            {c.substituteFood}
                          </Text>
                          {isApplied && (
                            <Text className="uppercase" style={{ fontSize: 9, letterSpacing: 0.8, color: C_CARBS }}>
                              ● ACTIVO
                            </Text>
                          )}
                        </View>

                        {/* Top summary grid: original weight ↔ computed payload */}
                        <View className="flex-row items-center justify-between mt-4 px-3">
                          <View className="items-center">
                            <Text className="uppercase" style={{ fontSize: 9, letterSpacing: 1.2, color: T_TERTIARY }}>
                              ORIGINAL
                            </Text>
                            <Text className="font-black" style={{ fontSize: 26, color: T_PRIMARY, lineHeight: 28 }}>
                              {swapTarget.grams}g
                            </Text>
                          </View>
                          {/* Dual neon exchange arrow */}
                          <View
                            style={{
                              shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 10,
                              shadowOffset: { width: 0, height: 0 },
                            }}
                          >
                            <ArrowLeftRight size={20} color={VOLT} strokeWidth={2.5} />
                          </View>
                          <View className="items-center">
                            <Text className="uppercase" style={{ fontSize: 9, letterSpacing: 1.2, color: "rgba(204,255,0,0.6)" }}>
                              SUSTITUTO
                            </Text>
                            <Text className="font-black" style={{ fontSize: 26, color: VOLT, lineHeight: 28 }}>
                              {c.newGrams}g
                            </Text>
                          </View>
                        </View>

                        {/* Match ribbon — dominant macro preserved by construction */}
                        <View
                          className="self-center rounded-full px-3 py-1 mt-3"
                          style={{
                            backgroundColor: VOLT,
                            shadowColor: VOLT, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
                          }}
                        >
                          <Text className="font-black uppercase" style={{ fontSize: 9, letterSpacing: 0.8, color: "#000" }}>
                            COINCIDENCIA PERFECTA 100%
                          </Text>
                        </View>

                        {/* Lower mathematical delta blocks */}
                        <View className="flex-row mt-3" style={{ gap: 10 }}>
                          <View
                            className="flex-1 rounded-xl p-3"
                            style={{ backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)" }}
                          >
                            <Text className="uppercase" style={{ fontSize: 8, letterSpacing: 1.2, color: T_TERTIARY }}>
                              DIFERENCIA CALÓRICA
                            </Text>
                            <Text
                              className="font-black mt-1"
                              style={{ fontSize: 19, color: c.kcalDelta <= 0 ? VOLT : "#f87171", lineHeight: 21 }}
                            >
                              {c.kcalDelta > 0 ? "+" : ""}{c.kcalDelta} KCAL
                            </Text>
                            <Text className="uppercase" style={{ fontSize: 8, letterSpacing: 1, color: "#8e8e93" }}>
                              TOTAL
                            </Text>
                          </View>
                          <View
                            className="flex-1 rounded-xl p-3"
                            style={{ backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)" }}
                          >
                            <Text className="uppercase" style={{ fontSize: 8, letterSpacing: 1.2, color: T_TERTIARY }}>
                              VARIANZA DE GRASA
                            </Text>
                            <Text
                              className="font-black mt-1"
                              style={{ fontSize: 19, color: c.fatDelta <= 0 ? VOLT : "#fb923c", lineHeight: 21 }}
                            >
                              {c.fatDelta > 0 ? "+" : ""}{c.fatDelta}
                            </Text>
                            <Text className="uppercase" style={{ fontSize: 8, letterSpacing: 1, color: "#8e8e93" }}>
                              GRAMOS
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}

                  {candidates.length === 0 && (
                    <Text className="text-center py-8 uppercase" style={{ fontSize: 11, color: T_TERTIARY, letterSpacing: 0.8 }}>
                      SIN EQUIVALENCIAS PARA ESTE MACRO
                    </Text>
                  )}
                </ScrollView>
              )}
            </>
          )}
        </BlurView>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function NutritionTab() {
  const { token }               = useAuth();
  const { student, detail, isLoading, refresh } = usePortal();

  // PortalProvider fetches once on mount only — without this, a diet the
  // coach just assigned (dietJson, via PUT /api/students/[id]) wouldn't show
  // up until the app was force-quit and reopened. Re-pulling on every focus
  // is what makes the coach → student sync actually "immediate" the moment
  // the student opens or returns to this tab.
  useFocusEffect(
    useCallback(() => { refresh(); }, [refresh]),
  );

  const [activeDay,   setActiveDay]   = useState<number>(appToday());
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [syncingKeys, setSyncingKeys] = useState<Set<string>>(new Set());
  const [syncError,   setSyncError]   = useState<string | null>(null);
  const [directive,   setDirective]   = useState<string>("MISSION: MYCOACH // STATUS: EJECUTA TU PLAN DE HOY");
  const [waterMl,     setWaterMl]     = useState(0);
  const [waterBusy,   setWaterBusy]   = useState(false);

  // Sheet state — one modal, two views. swapTarget non-null = substitution view.
  const [openMeal,    setOpenMeal]    = useState<Meal | null>(null);
  const [swapTarget,  setSwapTarget]  = useState<ResolvedIngredient | null>(null);
  // Session-local applied swaps, keyed "mealName|ingredientKey".
  const [swaps,       setSwaps]       = useState<Record<string, AppliedSwap>>({});

  // Substitution bank — fetched on demand (event-driven, NOT effect-driven, so
  // a failed fetch can never re-trigger itself into a loop). Manual retry only.
  const [subs,        setSubs]        = useState<FoodSubstitute[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError,   setSubsError]   = useState(false);
  const [subsLoaded,  setSubsLoaded]  = useState(false);

  const fetchSubs = useCallback(() => {
    if (subsLoaded || subsLoading) return;
    setSubsLoading(true);
    setSubsError(false);
    api<{ substitutes: FoodSubstitute[] }>("/api/student/food-substitutes")
      .then(res => { setSubs(res.substitutes); setSubsLoaded(true); })
      .catch(() => setSubsError(true))
      .finally(() => setSubsLoading(false));
  }, [subsLoaded, subsLoading]);

  // Every check read/write is keyed to the real calendar date of the browsed
  // weekday (spec §4.1.2) — browsing tomorrow reads/writes tomorrow's date.
  const activeDate = realDateForDayIndex(activeDay);

  // Hydrate meal checks whenever the browsed day changes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ date: string; checks: DailyCheck[] }>(
          `/api/me/checks?date=${activeDate}`,
          { token },
        );
        if (cancelled) return;
        const keys = res.checks.filter(c => c.kind === "meal").map(c => c.itemKey);
        setCheckedKeys(new Set(keys));
      } catch {
        // Tolerate network failures — screen still works, just starts unchecked.
      }
    })();
    return () => { cancelled = true; };
  }, [token, activeDate]);

  // Directive banner content — latest coach notice (soft-failure shape: [] for
  // non-clients / errors just keep the default directive; never an error state).
  useEffect(() => {
    if (!token) return;
    api<Notice[]>("/api/mobile/community/notices", { token })
      .then(msgs => {
        if (!Array.isArray(msgs)) return;
        const notice = msgs.find(m => m.role === "COACH" || m.role === "ADMIN");
        if (notice) {
          setDirective(
            `MISSION: ${notice.senderName.toUpperCase()} // STATUS: ${notice.content.slice(0, 60).toUpperCase()}`,
          );
        }
      })
      .catch(() => {});
  }, [token]);

  // Hydration total for the browsed day.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ totalMl: number }>(`/api/student/water?date=${activeDate}`, { token })
      .then(res => { if (!cancelled) setWaterMl(res.totalMl ?? 0); })
      .catch(() => { if (!cancelled) setWaterMl(0); });
    return () => { cancelled = true; };
  }, [token, activeDate]);

  const addWater = useCallback(async () => {
    // Hard compliance cap: at or beyond WATER_TARGET_ML the circuit freezes —
    // no haptic, no optimistic mutation, no POST.
    if (!token || waterBusy || waterMl >= WATER_TARGET_ML) return;
    triggerImpact();
    setSyncError(null);
    setWaterBusy(true);
    const prev = waterMl;
    setWaterMl(prev + WATER_DOSE_ML); // optimistic
    try {
      await api("/api/student/water", {
        method: "POST",
        token,
        body: { amountMl: WATER_DOSE_ML, date: activeDate },
      });
    } catch {
      setWaterMl(prev); // rollback
      setSyncError("NO SE PUDO REGISTRAR EL AGUA — REVISA TU CONEXIÓN");
    } finally {
      setWaterBusy(false);
    }
  }, [token, waterBusy, waterMl, activeDate]);

  const toggleMeal = useCallback(async (meal: Meal) => {
    if (!token) return;
    const key         = meal.name;
    const wasChecked   = checkedKeys.has(key);
    const nextChecked  = !wasChecked;

    // Success notification on confirmation; light impact when unchecking.
    if (nextChecked) triggerSuccess();
    else             triggerImpact();
    setSyncError(null);
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (nextChecked) next.add(key); else next.delete(key);
      return next;
    });
    setSyncingKeys(prev => new Set(prev).add(key));

    try {
      await api("/api/me/checks", {
        method: "POST",
        token,
        body: { date: activeDate, kind: "meal", itemKey: key, done: nextChecked },
      });
    } catch {
      // Roll back the optimistic update on failure.
      setCheckedKeys(prev => {
        const next = new Set(prev);
        if (wasChecked) next.add(key); else next.delete(key);
        return next;
      });
      setSyncError("NO SE PUDO GUARDAR EL CAMBIO — REVISA TU CONEXIÓN");
    } finally {
      setSyncingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [token, checkedKeys, activeDate]);

  // Módulo 2/3 — misma lógica que lib/workout.tsx para la rutina: si el
  // coach nunca asignó dieta (detail.dietAssigned false) pero el alumno es
  // auto-entrenador y eligió una plantilla local (lib/selfCoach.tsx), esa
  // elección alimenta el mismo pipeline de checklist/macros real
  // (POST /api/me/checks no valida contra ningún dietJson asignado). Un plan
  // local jamás pisa una dieta real.
  const { localDietBridge, applyDietTemplate } = useSelfCoach();
  const dietAssigned = detail?.dietAssigned ?? ((detail?.diet?.meals?.length ?? 0) > 0);
  const isSelfDietPlan = !dietAssigned && !!localDietBridge;
  const diet = dietAssigned ? detail?.diet : (isSelfDietPlan ? localDietBridge : detail?.diet);
  const selfCoachedStudent = isSelfCoached(student);
  // Módulo 3 "PLAN ALIMENTICIO LIBRE": el coach existe pero solo asignó
  // rutina. Módulo 2 "CARGAR MI DIETA": auto-entrenador sin dieta elegida.
  const freeDietPlan  = !dietAssigned && !isSelfDietPlan && !selfCoachedStudent;
  const needsDietPlan = !dietAssigned && !isSelfDietPlan && selfCoachedStudent;
  const [showDietPicker, setShowDietPicker] = useState(false);

  // Per-day diet (diet.days present) resolves against the BROWSED day
  // (activeDay), not always literal today — so the shown kcal/macro targets
  // stay consistent with whichever day's meal-checks (fetched for
  // activeDate above) are on screen. Falls back to the flat diet fields
  // when there's no per-day structure (existing fixed-diet behavior,
  // completely unchanged for any diet authored before this feature).
  const activeJsWeekday = activeDay === 7 ? 0 : activeDay;   // app 1=Mon…7=Sun → JS 0=Sun…6=Sat
  const todayDietDay = diet?.days && diet.days.length > 0 ? resolveDietDay(diet.days, activeJsWeekday) : undefined;
  const meals       = todayDietDay?.meals ?? diet?.meals ?? [];
  const totalTarget = num(todayDietDay?.totalCalories ?? diet?.totalCalories, 2800);

  // num() at each addend — one malformed meal record (bad backend data,
  // never runtime-validated past lib/api.ts's type assertion) must not turn
  // the whole day's total into NaN.
  const totalConsumed   = meals.reduce((s, m) => checkedKeys.has(m.name) ? s + num(m.calories) : s, 0);
  const proteinConsumed = meals.reduce((s, m) => checkedKeys.has(m.name) ? s + num(m.macros?.protein) : s, 0);
  const completedCount  = meals.filter(m => checkedKeys.has(m.name)).length;
  const perfectDay      = meals.length > 0 && completedCount === meals.length;

  // Pending first, completed last — spec §3.2.6 sorting rule.
  const sortedMeals = [...meals].sort(
    (a, b) => (checkedKeys.has(a.name) ? 1 : 0) - (checkedKeys.has(b.name) ? 1 : 0),
  );

  // Target-achievement haptic: fires once on the false→true transition only.
  const prevPerfect = useRef(false);
  useEffect(() => {
    if (perfectDay && !prevPerfect.current) {
      triggerSuccess();
    }
    prevPerfect.current = perfectDay;
  }, [perfectDay]);

  // ── Disparador de éxito único — "checklist de nutrición al 100%" ─────────
  // Antes había DOS useEffect independientes (uno por caloricPct>=1 que
  // navegaba a nutrition/success, otro por perfectDay que abría el modal
  // motivacional) — ambas condiciones se vuelven verdaderas casi siempre en
  // el MISMO tick (marcar la última comida sube el checklist a 100% y el
  // consumo calórico al mismo tiempo), así que los dos disparaban a la vez:
  // un <Modal> de pantalla completa montándose sobre otra presentación de
  // pantalla completa (el push de router) crashea en iOS. Luego pasó por una
  // versión intermedia que abría el modal motivacional Y DESPUÉS empujaba
  // esta pantalla de resumen — ya no crasheaba, pero mostraba dos "éxitos"
  // consecutivos para el mismo evento (.cursorrules — eliminar la alerta
  // genérica intermedia). Ahora hay un solo disparador, una sola condición
  // (perfectDay), y una sola presentación: esta pantalla PROTOCOLO
  // COMPLETADO de alta fidelidad, directo, sin el modal motivacional de por
  // medio. El modal motivacional (lib/motivation.tsx) sigue existiendo tal
  // cual para su otro disparador real — última serie del día en
  // app/(portal)/index.tsx — que no tiene una pantalla de resumen propia
  // detrás y por lo tanto no duplica nada.
  const celebratedRef = useRef(false);
  useEffect(() => { celebratedRef.current = false; }, [activeDate]);
  useEffect(() => {
    if (perfectDay && !celebratedRef.current) {
      celebratedRef.current = true;
      // Cierra cualquier hoja de detalle abierta ANTES de navegar — evita
      // que quede una sheet nativa montada por debajo de la nueva pantalla.
      setSwapTarget(null);
      setOpenMeal(null);
      router.push({
        pathname: "/(portal)/nutrition/success",
        params: {
          kcal:       String(totalConsumed),
          protein:    String(proteinConsumed),
          mealsDone:  String(completedCount),
          mealsTotal: String(meals.length),
        },
      });
    }
    if (!perfectDay) celebratedRef.current = false;
  }, [perfectDay, totalConsumed, proteinConsumed, completedCount, meals.length]);

  // Scroll-reactive directive collapse — scrolling the meal list interpolates
  // the banner's height/opacity to 0 so cards roll up under the calendar strip.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 110], [1, 0], Extrapolation.CLAMP),
    maxHeight: interpolate(scrollY.value, [0, 140], [150, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [0, 140], [1, 0.96], Extrapolation.CLAMP) },
    ],
    overflow: "hidden" as const,
  }));

  const selectDay = useCallback((day: number) => {
    triggerImpact();
    setActiveDay(day);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
        <ShimmerScreen variant="exercise-list" label="CARGANDO PLAN..." />
      </SafeAreaView>
    );
  }

  const openMealChecked = !!openMeal && checkedKeys.has(openMeal.name);
  const swapKeyFor = (ing: ResolvedIngredient) => `${openMeal?.name ?? ""}|${ing.key}`;

  // Per-meal swaps re-keyed to bare ingredient keys for the sheet.
  const sheetSwaps = Object.fromEntries(
    Object.entries(swaps)
      .filter(([k]) => k.startsWith(`${openMeal?.name ?? ""}|`))
      .map(([k, v]) => [k.split("|").slice(1).join("|"), v]),
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <AnimatePresence>
        {syncError && (
          <MotiView
            from={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 34 }}
            exit={{ opacity: 0, height: 0 }}
            style={{ backgroundColor: "rgba(248,113,113,0.08)", borderBottomWidth: 1, borderBottomColor: "rgba(248,113,113,0.2)", justifyContent: "center", overflow: "hidden" }}
          >
            <Text className="text-[11px] text-center uppercase" style={{ color: "#f87171", letterSpacing: 0.8 }}>
              {syncError}
            </Text>
          </MotiView>
        )}
      </AnimatePresence>

      <Animated.ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* ── Top 0: brand header (Módulo 3) ── */}
        <BrandHeader initials={initialsOf(student?.name)} streak={student?.streak ?? 0} />

        {/* ── Top 1 (the crown): streak card ── */}
        <StreakCard
          dayLabel={WEEKDAY_LONG[activeDay]}
          streak={student?.streak ?? 0}
          activeDate={activeDate}
          perfectDay={perfectDay}
        />

        {/* ── Top 2: weekday selector ── */}
        <WeekdayStrip activeDay={activeDay} onSelect={selectDay} />

        {/* ── Top 3: cyber command banner — collapses as the meal list scrolls ── */}
        <Animated.View style={bannerStyle}>
          <DirectiveBanner text={directive} />
        </Animated.View>

        {/* ── Remaining-kcal tracking bar ── */}
        {meals.length > 0 && (
          <View className="mb-5">
            <KcalBar consumed={totalConsumed} target={totalTarget} />
          </View>
        )}

        {/* ── Hydration engine ── */}
        <HydrationRow totalMl={waterMl} syncing={waterBusy} onAdd={addWater} />

        {/* Módulo 3 — el coach existe y asignó rutina, pero ninguna dieta:
            sin bloques de macros/checklist incompletos, solo las metas
            generales (hidratación arriba + un estimado de mantenimiento
            declarado como tal, nunca presentado como objetivo del coach). */}
        {freeDietPlan && (
          <View
            className="rounded-3xl py-8 px-6"
            style={{ backgroundColor: "#1E1E1E", borderWidth: 1, borderColor: "rgba(204,255,0,0.15)", alignItems: "center", gap: 10 }}
          >
            <Utensils size={22} color={VOLT} strokeWidth={1.5} />
            <Text style={{ fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", fontSize: 15, color: "#fff", textAlign: "center", letterSpacing: -0.3 }}>
              {"PLAN ALIMENTICIO LIBRE\n// CUMPLE TUS MACROS BASE"}
            </Text>
            <Text className="text-[12px] text-center" style={{ color: T_TERTIARY, lineHeight: 18 }}>
              Tu coach enfocó tu plan en el entrenamiento. Mantén tu ingesta habitual — estimado de mantenimiento ≈ {Math.round((student?.currentWeight ?? 70) * 30)} kcal (fórmula general, no es un objetivo fijado por tu coach).
            </Text>
          </View>
        )}

        {/* Módulo 2 — auto-entrenador sin dieta elegida todavía. */}
        {needsDietPlan && (
          <View
            className="rounded-3xl py-8 px-6"
            style={{ backgroundColor: "#1E1E1E", borderWidth: 1, borderColor: "rgba(204,255,0,0.15)", alignItems: "center", gap: 12 }}
          >
            <Text style={{ fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", fontSize: 15, color: "#fff", textAlign: "center" }}>
              Modo auto-entrenador
            </Text>
            <Text className="text-[12px] text-center" style={{ color: T_TERTIARY, lineHeight: 18 }}>
              No tienes coach vinculado — carga un plan del catálogo para empezar a registrar tus comidas hoy mismo.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { triggerImpact(); setShowDietPicker(true); }}
              style={{
                width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: VOLT, borderRadius: 999, paddingVertical: 14,
              }}
            >
              <Plus size={16} color="#000" />
              <Text style={{ fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", fontSize: 13, color: "#000" }}>CARGAR MI DIETA</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fallback genérico — dieta real asignada pero sin comidas hoy
            (dato del coach incompleto), distinto de "nunca hubo dieta". */}
        {meals.length === 0 && !freeDietPlan && !needsDietPlan && (
          <View
            className="items-center justify-center rounded-3xl py-12 px-6"
            style={{ backgroundColor: "#1E1E1E", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" }}
          >
            <Text className="text-[13px] text-center" style={{ color: T_TERTIARY, lineHeight: 20 }}>
              Tu coach aún no asigna tu dieta.
            </Text>
          </View>
        )}

        {meals.length > 0 && (
          <>
            <Text className="text-[10px] uppercase mb-3" style={{ color: T_TERTIARY, letterSpacing: 1.2 }}>
              COMIDAS DEL DÍA · {completedCount}/{meals.length}
            </Text>
            {sortedMeals.map((meal, i) => (
              <MealCard
                key={`${meal.name}-${i}`}
                index={i}
                meal={meal}
                checked={checkedKeys.has(meal.name)}
                syncing={syncingKeys.has(meal.name)}
                onToggle={() => toggleMeal(meal)}
                onOpen={() => { setSwapTarget(null); setOpenMeal(meal); }}
              />
            ))}
          </>
        )}
      </Animated.ScrollView>

      {/* ── Meal detail sheet: hero + ingredients ⇄ substitution engine ── */}
      <MealDetailSheet
        meal={openMeal}
        checked={openMealChecked}
        confirming={!!openMeal && syncingKeys.has(openMeal.name)}
        swaps={sheetSwaps}
        subsBank={{ items: subs, loading: subsLoading, error: subsError, retry: fetchSubs }}
        swapTarget={swapTarget}
        onSwapTarget={ing => {
          setSwapTarget(ing);
          if (ing) fetchSubs(); // event-driven load; no effect loop possible
        }}
        onClose={() => { setSwapTarget(null); setOpenMeal(null); }}
        onConfirm={async () => {
          if (!openMeal) return;
          await toggleMeal(openMeal);
          if (!openMealChecked) { setSwapTarget(null); setOpenMeal(null); } // confirming closes; unchecking keeps the sheet
        }}
        onApplySwap={(ing, swap) => {
          setSwaps(prev => ({ ...prev, [swapKeyFor(ing)]: swap }));
          setSwapTarget(null); // return focus to the ingredient view
        }}
        onClearSwap={ing => {
          setSwaps(prev => {
            const next = { ...prev };
            delete next[swapKeyFor(ing)];
            return next;
          });
          setSwapTarget(null);
        }}
      />

      <TemplatePickerModal
        visible={showDietPicker}
        onClose={() => setShowDietPicker(false)}
        type="diet"
        onApply={async tpl => {
          if (tpl.type !== "diet") return;
          await applyDietTemplate(tpl);
          triggerSuccess();
        }}
      />
    </SafeAreaView>
  );
}
