import { router, useLocalSearchParams } from "expo-router";
import { CompletionScreen } from "@/components/ui/CompletionScreen";

// ── CONFIGURATION B: nutrition protocol archived ─────────────────────────────
// Reached via router params from index.tsx's caloric-objective effect (this
// screen's data — meal checks, macro totals — lives as local state on that
// screen, not a shared provider, so it's handed off as params rather than
// read from context).
export default function NutritionSuccessScreen() {
  const { kcal, protein, mealsDone, mealsTotal } = useLocalSearchParams<{
    kcal: string; protein: string; mealsDone: string; mealsTotal: string;
  }>();

  const total = Number(mealsTotal ?? 0);
  const done  = Number(mealsDone ?? 0);
  const pct   = total > 0 ? Math.round((done / total) * 100) : 100;
  const kcalNum = Number(kcal ?? 0);

  return (
    <CompletionScreen
      headline={["PROTOCOLO", "COMPLETADO"]}
      subheader={`${pct}% // ${mealsDone} DE ${mealsTotal} COMIDAS INYECTADAS`}
      ringMain="DISCIPLINA ALIMENTARIA."
      ringSub="RECARGA COMPLETA."
      left={{ label: "PROTEÍNA", value: protein ?? "0", unit: "G", color: "#40E0D0" }}
      right={{ label: "TOTAL ENERGÍA", value: kcalNum.toLocaleString("es-MX"), unit: "KCAL", color: "#CCFF00" }}
      onPressCta={() => router.back()}
    />
  );
}
