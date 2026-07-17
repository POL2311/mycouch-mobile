import { View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import { router } from "expo-router";
import { Plus, Boxes } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { fetchTemplates, type TemplateType, type StoredTemplate, type StoredDietTemplate, type StoredRoutineTemplate } from "@/lib/coach";
import TemplateEditorModal from "@/components/coach/TemplateEditorModal";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Segmented macro bar — gram-proportional spans, verbatim §2A color triad
// (protein cyan, carbs light-blue, fat volt).
function MacroSpanBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const total = Math.max(protein + carbs + fat, 1);
  const segs = [
    { label: `P: ${protein}g`, grams: protein, color: "#40E0D0" },
    { label: `C: ${carbs}g`,   grams: carbs,   color: "#60a5fa" },
    { label: `G: ${fat}g`,     grams: fat,     color: VOLT },
  ];
  return (
    <View>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#1C1C1E" }}>
        {segs.map(s => (
          <View key={s.label} style={{ flex: s.grams / total, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
        {segs.map(s => (
          <Text key={s.label} className="font-mono" style={{ fontSize: 9, color: s.color }}>{s.label}</Text>
        ))}
      </View>
    </View>
  );
}

export default function PlantillasScreen() {
  const { token } = useAuth();
  const [mode, setMode] = useState<TemplateType>("diet");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<StoredTemplate | undefined>(undefined);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetchTemplates(mode, token)
      .then(rows => setTemplates(Array.isArray(rows) ? rows : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [token, mode]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter(t => q === "" || t.name.toLowerCase().includes(q));
  }, [templates, query]);

  const openCreate = useCallback(() => { setEditing(undefined); setEditorOpen(true); }, []);
  const openEdit = useCallback((t: StoredTemplate) => { setEditing(t); setEditorOpen(true); }, []);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, marginBottom: 14 }}>
        <Text style={{ ...athletic, fontSize: 24, color: "#fff" }}>Plantillas</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(coach)/catalogo")} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Boxes size={15} color={SILVER} />
            <Text className="font-bold" style={{ fontSize: 11, color: SILVER }}>Gestionar catálogo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={openCreate}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: VOLT, alignItems: "center", justifyContent: "center" }}
          >
            <Plus size={17} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Alimentación / Entrenamiento segmented switch */}
      <View style={{ flexDirection: "row", backgroundColor: "#151517", borderRadius: 12, marginHorizontal: 20, padding: 3, marginBottom: 14 }}>
        {(["diet", "routine"] as TemplateType[]).map(m => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: active ? "#2C2C2E" : "transparent" }}
            >
              <Text className="font-black" style={{ fontSize: 12, color: active ? "#fff" : SILVER }}>
                {m === "diet" ? "Alimentación" : "Entrenamiento"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ ...GLASS, borderRadius: 12, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 14, height: 44, justifyContent: "center" }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar plantilla..."
          placeholderTextColor="#52525b"
          style={{ color: "#fff", fontSize: 13 }}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 && (
            <View style={{ ...GLASS, borderRadius: 14, paddingVertical: 40, alignItems: "center" }}>
              <Text className="text-center" style={{ fontSize: 12, color: SILVER, lineHeight: 18, paddingHorizontal: 20 }}>
                Tu catálogo está vacío. Créalo en Plantillas → Catálogo.
              </Text>
            </View>
          )}
          {filtered.map(t => {
            if (t.type === "diet") {
              const diet = t as StoredDietTemplate;
              // stage-ish label inferred from the plan name (Volumen/Definición/
              // Recomposición/Mantenimiento) — the diet snapshot itself carries no
              // stage field, only the coach's naming convention does.
              const stageHint = ["Volumen", "Definición", "Mantenimiento", "Recomposición"].find(s => diet.name.includes(s));
              return (
                <TouchableOpacity key={diet.id} activeOpacity={0.8} onPress={() => openEdit(diet)} style={{ ...GLASS, borderRadius: 16, padding: 16 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <Text className="font-bold" style={{ fontSize: 14, color: "#fff", flex: 1, paddingRight: 10 }}>{diet.name}</Text>
                    <Text className="font-black" style={{ fontSize: 12, color: VOLT }}>🔥 {diet.totalCalories} kcal</Text>
                  </View>
                  <MacroSpanBar protein={diet.macros.protein} carbs={diet.macros.carbs} fat={diet.macros.fat} />
                  <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 10 }}>
                    {diet.meals.length} comidas{stageHint ? ` · ${stageHint}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            }
            const routine = t as StoredRoutineTemplate;
            const groups = [...new Set(routine.days.map(d => d.muscleGroup).filter(Boolean))].join(" · ");
            return (
              <TouchableOpacity key={routine.id} activeOpacity={0.8} onPress={() => openEdit(routine)} style={{ ...GLASS, borderRadius: 16, padding: 16 }}>
                <Text className="font-bold" style={{ fontSize: 14, color: "#fff", marginBottom: 6 }}>{routine.name}</Text>
                <Text className="font-mono" style={{ fontSize: 9, color: SILVER }} numberOfLines={1}>
                  {groups || "Sin grupos musculares"}
                </Text>
                <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 8 }}>
                  {routine.daysPerWeek} días/sem
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <TemplateEditorModal
        visible={editorOpen}
        mode={mode}
        existing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={load}
      />
    </SafeAreaView>
  );
}
