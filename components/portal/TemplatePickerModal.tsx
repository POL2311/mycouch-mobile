import { View, Text, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback } from "react";
import { X, Dumbbell, Utensils, Check } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { fetchTemplates, type StoredTemplate, type TemplateType } from "@/lib/coach";
import { triggerImpact, triggerSuccess, triggerWarning } from "@/lib/haptics";

// ── Módulo 2 "Auto-Entrenador" — selector de plantillas reales del catálogo
// (GET /api/templates, accesible a cualquier usuario autenticado sin filtro
// de rol) compartido entre Workout ("+ CREAR MI RUTINA") y Dieta
// ("+ CARGAR MI DIETA"). Aplicar una plantilla la persiste SOLO en este
// dispositivo (lib/selfCoach.tsx) — nunca se presenta como guardada en el
// servidor, porque no existe endpoint CLIENT para eso.
const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = { backgroundColor: "rgba(28, 28, 30, 0.4)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)" } as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

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

  useEffect(() => {
    if (!visible || !token) return;
    setLoading(true);
    setError(false);
    fetchTemplates(type, token)
      .then(setTemplates)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [visible, type, token]);

  const apply = useCallback(async (tpl: StoredTemplate) => {
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
  }, [onApply, onClose]);

  const title = type === "routine" ? "CATÁLOGO DE RUTINAS" : "CATÁLOGO DE DIETAS";
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

        <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: SILVER, paddingHorizontal: 20, marginBottom: 14, lineHeight: 14 }}>
          Modo auto-entrenador — elige una plantilla real del catálogo. Se guarda solo en este dispositivo; no tienes coach vinculado que la sincronice.
        </Text>

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
          ) : templates.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text className="font-mono text-center" style={{ fontSize: 10, color: SILVER, lineHeight: 16 }}>
                SIN PLANTILLAS DISPONIBLES EN EL CATÁLOGO TODAVÍA
              </Text>
            </View>
          ) : (
            templates.map(tpl => {
              const sub = tpl.type === "routine"
                ? `${tpl.daysPerWeek} DÍAS/SEMANA · ${tpl.days.reduce((n, d) => n + d.exercises.length, 0)} EJERCICIOS`
                : `${tpl.totalCalories} KCAL · ${tpl.meals.length} COMIDAS`;
              const applying = applyingId === tpl.id;
              return (
                <Pressable
                  key={tpl.id}
                  onPress={() => { triggerImpact(); apply(tpl); }}
                  disabled={applying}
                  style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, opacity: applying ? 0.6 : 1 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text className="font-black uppercase" style={{ fontSize: 13, color: "#fff" }}>{tpl.name}</Text>
                    <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: SILVER, marginTop: 3 }}>{sub}</Text>
                  </View>
                  {applying ? <ActivityIndicator size="small" color={VOLT} /> : <Check size={16} color={VOLT} />}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
