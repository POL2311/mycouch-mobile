import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import {
  useCoach, STAGE_COLORS, parseDiet, parseRoutine, ordinalScheduleLabel, paymentBucket,
  type CoachStudent,
} from "@/lib/coach";
import { WATER_TARGET_ML } from "@/components/workout-ui";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.5)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.08)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const PAYMENT_LABEL: Record<string, string> = {
  al_dia: "Al día", pendiente: "Pendiente", suspendido: "Suspendido",
};
const PAYMENT_COLOR: Record<string, string> = {
  al_dia: "#4ade80", pendiente: "#f59e0b", suspendido: "#ef4444",
};

function StatTile({ label, value, unit, color = "#fff", estimated }: {
  label: string; value: string; unit?: string; color?: string; estimated?: boolean;
}) {
  return (
    <View style={{ ...GLASS, flex: 1, borderRadius: 20, padding: 14 }}>
      <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: SILVER, textTransform: "uppercase" }}>
        {label}{estimated ? " · est." : ""}
      </Text>
      <Text className="font-black" style={{ fontSize: 22, color, marginTop: 4 }}>
        {value}
        {unit && <Text style={{ fontSize: 12, color: SILVER, fontWeight: "400" }}> {unit}</Text>}
      </Text>
    </View>
  );
}

// ── DEMO-ONLY placeholder fields for the Apple walkthrough build ────────────
// height/bodyFat/targetGoal/water/macroCompliance are NOT part of
// CoachStudent (see lib/coach.tsx) or any other coach-facing API in this
// codebase — the real backend has no per-student endpoint for them yet.
// These are deterministic, seeded per student.id so the demo shows varied,
// plausible-looking numbers across different students rather than one
// identical hardcoded set — but they are fabricated, not fetched. Every
// field built from them below carries the "· est." tag in StatTile so a
// coach using this screen for real after launch can't mistake a made-up
// body-fat number for an actual client's real data. Replace with real API
// fields the moment the backend adds them — do not let this silently become
// "the real feature" past the demo.
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
function mockTelemetryFor(student: CoachStudent) {
  const seed = seedFromId(student.id);
  const heightCm      = 158 + (seed % 38);                     // 158–195cm
  const bodyFatPct     = 10 + ((seed >> 3) % 16);               // 10–25%
  const goalDeltaKg    = 3 + ((seed >> 6) % 8);                 // 3–10kg
  const targetWeightKg = student.stage === "Volumen"
    ? +(student.currentWeight + goalDeltaKg).toFixed(1)
    : +(student.currentWeight - goalDeltaKg).toFixed(1);
  const waterMl        = 1200 + ((seed >> 9)  % (WATER_TARGET_ML - 1200));
  const macroAdherence = 58 + ((seed >> 12) % 41);              // 58–98%
  return { heightCm, bodyFatPct, targetWeightKg, waterMl, macroAdherence };
}

export default function AlumnoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { students } = useCoach();
  const student = students.find(s => s.id === id);

  if (!student) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#070708" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text className="text-center" style={{ fontSize: 13, color: SILVER }}>
            Alumno no disponible.
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text className="uppercase" style={{ fontSize: 11, letterSpacing: 1, color: "#fff" }}>← Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stageColor   = STAGE_COLORS[student.stage] ?? SILVER;
  const bucket       = paymentBucket(student.paymentStatus);
  const delta        = +(student.currentWeight - student.previousWeight).toFixed(1);
  const diet         = parseDiet(student.dietJson);
  const routine      = parseRoutine(student.routineJson);
  const mock         = mockTelemetryFor(student);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, height: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ── Identity ── */}
        <Text style={{ ...athletic, fontSize: 26, color: "#fff", letterSpacing: -0.5 }} numberOfLines={1}>
          {student.name}
        </Text>
        <Text className="font-mono" style={{ fontSize: 11, color: SILVER, marginTop: 2 }} numberOfLines={1}>
          {student.email}
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ backgroundColor: `${stageColor}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, color: stageColor, fontWeight: "800" }}>{student.stage}</Text>
          </View>
          <View style={{ backgroundColor: `${PAYMENT_COLOR[bucket]}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, color: PAYMENT_COLOR[bucket], fontWeight: "800" }}>{PAYMENT_LABEL[bucket]}</Text>
          </View>
          <View style={{ backgroundColor: student.isActive ? "#4ade8022" : "#ef444422", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, color: student.isActive ? "#4ade80" : "#ef4444", fontWeight: "800" }}>
              {student.isActive ? "Activo" : "Suspendido"}
            </Text>
          </View>
        </View>

        {/* ── Body + adherence stats ── */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
          <StatTile label="Peso actual" value={String(student.currentWeight)} unit="kg" />
          <StatTile
            label="Cambio"
            value={`${delta > 0 ? "+" : ""}${delta}`}
            unit="kg"
            color={Math.abs(delta) < 0.1 ? SILVER : delta < 0 ? "#4ade80" : "#ef4444"}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <StatTile label="Racha" value={String(student.streak)} unit="días" color={VOLT} />
          <StatTile label="Adherencia" value={`${Math.round(student.completionRate)}`} unit="%" color={CYAN} />
        </View>

        {/* ── Datos complementarios — placeholder fields, see mockTelemetryFor
             comment above for why these are marked "· est." ── */}
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: SILVER, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>
          Datos complementarios
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <StatTile label="Estatura" value={String(mock.heightCm)} unit="cm" estimated />
          <StatTile label="% Grasa" value={String(mock.bodyFatPct)} unit="%" estimated />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <StatTile label="Meta de peso" value={String(mock.targetWeightKg)} unit="kg" color={VOLT} estimated />
          <StatTile label="Agua hoy" value={(mock.waterMl / 1000).toFixed(1)} unit={`/ ${(WATER_TARGET_ML / 1000).toFixed(1)}L`} color={CYAN} estimated />
        </View>
        <View style={{ marginTop: 10 }}>
          <StatTile label="Cumplimiento de macros" value={String(mock.macroAdherence)} unit="%" color="#fb923c" estimated />
        </View>

        {/* ── Assigned routine — surfaces the per-weekday scheduling matrix
             (RoutineDayAuth.weekday pin, resolved via ordinalScheduleLabel —
             the same resolver the client uses to pick "today's" routine). ── */}
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: SILVER, textTransform: "uppercase", marginTop: 24, marginBottom: 10 }}>
          Rutina asignada
        </Text>
        {routine.days.length === 0 ? (
          <View style={{ ...GLASS, borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 12, color: SILVER }}>Sin rutina asignada.</Text>
          </View>
        ) : (
          <View style={{ ...GLASS, borderRadius: 16, padding: 16 }}>
            <Text className="font-black" style={{ fontSize: 14, color: "#fff" }}>{routine.name}</Text>
            {routine.days.map((day, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.06)", marginTop: i > 0 ? 4 : 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{day.label}</Text>
                  <Text className="font-mono" style={{ fontSize: 10, color: SILVER, marginTop: 1 }}>
                    {ordinalScheduleLabel(i, day.weekday)} · {day.exercises.length} ejercicios
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Assigned diet — targets only; per-meal adherence (checked vs.
             not) is client-side state the coach API doesn't expose. ── */}
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: SILVER, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>
          Dieta asignada
        </Text>
        {diet.meals.length === 0 ? (
          <View style={{ ...GLASS, borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 12, color: SILVER }}>Sin dieta asignada.</Text>
          </View>
        ) : (
          <View style={{ ...GLASS, borderRadius: 16, padding: 16 }}>
            <Text className="font-black" style={{ fontSize: 14, color: "#fff" }}>{diet.name}</Text>
            <Text className="font-mono" style={{ fontSize: 10, color: SILVER, marginTop: 2 }}>
              {diet.totalCalories} KCAL OBJETIVO · {diet.meals.length} COMIDAS
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
              <Text style={{ fontSize: 11, color: CYAN }}>P {diet.macros.protein}g</Text>
              <Text style={{ fontSize: 11, color: "#60a5fa" }}>C {diet.macros.carbs}g</Text>
              <Text style={{ fontSize: 11, color: "#fb923c" }}>G {diet.macros.fat}g</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
