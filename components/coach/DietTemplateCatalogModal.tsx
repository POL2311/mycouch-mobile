import {
  View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { Utensils, X, ClipboardList } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { fetchTemplates, assignStudentDiet, type StoredDietTemplate } from "@/lib/coach";
import { parseDietaJson, type DietaJson } from "@/types/coach-client";

// ── Catálogo visual de plantillas de dieta — "Cargar Plantilla de
// Alimentación" en la pestaña Nutrición del Coach. Reemplaza el listado de
// texto plano que vivía dentro de ChangeStageModal (removido ahí): cada
// plantilla se ve como una tarjeta premium con sus macros y comidas, no una
// fila de una línea. Al elegir una, se asigna DIRECTO al alumno (mismo
// mecanismo que AssignDietModal — PUT /api/students/[id]), no crea una
// nueva plantilla ni abre un segundo editor. ─────────────────────────────────
const BG      = "#000000";
const CARD_BG = "#0F0F10";
const BORDER  = "#2C2C2E";
const VOLT    = "#CCFF00";
const MUTED   = "#8E8E93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

interface Props {
  visible: boolean;
  studentId: string;
  onClose: () => void;
  // Mismo contrato que AssignDietModal.onSaved — el padre hace el mismo
  // patchStudent(dietJson)+reloadDetail() para ambos caminos.
  onAssigned: (dieta: DietaJson) => void;
}

export default function DietTemplateCatalogModal({ visible, studentId, onClose, onAssigned }: Props) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<StoredDietTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !token) return;
    setLoading(true);
    setError(null);
    fetchTemplates("diet", token)
      .then(rows => setTemplates(rows.filter((t): t is StoredDietTemplate => t.type === "diet")))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [visible, token]);

  // parseDietaJson ya sabe migrar el formato plano de una StoredDietTemplate
  // (name/totalCalories/macros/meals, sin configuracionPorDia) replicándolo
  // en los 7 días — es exactamente lo que necesitamos aquí, cero lógica de
  // conversión nueva (ver types/coach-client.ts).
  const selectTemplate = useCallback(async (t: StoredDietTemplate) => {
    if (!token || assigningId) return;
    setAssigningId(t.id);
    setError(null);
    try {
      const dieta = parseDietaJson(t);
      await assignStudentDiet(studentId, dieta, token);
      onAssigned(dieta);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la plantilla.");
    } finally {
      setAssigningId(null);
    }
  }, [token, studentId, assigningId, onAssigned, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG, paddingTop: 60 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ClipboardList size={18} color={VOLT} />
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>Plantillas de alimentación</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
            <X size={22} color={MUTED} />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: MUTED, paddingHorizontal: 20, marginBottom: 18, lineHeight: 17 }}>
          Toca una plantilla para asignarla directo a este alumno — reemplaza su dieta actual.
        </Text>

        {loading ? (
          <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
        ) : templates.length === 0 ? (
          <View style={{ paddingHorizontal: 20, alignItems: "center", marginTop: 40 }}>
            <Text className="text-center" style={{ fontSize: 12, color: MUTED, lineHeight: 18 }}>
              Aún no tienes plantillas de dieta en tu catálogo. Créalas en Plantillas.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {templates.map(t => {
              const isAssigning = assigningId === t.id;
              const dimmed = !!assigningId && !isAssigning;
              return (
                <TouchableOpacity
                  key={t.id}
                  activeOpacity={0.85}
                  disabled={!!assigningId}
                  onPress={() => selectTemplate(t)}
                  style={{
                    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 18,
                    padding: 16, marginBottom: 14, opacity: dimmed ? 0.4 : 1,
                  }}
                >
                  {/* Nombre del plan */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#FFFFFF", flex: 1 }} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {isAssigning && <ActivityIndicator size="small" color={VOLT} />}
                  </View>

                  {/* Banner de macros */}
                  <View style={{ flexDirection: "row", backgroundColor: "#000000", borderRadius: 12, paddingVertical: 10, marginBottom: 12 }}>
                    {([
                      ["Kcal", t.totalCalories],
                      ["Prot (g)", t.macros.protein],
                      ["Carb (g)", t.macros.carbs],
                      ["Gra (g)", t.macros.fat],
                    ] as const).map(([label, value]) => (
                      <View key={label} style={{ flex: 1, alignItems: "center" }}>
                        <Text className="font-black" style={{ fontSize: 16, color: VOLT }}>{value}</Text>
                        <Text className="font-mono" style={{ fontSize: 8, color: MUTED, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Comidas incluidas */}
                  {t.meals.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {t.meals.map((m, i) => (
                        <View
                          key={i}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 4,
                            backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8,
                            paddingHorizontal: 8, paddingVertical: 5,
                          }}
                        >
                          <Utensils size={10} color={MUTED} />
                          <Text style={{ fontSize: 10, color: "#d4d4d8" }}>{m.name || "Comida"}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {error && (
              <Text style={{ fontSize: 11, color: "#f87171", marginTop: 6, textAlign: "center" }}>{error}</Text>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
