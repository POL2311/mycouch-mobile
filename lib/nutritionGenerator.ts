import { DIAS_SEMANA, emptyDietaJson, type DietaJson, genCoachClientId } from "@/types/coach-client";

export type Gender = "M" | "F";
export type Goal = "Pérdida de Grasa" | "Hipertrofia" | "Mantenimiento";

export function generateBaseNutritionPlan(
  age: number,
  weightKg: number,
  heightCm: number,
  gender: Gender,
  goal: Goal
): DietaJson {
  // 1. Tasa Metabólica Basal (TMB): Ecuación de Mifflin-St Jeor
  const tmbBase = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const tmb = gender === "M" ? tmbBase + 5 : tmbBase - 161;

  // 2. Gasto Energético Total (TDEE) con Factor de Actividad (1.375 promedio)
  const tdee = tmb * 1.375;

  // 3. Ajuste de Calorías y Macros
  let targetCalories = tdee;
  let proteinPerKg = 1.8;
  let fatPercentage = 0.25;

  if (goal === "Hipertrofia") {
    targetCalories = tdee + 300;
    proteinPerKg = 2.0;
    fatPercentage = 0.25;
  } else if (goal === "Pérdida de Grasa") {
    targetCalories = tdee - 400;
    proteinPerKg = 2.2;
    fatPercentage = 0.20;
  } else {
    // Mantenimiento
    targetCalories = tdee;
    proteinPerKg = 1.8;
    fatPercentage = 0.25;
  }

  targetCalories = Math.round(targetCalories);

  // Calcular gramos de macros
  const proteinGrams = Math.round(weightKg * proteinPerKg);
  const proteinCalories = proteinGrams * 4;

  const fatCalories = targetCalories * fatPercentage;
  const fatGrams = Math.round(fatCalories / 9);

  const carbsCalories = targetCalories - (proteinCalories + fatCalories);
  const carbsGrams = Math.max(0, Math.round(carbsCalories / 4));

  const macrosObj = { protein: proteinGrams, carbs: carbsGrams, fat: fatGrams };

  // 4. Distribuir en comidas
  // Crearemos una estructura básica de 4 comidas para el Plan Base.
  const mealsCount = 4;
  const mealMacros = {
    protein: Math.round(proteinGrams / mealsCount),
    carbs: Math.round(carbsGrams / mealsCount),
    fat: Math.round(fatGrams / mealsCount),
  };
  const mealKcal = Math.round(targetCalories / mealsCount);

  const baseMeals = [
    { hora: "08:00", nombre: "Desayuno", descripcion: "Avena con proteína y fruta" },
    { hora: "14:00", nombre: "Comida", descripcion: "Arroz con pollo y vegetales" },
    { hora: "18:00", nombre: "Snack / Pre-Entreno", descripcion: "Yogur griego con almendras" },
    { hora: "21:00", nombre: "Cena", descripcion: "Salmón con ensalada" },
  ];

  const dieta = emptyDietaJson(`Plan Base - ${goal}`);

  for (const dia of DIAS_SEMANA) {
    dieta.configuracionPorDia[dia] = {
      kcalObjetivo: targetCalories,
      macros: macrosObj,
      comidas: baseMeals.map((m) => ({
        id: genCoachClientId("comida"),
        hora: m.hora,
        nombre: m.nombre,
        descripcion: m.descripcion,
        kcal: mealKcal,
        macros: mealMacros,
      })),
    };
  }

  return dieta;
}
