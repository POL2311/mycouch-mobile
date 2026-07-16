import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useCallback } from "react";
import { Plus, X, Trash2 } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { assignStudentDiet, type DietData, type DietMeal } from "@/lib/coach";

// Official palette (§3 of the assignment spec) — mirrored locally, same
// convention as TemplateEditorModal/ChangeStageModal, since components/coach
// sits outside the (coach) route group's _layout.tsx.
const VOLT    = "#CCFF00";
const CARD_BG = "#0F0F10";
const BORDER  = "#2C2C2E";
const MUTED   = "#8E8E93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const FIELD = {
  backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13,
} as const;

const EMPTY_MEAL = (): DietMeal => ({ name: "", time: "", calories: 0, protein: 0, carbs: 0, fat: 0, items: [] });

// items[] (one ingredient per line elsewhere in the app, e.g. TemplateEditorModal)
// is edited here as a single free-text "Descripción/Ingredientes" box, per the
// assignment spec's wording — split back into items[] on save so the shape
// written to dietJson is identical to what templates and the student portal
// already expect (DietMeal.items: string[]).
function descriptionFor(meal: DietMeal): string {
  return meal.items.join("\n");
}

interface Props {
  visible: boolean;
  studentId: string;
  // Pass the student's currently-parsed diet (parseDiet(student.dietJson)) to
  // pre-fill for editing; omit/pass the "Dieta no asignada" placeholder for a
  // fresh assignment — both render the same form.
  initialDiet?: DietData;
  onClose: () => void;
  onSaved: (diet: DietData) => void;
}

export default function AssignDietModal({ visible, studentId, initialDiet, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const hasInitial = !!initialDiet && initialDiet.name !== "Dieta no asignada";

  const [name, setName]                   = useState(hasInitial ? initialDiet!.name : "");
  const [totalCalories, setTotalCalories] = useState(hasInitial ? String(initialDiet!.totalCalories) : "");
  const [protein, setProtein]             = useState(hasInitial ? String(initialDiet!.macros.protein) : "");
  const [carbs, setCarbs]                 = useState(hasInitial ? String(initialDiet!.macros.carbs) : "");
  const [fat, setFat]                     = useState(hasInitial ? String(initialDiet!.macros.fat) : "");
  const [meals, setMeals] = useState<DietMeal[]>(
    hasInitial && initialDiet!.meals.length > 0 ? initialDiet!.meals : [EMPTY_MEAL()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const canSave = name.trim().length > 0;

  const addMeal    = useCallback(() => setMeals(m => [...m, EMPTY_MEAL()]), []);
  const removeMeal = useCallback((i: number) => setMeals(m => m.filter((_, idx) => idx !== i)), []);
  const patchMeal   = useCallback((i: number, patch: Partial<DietMeal>) => {
    setMeals(m => m.map((meal, idx) => idx === i ? { ...meal, ...patch } : meal));
  }, []);
  const patchDescription = useCallback((i: number, text: string) => {
    setMeals(m => m.map((meal, idx) => idx === i ? { ...meal, items: text.split("\n") } : meal));
  }, []);

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    setSaving(true);
    setError(null);
    try {
      const cleanedMeals = meals
        .filter(m => m.name.trim().length > 0)
        .map(m => ({ ...m, name: m.name.trim(), items: m.items.map(i => i.trim()).filter(Boolean) }));
      const diet: DietData = {
        name: name.trim(),
        totalCalories: parseFloat(totalCalories) || 0,
        macros: {
          protein: parseFloat(protein) || 0,
          carbs: parseFloat(carbs) || 0,
          fat: parseFloat(fat) || 0,
        },
        meals: cleanedMeals,
      };
      // PUT /api/students/[id] { detailUpdates: { diet } } → backend does
      // JSON.stringify(diet) into dietJson directly (src/lib/db.ts
      // updateStudent) — same field the student's /api/mobile/portal reads
      // back and normalises for the Nutrición tab.
      await assignStudentDiet(studentId, diet, token);
      onSaved(diet);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la dieta.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, studentId, name, totalCalories, protein, carbs, fat, meals, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", paddingTop: 60 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 18 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>
              {hasInitial ? "Editar dieta" : "Asignar dieta"}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
              <X size={22} color={MUTED} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 6 }}>
              Nombre del plan
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ej. Hipertrofia Limpia"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, marginBottom: 18 }}
            />

            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 6 }}>
              Objetivos diarios
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
              {([
                ["Kcal", totalCalories, setTotalCalories],
                ["Prot (g)", protein, setProtein],
                ["Carb (g)", carbs, setCarbs],
                ["Gra (g)", fat, setFat],
              ] as const).map(([label, value, setter]) => (
                <View key={label} style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>{label}</Text>
                  <TextInput
                    value={value}
                    onChangeText={setter}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#52525b"
                    style={FIELD}
                  />
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 10 }}>
              Comidas ({meals.length})
            </Text>
            {meals.map((meal, mi) => (
              <View key={mi} style={{ backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={meal.name}
                    onChangeText={t => patchMeal(mi, { name: t })}
                    placeholder="Nombre (Desayuno Anabólico)"
                    placeholderTextColor="#52525b"
                    style={{ ...FIELD, flex: 2 }}
                  />
                  <TextInput
                    value={meal.time}
                    onChangeText={t => patchMeal(mi, { time: t })}
                    placeholder="Hora"
                    placeholderTextColor="#52525b"
                    style={{ ...FIELD, flex: 1 }}
                  />
                </View>
                <TextInput
                  value={String(meal.calories || "")}
                  onChangeText={t => patchMeal(mi, { calories: parseFloat(t) || 0 })}
                  placeholder="Kcal de esta comida (opcional)"
                  placeholderTextColor="#52525b"
                  keyboardType="numeric"
                  style={{ ...FIELD, marginBottom: 8 }}
                />
                <TextInput
                  value={descriptionFor(meal)}
                  onChangeText={t => patchDescription(mi, t)}
                  placeholder={"Descripción / ingredientes (uno por línea)\nEj. 4 claras + 2 huevos enteros\nAvena 60g"}
                  placeholderTextColor="#52525b"
                  multiline
                  numberOfLines={3}
                  style={{ ...FIELD, minHeight: 72, textAlignVertical: "top" }}
                />
                <TouchableOpacity onPress={() => removeMeal(mi)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <Trash2 size={12} color="#f87171" />
                  <Text style={{ fontSize: 10, color: "#f87171" }}>Eliminar comida</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={addMeal}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 12 }}
            >
              <Plus size={14} color={VOLT} />
              <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>Añadir comida</Text>
            </TouchableOpacity>

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
                {saving ? "Guardando..." : hasInitial ? "Guardar cambios" : "Asignar dieta"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
