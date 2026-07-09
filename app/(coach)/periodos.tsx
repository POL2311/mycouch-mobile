import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useMemo } from "react";
import { CalendarClock, CalendarX } from "lucide-react-native";
import { useCoach, STAGES, STAGE_COLORS } from "@/lib/coach";
import BulkPeriodizationWizard from "@/components/coach/BulkPeriodizationWizard";

const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

export default function PeriodosScreen() {
  const { students, isLoading, refresh } = useCoach();
  const [wizardOpen, setWizardOpen] = useState(false);

  const perStage = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach(s => { counts[s] = 0; });
    students.forEach(s => { if (s.stage in counts) counts[s.stage]! += 1; });
    return counts;
  }, [students]);

  const pending = useMemo(
    () => students
      .filter(s => s.scheduledChange)
      .map(s => ({ student: s, change: s.scheduledChange! }))
      .sort((a, b) => a.change.executionDate.localeCompare(b.change.executionDate)),
    [students],
  );

  const total = students.length;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, marginBottom: 16 }}>
        <Text style={{ ...athletic, fontSize: 22, color: "#fff" }}>Periodización y Ciclos</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setWizardOpen(true)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#CCFF00", alignItems: "center", justifyContent: "center" }}
        >
          <CalendarClock size={19} color="#000" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#CCFF00" style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {/* 2×2 active phase counters */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            {STAGES.map(stage => {
              const n = perStage[stage] ?? 0;
              const color = STAGE_COLORS[stage] ?? SILVER;
              return (
                <View key={stage} style={{ ...GLASS, width: "48%", borderRadius: 16, padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n > 0 ? color : "#3f3f46" }} />
                    <Text className="font-bold" style={{ fontSize: 12, color: "#fff" }}>{stage}</Text>
                  </View>
                  <Text className="font-black" style={{ fontSize: 20, color: n > 0 ? color : SILVER }}>{n} alumnos</Text>
                </View>
              );
            })}
          </View>

          {/* Chronogram */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", marginBottom: 2 }}>Cronograma de cambios</Text>
            <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: SILVER, marginBottom: 14 }}>Ejecución automática</Text>

            {pending.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <CalendarX size={26} color={SILVER} strokeWidth={1.5} />
                <Text className="font-mono text-center" style={{ fontSize: 10, color: "#d4d4d8", marginTop: 10 }}>
                  No hay cambios programados
                </Text>
                <Text className="text-center" style={{ fontSize: 11, color: SILVER, marginTop: 6, lineHeight: 16, paddingHorizontal: 10 }}>
                  Usa las acciones en lote de la lista de alumnos para automatizar cambios.
                </Text>
              </View>
            ) : (
              pending.map(({ student, change }) => (
                <View key={student.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
                  <View>
                    <Text className="font-bold" style={{ fontSize: 12, color: "#fff" }}>{student.name}</Text>
                    <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 2 }}>
                      → {change.stage} · E{change.stageNumber}
                    </Text>
                  </View>
                  <Text className="font-mono" style={{ fontSize: 10, color: "#00F0FF" }}>{change.executionDate}</Text>
                </View>
              ))
            )}
          </View>

          {/* Distribution bars */}
          <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", marginBottom: 4 }}>Distribución de alumnos</Text>
          <Text style={{ fontSize: 11, color: SILVER, lineHeight: 16, marginBottom: 14 }}>
            La periodización mueve a cada alumno entre etapas metabólicas — ganancia, pérdida y estabilización — a lo largo del ciclo.
          </Text>
          {([["Volumen", "Ganancia"], ["Definición", "Pérdida"], ["Mantenimiento", "Estabilización"], ["Recomposición", "Recomp."]] as const).map(([stage, sub]) => {
            const n = perStage[stage] ?? 0;
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            const color = STAGE_COLORS[stage] ?? SILVER;
            return (
              <View key={stage} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                  <Text className="font-mono" style={{ fontSize: 10, color: "#d4d4d8" }}>{stage} <Text style={{ color: SILVER }}>({sub})</Text></Text>
                  <Text className="font-bold" style={{ fontSize: 10, color: n > 0 ? color : SILVER }}>{n} ({pct}%)</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: "#1C1C1E" }}>
                  <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: n > 0 ? color : "#1C1C1E" }} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <BulkPeriodizationWizard
        visible={wizardOpen}
        roster={students}
        onClose={() => setWizardOpen(false)}
        onApplied={refresh}
      />
    </SafeAreaView>
  );
}
