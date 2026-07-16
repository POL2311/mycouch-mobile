import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Plus, X, Trash2 } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import {
  DAYS, createTemplate, updateTemplate,
  type StoredTemplate, type DietMeal, type DietDayAuth, type RoutineDayAuth, type RoutineExerciseAuth, type EjercicioDTO,
  ordinalScheduleLabel,
} from "@/lib/coach";
import ExercisePicker from "./ExercisePicker";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const FIELD = {
  ...GLASS, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  color: "#fff", fontSize: 13,
} as const;

const EMPTY_MEAL = (): DietMeal => ({ name: "", time: "", calories: 0, protein: 0, carbs: 0, fat: 0, items: [""] });
const EMPTY_DAY = (slot: number): RoutineDayAuth => ({
  day: DAYS[slot % 7]!, label: "", muscleGroup: "", exercises: [],
});
const EMPTY_DIET_DAY = (slot: number): DietDayAuth => ({
  day: DAYS[slot % 7]!, totalCalories: 0, macros: { protein: 0, carbs: 0, fat: 0 }, meals: [EMPTY_MEAL()],
});

// ── Reusable meal list editor — used both by the fixed week-round diet and,
// per-day, by each DietDayAuth card. Extracted so the (fairly large) meal
// editing block isn't duplicated wholesale between the two modes; callers
// bind the callbacks to whichever meals array (flat or a specific day's)
// they're editing. ──────────────────────────────────────────────────────
function MealsEditor({ meals, onAdd, onRemove, onPatch, onPatchItem }: {
  meals: DietMeal[];
  onAdd: () => void;
  onRemove: (mi: number) => void;
  onPatch: (mi: number, patch: Partial<DietMeal>) => void;
  onPatchItem: (mi: number, ii: number, text: string) => void;
}) {
  return (
    <>
      <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 10 }}>
        Comidas ({meals.length})
      </Text>
      {meals.map((meal, mi) => (
        <View key={mi} style={{ ...GLASS, borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <TextInput
              value={meal.name}
              onChangeText={t => onPatch(mi, { name: t })}
              placeholder="Nombre (Desayuno)"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, flex: 2 }}
            />
            <TextInput
              value={meal.time}
              onChangeText={t => onPatch(mi, { time: t })}
              placeholder="Hora"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, flex: 1 }}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
            {[["kcal", meal.calories, (v: number) => onPatch(mi, { calories: v })],
              ["P",    meal.protein,  (v: number) => onPatch(mi, { protein: v })],
              ["C",    meal.carbs,    (v: number) => onPatch(mi, { carbs: v })],
              ["G",    meal.fat,      (v: number) => onPatch(mi, { fat: v })]].map(([ph, val, setter]) => (
              <TextInput
                key={ph as string}
                value={String(val)}
                onChangeText={t => (setter as (v: number) => void)(parseFloat(t) || 0)}
                placeholder={ph as string}
                placeholderTextColor="#52525b"
                keyboardType="numeric"
                style={{ ...FIELD, flex: 1, textAlign: "center" }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 9, color: SILVER, marginBottom: 4 }}>Un alimento por línea</Text>
          {meal.items.map((item, ii) => (
            <TextInput
              key={ii}
              value={item}
              onChangeText={t => onPatchItem(mi, ii, t)}
              placeholder="Un alimento por línea"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, marginBottom: 6 }}
            />
          ))}
          <TouchableOpacity onPress={() => onRemove(mi)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Trash2 size={12} color="#f87171" />
            <Text style={{ fontSize: 10, color: "#f87171" }}>Eliminar comida</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onAdd}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 12 }}
      >
        <Plus size={14} color={VOLT} />
        <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>Añadir comida</Text>
      </TouchableOpacity>
    </>
  );
}

interface Props {
  visible: boolean;
  mode: "diet" | "routine";
  existing?: StoredTemplate;   // present → edit mode; absent → create mode
  onClose: () => void;
  onSaved: (t: StoredTemplate) => void;
}

// ── §2A TEMPLATE EDITOR MODAL — the coach's diet/routine authoring tool.
// canSave = name.trim().length > 0 (the ONLY validation, verbatim §3.4). ────
export default function TemplateEditorModal({ visible, mode, existing, onClose, onSaved }: Props) {
  const { token } = useAuth();

  const [name, setName] = useState(existing?.name ?? "");
  // Diet state
  const [totalCalories, setTotalCalories] = useState(String(existing?.type === "diet" ? existing.totalCalories : ""));
  const [protein, setProtein] = useState(String(existing?.type === "diet" ? existing.macros.protein : ""));
  const [carbs,   setCarbs]   = useState(String(existing?.type === "diet" ? existing.macros.carbs : ""));
  const [fat,     setFat]     = useState(String(existing?.type === "diet" ? existing.macros.fat : ""));
  const [meals, setMeals] = useState<DietMeal[]>(existing?.type === "diet" && existing.meals.length > 0 ? existing.meals : [EMPTY_MEAL()]);
  // "Fija" = one week-round totalCalories/macros/meals (existing behavior).
  // "Por día" = independent DietDayAuth per weekday. Mode is inferred from
  // whatever's already on the template being edited; new templates default
  // to "fija" since that's the simpler, more common case.
  const existingDietDays = existing?.type === "diet" ? existing.days : undefined;
  const [dietMode, setDietMode] = useState<"fija" | "porDia">(
    existingDietDays && existingDietDays.length > 0 ? "porDia" : "fija",
  );
  const [dietDays, setDietDays] = useState<DietDayAuth[]>(
    existingDietDays && existingDietDays.length > 0 ? existingDietDays : [EMPTY_DIET_DAY(0)],
  );
  // Routine state
  const [days, setDays] = useState<RoutineDayAuth[]>(existing?.type === "routine" && existing.days.length > 0 ? existing.days : [EMPTY_DAY(0)]);
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const canSave = name.trim().length > 0;

  const addMeal = useCallback(() => setMeals(m => [...m, EMPTY_MEAL()]), []);
  const removeMeal = useCallback((i: number) => setMeals(m => m.filter((_, idx) => idx !== i)), []);
  const patchMeal = useCallback((i: number, patch: Partial<DietMeal>) => {
    setMeals(m => m.map((meal, idx) => idx === i ? { ...meal, ...patch } : meal));
  }, []);
  const patchMealItem = useCallback((mi: number, ii: number, text: string) => {
    setMeals(m => m.map((meal, idx) => {
      if (idx !== mi) return meal;
      const items = [...meal.items];
      items[ii] = text;
      // Auto-grow: typing into the last line adds a fresh blank one.
      if (ii === items.length - 1 && text.trim() !== "") items.push("");
      return { ...meal, items };
    }));
  }, []);

  // ── Per-day diet mutators — same shape as the flat meal mutators above,
  // scoped to one DietDayAuth at a time. ──────────────────────────────────
  const addDietDay = useCallback(() => setDietDays(d => [...d, EMPTY_DIET_DAY(d.length)]), []);
  const removeDietDay = useCallback((i: number) => setDietDays(d => d.filter((_, idx) => idx !== i)), []);
  const patchDietDay = useCallback((i: number, patch: Partial<DietDayAuth>) => {
    setDietDays(d => d.map((day, idx) => idx === i ? { ...day, ...patch } : day));
  }, []);
  const addDietDayMeal = useCallback((di: number) => {
    setDietDays(d => d.map((day, idx) => idx === di ? { ...day, meals: [...day.meals, EMPTY_MEAL()] } : day));
  }, []);
  const removeDietDayMeal = useCallback((di: number, mi: number) => {
    setDietDays(d => d.map((day, idx) => idx === di ? { ...day, meals: day.meals.filter((_, x) => x !== mi) } : day));
  }, []);
  const patchDietDayMeal = useCallback((di: number, mi: number, patch: Partial<DietMeal>) => {
    setDietDays(d => d.map((day, idx) => idx === di ? { ...day, meals: day.meals.map((m, x) => x === mi ? { ...m, ...patch } : m) } : day));
  }, []);
  const patchDietDayMealItem = useCallback((di: number, mi: number, ii: number, text: string) => {
    setDietDays(d => d.map((day, idx) => {
      if (idx !== di) return day;
      return {
        ...day,
        meals: day.meals.map((meal, x) => {
          if (x !== mi) return meal;
          const items = [...meal.items];
          items[ii] = text;
          if (ii === items.length - 1 && text.trim() !== "") items.push("");
          return { ...meal, items };
        }),
      };
    }));
  }, []);

  const addDay = useCallback(() => setDays(d => [...d, EMPTY_DAY(d.length)]), []);
  const removeDay = useCallback((i: number) => setDays(d => d.filter((_, idx) => idx !== i)), []);
  const patchDay = useCallback((i: number, patch: Partial<RoutineDayAuth>) => {
    setDays(d => d.map((day, idx) => idx === i ? { ...day, ...patch } : day));
  }, []);
  const removeExercise = useCallback((di: number, ei: number) => {
    setDays(d => d.map((day, idx) => idx === di ? { ...day, exercises: day.exercises.filter((_, x) => x !== ei) } : day));
  }, []);
  const patchExercise = useCallback((di: number, ei: number, patch: Partial<RoutineExerciseAuth>) => {
    setDays(d => d.map((day, idx) => {
      if (idx !== di) return day;
      const exercises = day.exercises.map((ex, x) => x === ei ? { ...ex, ...patch } : ex);
      return { ...day, exercises };
    }));
  }, []);
  const addExercisesFromCatalog = useCallback((dayIdx: number, chosen: EjercicioDTO[]) => {
    // Editor authoring defaults, verbatim (blueprint §1.3 addExercises).
    const rows: RoutineExerciseAuth[] = chosen.map(e => ({
      ejercicioId: e.id, name: e.name, bodyweight: e.bodyweight, sets: 3, reps: "10", weight: "", rest: "60s",
    }));
    setDays(d => d.map((day, idx) => idx === dayIdx ? { ...day, exercises: [...day.exercises, ...rows] } : day));
  }, []);

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    setSaving(true);
    setError(null);
    try {
      let result: StoredTemplate;
      const cleanMeals = (ms: DietMeal[]) => ms.map(m => ({ ...m, items: m.items.filter(i => i.trim()) }));
      if (mode === "diet") {
        let data;
        if (dietMode === "porDia") {
          const cleanedDays = dietDays.map(d => ({ ...d, meals: cleanMeals(d.meals) }));
          // Top-level totalCalories/macros/meals still get populated (from
          // the first day) so any consumer not yet updated for per-day diets
          // — an old cached client build, the "sin dieta" empty-detector —
          // still sees a sensible fallback instead of a blank/zeroed diet.
          const first = cleanedDays[0];
          data = {
            totalCalories: first?.totalCalories ?? 0,
            macros: first?.macros ?? { protein: 0, carbs: 0, fat: 0 },
            meals: first?.meals ?? [],
            days: cleanedDays,
          };
        } else {
          data = {
            totalCalories: parseFloat(totalCalories) || 0,
            macros: { protein: parseFloat(protein) || 0, carbs: parseFloat(carbs) || 0, fat: parseFloat(fat) || 0 },
            meals: cleanMeals(meals),
          };
        }
        result = existing
          ? await updateTemplate(existing.id, name.trim(), data, token)
          : await createTemplate("diet", name.trim(), data, token);
      } else {
        const data = { daysPerWeek: days.length, days };   // recomputed on save, verbatim
        result = existing
          ? await updateTemplate(existing.id, name.trim(), data, token)
          : await createTemplate("routine", name.trim(), data, token);
      }
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hubo un error al guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, mode, name, totalCalories, protein, carbs, fat, meals, dietMode, dietDays, days, existing, onSaved, onClose]);

  const title = mode === "diet" ? "Nombre de la dieta" : "Nombre de la rutina";
  const placeholder = mode === "diet" ? "Ej. Déficit Calórico (Definición)" : "Ej. PPL 5 días";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", paddingTop: 60 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 18 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>
              {mode === "diet" ? "Editor de dieta" : "Editor de rutina"}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
              <X size={22} color={SILVER} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 6 }}>{title}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={placeholder}
              placeholderTextColor="#52525b"
              style={{ ...FIELD, marginBottom: 18 }}
            />

            {mode === "diet" ? (
              <>
                {/* Fija (one target for the whole week) vs. Por día
                    (independent kcal/macros/meals per weekday). */}
                <View style={{ flexDirection: "row", backgroundColor: "#151517", borderRadius: 12, padding: 3, marginBottom: 18 }}>
                  {(["fija", "porDia"] as const).map(m => {
                    const active = dietMode === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setDietMode(m); }}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: active ? VOLT : "transparent" }}
                      >
                        <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : SILVER }}>
                          {m === "fija" ? "Fija (toda la semana)" : "Por día"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {dietMode === "fija" ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
                      {[["Kcal", totalCalories, setTotalCalories], ["Prot (g)", protein, setProtein], ["Carb (g)", carbs, setCarbs], ["Gra (g)", fat, setFat]].map(
                        ([label, value, setter]) => (
                          <View key={label as string} style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, color: SILVER, marginBottom: 4 }}>{label as string}</Text>
                            <TextInput
                              value={value as string}
                              onChangeText={setter as (t: string) => void}
                              keyboardType="numeric"
                              style={FIELD}
                            />
                          </View>
                        ),
                      )}
                    </View>
                    <MealsEditor meals={meals} onAdd={addMeal} onRemove={removeMeal} onPatch={patchMeal} onPatchItem={patchMealItem} />
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 10 }}>
                      Días ({dietDays.length})
                    </Text>
                    {dietDays.map((day, di) => (
                      <View key={di} style={{ ...GLASS, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          {DAYS.map(d => (
                            <Pressable
                              key={d}
                              onPress={() => { Haptics.selectionAsync().catch(() => {}); patchDietDay(di, { day: d }); }}
                              style={{
                                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                                backgroundColor: day.day === d ? VOLT : "rgba(255,255,255,0.05)",
                              }}
                            >
                              <Text style={{ fontSize: 8, color: day.day === d ? "#000" : SILVER, fontWeight: "700" }}>{d.slice(0, 3)}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: "#52525b", marginBottom: 10 }}>
                          Se programará: {ordinalScheduleLabel(di, day.weekday)}
                        </Text>

                        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                          {([
                            ["Kcal", day.totalCalories, (v: number) => patchDietDay(di, { totalCalories: v })],
                            ["Prot (g)", day.macros.protein, (v: number) => patchDietDay(di, { macros: { ...day.macros, protein: v } })],
                            ["Carb (g)", day.macros.carbs, (v: number) => patchDietDay(di, { macros: { ...day.macros, carbs: v } })],
                            ["Gra (g)", day.macros.fat, (v: number) => patchDietDay(di, { macros: { ...day.macros, fat: v } })],
                          ] as const).map(([label, val, setter]) => (
                            <View key={label} style={{ flex: 1 }}>
                              <Text style={{ fontSize: 9, color: SILVER, marginBottom: 4 }}>{label}</Text>
                              <TextInput
                                value={String(val)}
                                onChangeText={t => setter(parseFloat(t) || 0)}
                                keyboardType="numeric"
                                style={FIELD}
                              />
                            </View>
                          ))}
                        </View>

                        <MealsEditor
                          meals={day.meals}
                          onAdd={() => addDietDayMeal(di)}
                          onRemove={mi => removeDietDayMeal(di, mi)}
                          onPatch={(mi, patch) => patchDietDayMeal(di, mi, patch)}
                          onPatchItem={(mi, ii, t) => patchDietDayMealItem(di, mi, ii, t)}
                        />

                        <TouchableOpacity onPress={() => removeDietDay(di)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                          <Trash2 size={12} color="#f87171" />
                          <Text style={{ fontSize: 10, color: "#f87171" }}>Eliminar día</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={addDietDay}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 12 }}
                    >
                      <Plus size={14} color={VOLT} />
                      <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>Añadir día</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 10 }}>
                  Días ({days.length})
                </Text>
                {days.map((day, di) => (
                  <View key={di} style={{ ...GLASS, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {DAYS.map(d => (
                          <Pressable
                            key={d}
                            onPress={() => { Haptics.selectionAsync().catch(() => {}); patchDay(di, { day: d }); }}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                              backgroundColor: day.day === d ? VOLT : "rgba(255,255,255,0.05)",
                            }}
                          >
                            <Text style={{ fontSize: 8, color: day.day === d ? "#000" : SILVER, fontWeight: "700" }}>{d.slice(0, 3)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: "#52525b", marginBottom: 8 }}>
                      Se programará: {ordinalScheduleLabel(di, day.weekday)}
                    </Text>
                    <TextInput
                      value={day.label}
                      onChangeText={t => patchDay(di, { label: t })}
                      placeholder="Etiqueta (Push)"
                      placeholderTextColor="#52525b"
                      style={{ ...FIELD, marginBottom: 8 }}
                    />
                    <TextInput
                      value={day.muscleGroup}
                      onChangeText={t => patchDay(di, { muscleGroup: t })}
                      placeholder="Grupo muscular (Pecho · Hombro · Tríceps)"
                      placeholderTextColor="#52525b"
                      style={{ ...FIELD, marginBottom: 10 }}
                    />

                    {day.exercises.map((ex, ei) => (
                      <View key={ei} style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <Text className="font-bold" style={{ fontSize: 12, color: "#fff", flex: 1 }} numberOfLines={1}>
                            {ex.name}{ex.bodyweight ? " · pc" : ""}
                          </Text>
                          <TouchableOpacity onPress={() => removeExercise(di, ei)} hitSlop={8}>
                            <Trash2 size={13} color="#f87171" />
                          </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <TextInput
                            value={String(ex.sets)}
                            onChangeText={t => patchExercise(di, ei, { sets: parseInt(t, 10) || 0 })}
                            placeholder="Sets"
                            placeholderTextColor="#52525b"
                            keyboardType="numeric"
                            style={{ ...FIELD, flex: 1, paddingVertical: 8 }}
                          />
                          <TextInput
                            value={ex.reps}
                            onChangeText={t => patchExercise(di, ei, { reps: t })}
                            placeholder="Reps"
                            placeholderTextColor="#52525b"
                            style={{ ...FIELD, flex: 1, paddingVertical: 8 }}
                          />
                          <TextInput
                            value={ex.weight ?? ""}
                            onChangeText={t => patchExercise(di, ei, { weight: t })}
                            placeholder="Peso"
                            placeholderTextColor="#52525b"
                            style={{ ...FIELD, flex: 1, paddingVertical: 8 }}
                          />
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setPickerOpenFor(di)}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 10, marginTop: 4 }}
                    >
                      <Plus size={12} color={VOLT} />
                      <Text className="font-bold" style={{ fontSize: 10, color: VOLT }}>+ Ejercicio (del catálogo)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => removeDay(di)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                      <Trash2 size={12} color="#f87171" />
                      <Text style={{ fontSize: 10, color: "#f87171" }}>Eliminar día</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={addDay}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 12 }}
                >
                  <Plus size={14} color={VOLT} />
                  <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>Añadir día</Text>
                </TouchableOpacity>
              </>
            )}

            {error && (
              <Text style={{ fontSize: 11, color: "#f87171", marginTop: 14, textAlign: "center" }}>{error}</Text>
            )}
          </ScrollView>

          <View style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!canSave || saving}
              onPress={save}
              style={{
                height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
                flexDirection: "row", gap: 8,
                backgroundColor: VOLT, opacity: !canSave || saving ? 0.4 : 1,
              }}
            >
              {saving && <ActivityIndicator size="small" color="#000" />}
              <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>
                {saving ? "Guardando..." : "Guardar plantilla"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {mode === "routine" && (
        <ExercisePicker
          visible={pickerOpenFor !== null}
          onClose={() => setPickerOpenFor(null)}
          onConfirm={chosen => { if (pickerOpenFor !== null) addExercisesFromCatalog(pickerOpenFor, chosen); }}
        />
      )}
    </Modal>
  );
}
