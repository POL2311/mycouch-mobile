import { View, Text, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Dumbbell, Utensils, Check, Download } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { fetchTemplates, type StoredTemplate, type TemplateType } from "@/lib/coach";
import { triggerImpact, triggerSuccess, triggerWarning } from "@/lib/haptics";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = { backgroundColor: "rgba(28, 28, 30, 0.4)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)" } as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const CATEGORIES = ["TODAS", "HIPERTROFIA", "PÉRDIDA DE GRASA", "CALISTENIA / EN CASA", "FUERZA"] as const;

function deriveCategory(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("HIPERTROFIA") || upper.includes("VOLUMEN")) return "HIPERTROFIA";
  if (upper.includes("GRASA") || upper.includes("DEFINICIÓN")) return "PÉRDIDA DE GRASA";
  if (upper.includes("CALISTENIA") || upper.includes("CASA")) return "CALISTENIA / EN CASA";
  if (upper.includes("FUERZA") || upper.includes("LIFT")) return "FUERZA";
  return "GENERAL";
}

function deriveDifficulty(tpl: StoredTemplate): { label: string; color: string } {
  if (tpl.type === "routine") {
    if (tpl.daysPerWeek <= 3) return { label: "PRINCIPIANTE", color: "#4ade80" }; // Green
    if (tpl.daysPerWeek === 4) return { label: "INTERMEDIO", color: "#facc15" }; // Yellow
    return { label: "AVANZADO", color: "#f87171" }; // Red
  } else {
    // Diet
    if (tpl.totalCalories < 1800) return { label: "DÉFICIT ESTRICTO", color: "#f87171" };
    if (tpl.totalCalories > 2500) return { label: "VOLUMEN", color: "#a78bfa" };
    return { label: "ESTÁNDAR", color: "#2dd4bf" };
  }
}

export function TemplatePickerModal({ visible, onClose, type, onApply }: {
  visible: boolean;
  onClose: () => void;
  type: TemplateType;
  onApply: (tpl: StoredTemplate) => Promise<void>;
}) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("TODAS");

  useEffect(() => {
    if (!visible || !token) return;
    setLoading(true);
    setError(false);
    fetchTemplates(type, token)
      .then(setTemplates)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [visible, type, token]);

  const confirmAndApply = useCallback((tpl: StoredTemplate) => {
    Alert.alert(
      "Confirmación",
      `¿Deseas reemplazar tu ${type === "routine" ? "rutina" : "dieta"} activa actual por esta plantilla?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Reemplazar", 
          style: "default",
          onPress: async () => {
            setApplyingId(tpl.id);
            try {
              await onApply(tpl);
              triggerSuccess();
              onClose();
            } catch {
              triggerWarning();
            } finally {
              setApplyingId(null);
            }
          }
        }
      ]
    );
  }, [onApply, onClose, type]);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === "TODAS") return templates;
    return templates.filter(t => deriveCategory(t.name) === activeCategory);
  }, [templates, activeCategory]);

  const title = type === "routine" ? "EXPLORAR PLANTILLAS GRATUITAS" : "CATÁLOGO DE DIETAS";
  const Icon  = type === "routine" ? Dumbbell : Utensils;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.97)", paddingTop: insets.top + 12, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon size={16} color={VOLT} />
            <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>{title}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)" }}
          >
            <X size={12} color={VOLT} />
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
          </TouchableOpacity>
        </View>

        {type === "routine" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 16 }}>
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  activeOpacity={0.8}
                  onPress={() => { triggerImpact(); setActiveCategory(cat); }}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: isActive ? VOLT : "rgba(255,255,255,0.05)",
                    borderWidth: 1, borderColor: isActive ? VOLT : "rgba(255,255,255,0.1)"
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: isActive ? "#000" : SILVER, textTransform: "uppercase" }}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="small" color={VOLT} />
            </View>
          ) : error ? (
            <View style={{ ...GLASS, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text className="font-mono text-center" style={{ fontSize: 10, color: "#f87171", lineHeight: 16 }}>
                [ ERROR // NO SE PUDO CARGAR EL CATÁLOGO ]
              </Text>
            </View>
          ) : filteredTemplates.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text className="font-mono text-center" style={{ fontSize: 10, color: SILVER, lineHeight: 16 }}>
                SIN PLANTILLAS DISPONIBLES PARA ESTA CATEGORÍA
              </Text>
            </View>
          ) : (
            filteredTemplates.map(tpl => {
              const totalEx = tpl.type === "routine" ? tpl.days.reduce((n, d) => n + d.exercises.length, 0) : 0;
              const sub = tpl.type === "routine"
                ? `${tpl.daysPerWeek} días/semana • ${totalEx} ejercicios en total`
                : `${tpl.totalCalories} KCAL · ${tpl.meals.length} COMIDAS`;
              
              const applying = applyingId === tpl.id;
              const diff = deriveDifficulty(tpl);

              return (
                <View key={tpl.id} style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <Text className="font-black uppercase" style={{ fontSize: 15, color: "#fff", flex: 1, paddingRight: 8 }}>{tpl.name}</Text>
                    <View style={{ backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: diff.color, letterSpacing: 0.5 }}>
                        {diff.label}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={{ fontSize: 12, color: SILVER, marginBottom: 14 }}>{sub}</Text>
                  
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={applying}
                    onPress={() => { triggerImpact(); confirmAndApply(tpl); }}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      backgroundColor: applying ? "rgba(204,255,0,0.5)" : VOLT,
                      paddingVertical: 12, borderRadius: 12
                    }}
                  >
                    {applying ? <ActivityIndicator size="small" color="#000" /> : (
                      <>
                        <Download size={14} color="#000" />
                        <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>USAR ESTA PLANTILLA</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
