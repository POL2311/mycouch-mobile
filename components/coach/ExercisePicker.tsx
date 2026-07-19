import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal, FlatList, ActivityIndicator,
} from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Search, Check, X } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { fetchEjercicios, MUSCLE_GROUPS, type EjercicioDTO } from "@/lib/coach";

const BG     = "#000000";
const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const CARD_BG = "#1C1C1E";
const BORDER  = "#2C2C2E";
const GLASS  = {
  backgroundColor: CARD_BG,
  borderWidth: 1,
  borderColor: BORDER,
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Cápsula de altura FIJA — mismo criterio que en AssignDietModal/
// AssignRoutineModal/TemplateEditorModal: un chip sin height propio dentro
// de una lista horizontal sin height propio hereda el estirado vertical del
// padre en cuanto ese padre mide más de lo esperado.
const CHIP_H = 40;
const chipStyle = (active: boolean) => ({
  height: CHIP_H, paddingHorizontal: 16, borderRadius: 20,
  alignItems: "center" as const, justifyContent: "center" as const,
  backgroundColor: active ? VOLT : "rgba(255,255,255,0.05)",
  borderWidth: 1, borderColor: active ? VOLT : "rgba(255,255,255,0.1)",
});

// ── §2A "+ Ejercicio (del catálogo)" multi-select drawer — search + the 8
// canonical muscle-group filter chips ("Todos" + MUSCLE_GROUPS), verbatim
// copy per blueprint §4.4. ───────────────────────────────────────────────────
export default function ExercisePicker({ visible, onClose, onConfirm, readOnly }: {
  visible: boolean;
  onClose: () => void;
  onConfirm?: (chosen: EjercicioDTO[]) => void;
  // Browse-only mode for the "𝌡 Catálogo" viewer link — hides selection
  // checkboxes and the confirm bar entirely.
  readOnly?: boolean;
}) {
  const { token } = useAuth();
  const [catalog,  setCatalog]  = useState<EjercicioDTO[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState("");
  const [group,    setGroup]    = useState<string>("Todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible || !token) return;
    setLoading(true);
    fetchEjercicios(token)
      .then(rows => setCatalog(Array.isArray(rows) ? rows : []))
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  }, [visible, token]);

  useEffect(() => { if (!visible) { setQuery(""); setGroup("Todos"); setSelected(new Set()); } }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter(e => group === "Todos" || e.muscleGroup === group)
      .filter(e => q === "" || e.name.toLowerCase().includes(q));
  }, [catalog, group, query]);

  const toggle = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    onConfirm?.(catalog.filter(e => selected.has(e.id)));
    onClose();
  }, [catalog, selected, onConfirm, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG, paddingTop: 60 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}>
          <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>Elegir ejercicios</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
            <X size={22} color={SILVER} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={{
            ...GLASS, borderRadius: 10, marginHorizontal: 20, marginBottom: 12,
            flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 44,
          }}
        >
          <Search size={15} color={SILVER} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar…"
            placeholderTextColor="#52525b"
            style={{ flex: 1, marginLeft: 8, color: "#fff", fontSize: 13 }}
          />
        </View>

        {/* Group filter chips — altura fija, nunca se deforma */}
        <FlatList
          horizontal
          data={["Todos", ...MUSCLE_GROUPS]}
          keyExtractor={g => g}
          showsHorizontalScrollIndicator={false}
          style={{ height: CHIP_H, flexGrow: 0, marginBottom: 14 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: "center" }}
          renderItem={({ item: g }) => {
            const active = group === g;
            return (
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setGroup(g); }}
                style={chipStyle(active)}
              >
                <Text className="font-bold" style={{ fontSize: 11, color: active ? "#000" : "#d4d4d8" }}>{g}</Text>
              </Pressable>
            );
          }}
        />

        {/* Results */}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={VOLT} />
          </View>
        ) : catalog.length === 0 ? (
          <View style={{ paddingHorizontal: 20, alignItems: "center", marginTop: 40 }}>
            <Text className="text-center" style={{ fontSize: 12, color: SILVER, lineHeight: 18 }}>
              Tu catálogo está vacío. Créalo en Plantillas → Catálogo.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingHorizontal: 20, alignItems: "center", marginTop: 40 }}>
            <Text style={{ fontSize: 12, color: SILVER }}>Sin resultados</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={e => e.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 8 }}
            renderItem={({ item }) => {
              const sel = selected.has(item.id);
              return (
                <TouchableOpacity
                  activeOpacity={readOnly ? 1 : 0.7}
                  disabled={readOnly}
                  onPress={() => toggle(item.id)}
                  style={{
                    ...GLASS, borderRadius: 12, padding: 12,
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    borderColor: sel ? VOLT : GLASS.borderColor,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }}>
                      {item.name}{item.bodyweight ? " · peso corporal" : ""}
                    </Text>
                    <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 2, letterSpacing: 0.5 }}>
                      {item.muscleGroup} · {item.equipment}
                    </Text>
                  </View>
                  {!readOnly && (
                    <View
                      style={{
                        width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
                        backgroundColor: sel ? VOLT : "transparent", borderWidth: 1.5, borderColor: sel ? VOLT : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {sel && <Check size={13} color="#000" strokeWidth={3} />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Confirm */}
        {!readOnly && (
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" }}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={selected.size === 0}
              onPress={confirm}
              style={{
                width: "88%", alignSelf: "center", borderRadius: 25, height: 50,
                justifyContent: "center", alignItems: "center",
                backgroundColor: VOLT, marginBottom: 20,
                shadowColor: VOLT, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
                elevation: 6,
                opacity: selected.size === 0 ? 0.35 : 1,
              }}
            >
              <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Agregar ({selected.size})</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
