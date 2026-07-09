import {
  View, Text, TextInput, TouchableOpacity, Pressable, Modal, FlatList, ActivityIndicator,
} from "react-native";
import { useState, useEffect, useMemo, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Search, Check, X } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { fetchEjercicios, MUSCLE_GROUPS, type EjercicioDTO } from "@/lib/coach";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

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
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.92)", paddingTop: 60 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}>
          <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>Elegir ejercicios</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
            <X size={22} color={SILVER} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={{
            ...GLASS, borderRadius: 12, marginHorizontal: 20, marginBottom: 12,
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

        {/* Group filter chips */}
        <FlatList
          horizontal
          data={["Todos", ...MUSCLE_GROUPS]}
          keyExtractor={g => g}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 14 }}
          renderItem={({ item: g }) => {
            const active = group === g;
            return (
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setGroup(g); }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: active ? VOLT : "rgba(255,255,255,0.05)",
                  borderWidth: 1, borderColor: active ? VOLT : "rgba(255,255,255,0.1)",
                }}
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
          <View style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={selected.size === 0}
              onPress={confirm}
              style={{
                height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
                backgroundColor: VOLT, opacity: selected.size === 0 ? 0.35 : 1,
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
