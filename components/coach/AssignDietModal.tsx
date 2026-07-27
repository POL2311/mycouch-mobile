import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { Plus, X, Trash2 } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { assignStudentDiet } from "@/lib/coach";
import {
  DIAS_SEMANA, DIA_LABEL, diaSemanaDeHoy, dietaEstaVacia, genCoachClientId,
  type DiaSemana, type DietaJson, type ConfiguracionDiaDieta, type Comida,
} from "@/types/coach-client";

// Official palette (§3 of the assignment spec) — mirrored locally, same
// convention as TemplateEditorModal/ChangeStageModal, since components/coach
// sits outside the (coach) route group's _layout.tsx.
const BG      = "#000000";
const VOLT    = "#CCFF00";
const CARD_BG = "#1C1C1E";
const BORDER  = "#2C2C2E";
const MUTED   = "#8E8E93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const FIELD = {
  backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13,
} as const;

// Cápsula de selección de altura FIJA — nunca paddingVertical. Un chip sin
// height explícito, dentro de un ScrollView horizontal sin height propio,
// hereda `alignItems: "stretch"` del row por defecto: si el ScrollView
// termina midiendo más alto de lo esperado (fácil dentro de un
// KeyboardAvoidingView + Modal), el chip se estira para llenarlo — invisible
// mientras está inactivo (fondo oscuro), pero grotescamente visible en el
// verde neón activo. height fijo hace que sea físicamente imposible que se
// deforme, sin importar qué haga el padre.
const CHIP_H = 40;
const chipStyle = (active: boolean) => ({
  height: CHIP_H, paddingHorizontal: 16, borderRadius: 20,
  alignItems: "center" as const, justifyContent: "center" as const,
  flexDirection: "row" as const, gap: 6,
  backgroundColor: active ? VOLT : CARD_BG,
  borderWidth: 1, borderColor: active ? VOLT : BORDER,
});

// Lunes-primero para la barra de días — el modelo de datos en sí no depende
// de este orden (configuracionPorDia es un objeto, no un arreglo).
const ORDEN_TABS: DiaSemana[] = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

const EMPTY_COMIDA = (): Comida => ({
  id: genCoachClientId("comida"), hora: "", nombre: "", descripcion: "", kcal: 0,
  macros: { protein: 0, carbs: 0, fat: 0 },
});

function descriptionFor(c: Comida): string {
  return c.descripcion;
}

interface Props {
  visible: boolean;
  studentId: string;
  // Siempre la dieta ya parseada (parseDietaJson(student.dietJson)) — puede
  // venir vacía (emptyDietaJson()) para una primera asignación; ambos casos
  // usan el mismo formulario.
  initialDieta: DietaJson;
  onClose: () => void;
  onSaved: (dieta: DietaJson) => void;
}

export default function AssignDietModal({ visible, studentId, initialDieta, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const hasInitial = !dietaEstaVacia(initialDieta);

  const [nombre, setNombre] = useState(hasInitial ? initialDieta.nombre : "");
  const [dias, setDias] = useState<Record<DiaSemana, ConfiguracionDiaDieta>>(
    () => ({ ...initialDieta.configuracionPorDia }),
  );
  const [selectedDia, setSelectedDia] = useState<DiaSemana>(diaSemanaDeHoy());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const hasInit = !dietaEstaVacia(initialDieta);
      setNombre(hasInit ? initialDieta.nombre : "");
      setDias({ ...initialDieta.configuracionPorDia });
      setSelectedDia(diaSemanaDeHoy());
      setSaving(false);
      setError(null);
    }
  }, [visible, initialDieta]);

  const dia = dias[selectedDia];
  const canSave = nombre.trim().length > 0;

  const patchDia = useCallback((patch: Partial<ConfiguracionDiaDieta>) => {
    setDias(d => ({ ...d, [selectedDia]: { ...d[selectedDia]!, ...patch } }));
  }, [selectedDia]);

  const addComida = useCallback(() => {
    patchDia({ comidas: [...dia!.comidas, EMPTY_COMIDA()] });
  }, [dia, patchDia]);
  const removeComida = useCallback((i: number) => {
    patchDia({ comidas: dia!.comidas.filter((_, idx) => idx !== i) });
  }, [dia, patchDia]);
  const patchComida = useCallback((i: number, patch: Partial<Comida>) => {
    patchDia({ comidas: dia!.comidas.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  }, [dia, patchDia]);

  const copiarATodos = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const fuente = dias[selectedDia]!;
    setDias(() => {
      const next = {} as Record<DiaSemana, ConfiguracionDiaDieta>;
      for (const d of DIAS_SEMANA) {
        next[d] = {
          kcalObjetivo: fuente.kcalObjetivo,
          macros: { ...fuente.macros },
          comidas: fuente.comidas.map(c => ({ ...c, id: genCoachClientId("comida") })),
        };
      }
      return next;
    });
  }, [dias, selectedDia]);

  const diasConComidas = useMemo(
    () => new Set(DIAS_SEMANA.filter(d => dias[d]?.comidas.length > 0)),
    [dias],
  );

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    setSaving(true);
    setError(null);
    try {
      const configuracionPorDia = {} as Record<DiaSemana, ConfiguracionDiaDieta>;
      for (const d of DIAS_SEMANA) {
        const cfg = dias[d]!;
        configuracionPorDia[d] = {
          kcalObjetivo: cfg.kcalObjetivo,
          macros: cfg.macros,
          comidas: cfg.comidas
            .filter(c => c.nombre.trim().length > 0)
            .map(c => ({ ...c, nombre: c.nombre.trim(), descripcion: c.descripcion.trim() })),
        };
      }
      const dieta: DietaJson = { nombre: nombre.trim(), configuracionPorDia };
      // PUT /api/students/[id] { detailUpdates: { diet: dieta } } → el
      // backend hace JSON.stringify(dieta) directo en dietJson (sin validar
      // forma) — el alumno lo vuelve a leer completo vía GET
      // /api/students/{su-id} (lib/portal.tsx fetchFullAssignment), no vía
      // /api/mobile/portal, que recortaría configuracionPorDia.
      await assignStudentDiet(studentId, dieta, token);
      onSaved(dieta);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la dieta.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, studentId, nombre, dias, onSaved, onClose]);

  if (!dia) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: BG, paddingTop: 60 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>
              {hasInitial ? "Editar dieta" : "Asignar dieta"}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
              <X size={22} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* ── Barra de días — altura fija, nunca se deforma ── */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={{ height: CHIP_H, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: "center" }}
          >
            {ORDEN_TABS.map(d => {
              const active = d === selectedDia;
              return (
                <Pressable
                  key={d}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedDia(d); }}
                  style={chipStyle(active)}
                >
                  <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : "#d4d4d8" }}>
                    {DIA_LABEL[d].slice(0, 3).toUpperCase()}
                  </Text>
                  {diasConComidas.has(d) && (
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? "#000" : VOLT }} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ height: 14 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 6 }}>
              Nombre del plan
            </Text>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Ej. Hipertrofia Limpia"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, marginBottom: 18 }}
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED }}>
                Objetivos — {DIA_LABEL[selectedDia]}
              </Text>
              <TouchableOpacity onPress={copiarATodos} hitSlop={8}>
                <Text style={{ fontSize: 10, color: VOLT, fontWeight: "800" }}>Copiar a todos los días</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
              {([
                ["Kcal", dia.kcalObjetivo, (v: number) => patchDia({ kcalObjetivo: v })],
                ["Prot (g)", dia.macros.protein, (v: number) => patchDia({ macros: { ...dia.macros, protein: v } })],
                ["Carb (g)", dia.macros.carbs, (v: number) => patchDia({ macros: { ...dia.macros, carbs: v } })],
                ["Gra (g)", dia.macros.fat, (v: number) => patchDia({ macros: { ...dia.macros, fat: v } })],
              ] as const).map(([label, value, setter]) => (
                <View key={label} style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>{label}</Text>
                  <TextInput
                    value={String(value || "")}
                    onChangeText={t => setter(parseFloat(t) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#52525b"
                    style={FIELD}
                  />
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 10 }}>
              Comidas de {DIA_LABEL[selectedDia]} ({dia.comidas.length})
            </Text>
            {dia.comidas.map((comida, mi) => (
              <View key={comida.id} style={{ backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={comida.nombre}
                    onChangeText={t => patchComida(mi, { nombre: t })}
                    placeholder="Nombre (Desayuno Anabólico)"
                    placeholderTextColor="#52525b"
                    style={{ ...FIELD, flex: 2 }}
                  />
                  <TextInput
                    value={comida.hora}
                    onChangeText={t => patchComida(mi, { hora: t })}
                    placeholder="Hora"
                    placeholderTextColor="#52525b"
                    style={{ ...FIELD, flex: 1 }}
                  />
                </View>
                <TextInput
                  value={String(comida.kcal || "")}
                  onChangeText={t => patchComida(mi, { kcal: parseFloat(t) || 0 })}
                  placeholder="Kcal de esta comida (opcional)"
                  placeholderTextColor="#52525b"
                  keyboardType="numeric"
                  style={{ ...FIELD, marginBottom: 8 }}
                />
                <TextInput
                  value={descriptionFor(comida)}
                  onChangeText={t => patchComida(mi, { descripcion: t })}
                  placeholder={"Descripción / ingredientes (uno por línea)\nEj. 4 claras + 2 huevos enteros\nAvena 60g"}
                  placeholderTextColor="#52525b"
                  multiline
                  numberOfLines={3}
                  style={{ ...FIELD, minHeight: 72, textAlignVertical: "top" }}
                />
                <TouchableOpacity onPress={() => removeComida(mi)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <Trash2 size={12} color="#f87171" />
                  <Text style={{ fontSize: 10, color: "#f87171" }}>Eliminar comida</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={addComida}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 12 }}
            >
              <Plus size={14} color={VOLT} />
              <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>Añadir comida</Text>
            </TouchableOpacity>

            {error && (
              <Text style={{ fontSize: 11, color: "#f87171", marginTop: 14, textAlign: "center" }}>{error}</Text>
            )}
          </ScrollView>

          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" }}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!canSave || saving}
              onPress={save}
              style={{
                width: "88%", alignSelf: "center", borderRadius: 25, height: 50,
                justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8,
                backgroundColor: VOLT, marginBottom: 20,
                shadowColor: VOLT, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
                elevation: 6,
                opacity: !canSave || saving ? 0.4 : 1,
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
