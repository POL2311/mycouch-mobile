import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import { Plus, X, Trash2 } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { triggerImpact } from "@/lib/haptics";
import { assignStudentRoutine, type EjercicioDTO } from "@/lib/coach";
import {
  DIAS_SEMANA, DIA_LABEL, diaSemanaDeHoy, NUMEROS_SEMANA, SEMANA_LABEL, semanaActualPorFecha,
  rutinaEstaVacia, genCoachClientId,
  type DiaSemana, type NumeroSemana, type RoutineJson, type ConfiguracionDiaRutina,
  type EjercicioAsignado, type SerieAsignada,
} from "@/types/coach-client";
import ExercisePicker from "./ExercisePicker";

// Misma paleta oficial que AssignDietModal — fondo absoluto, tarjetas
// #1C1C1E, acento #CCFF00.
// Paleta alineada a .cursorrules §2: tarjetas reales en #0F0F10
// (CARD_SURFACE), #1C1C1E reservado para campos/chips/separadores (CARD_BG).
const BG            = "#000000";
const VOLT          = "#CCFF00";
const CARD_SURFACE  = "#0F0F10";
const CARD_BG       = "#1C1C1E";
const BORDER        = "#2C2C2E";
const MUTED         = "#8E8E93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const FIELD = {
  backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13,
} as const;

// Cápsula de altura FIJA — ver el comentario gemelo en AssignDietModal.tsx
// para el porqué (un chip sin height explícito, dentro de un ScrollView
// horizontal sin height propio, se estira para llenar el alto ambiguo del
// padre — invisible en reposo, grotesco en verde neón activo).
const CHIP_H = 40;
const chipStyle = (active: boolean) => ({
  height: CHIP_H, paddingHorizontal: 16, borderRadius: 20,
  alignItems: "center" as const, justifyContent: "center" as const,
  flexDirection: "row" as const, gap: 6,
  backgroundColor: active ? VOLT : CARD_BG,
  borderWidth: 1, borderColor: active ? VOLT : BORDER,
});

const ORDEN_TABS: DiaSemana[] = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

type DiasPorSemana = Record<NumeroSemana, Record<DiaSemana, ConfiguracionDiaRutina>>;

function emptyDia(): ConfiguracionDiaRutina {
  return { enfoque: "Descanso", ejercicios: [] };
}
function emptyDiasPorSemana(): DiasPorSemana {
  const semanas = {} as DiasPorSemana;
  for (const n of NUMEROS_SEMANA) {
    semanas[n] = {} as Record<DiaSemana, ConfiguracionDiaRutina>;
    for (const d of DIAS_SEMANA) semanas[n][d] = emptyDia();
  }
  return semanas;
}

// Una serie nueva nace SIN exigencia — el coach la sube explícitamente. Nunca
// se fabrica un mínimo/objetivo a partir de otro dato (ver el mismo criterio
// en types/coach-client.ts seriesDesdeLegado).
const EMPTY_SERIE = (numero: number): SerieAsignada => ({ numero, minWeight: 0, targetReps: 0 });

function ejercicioDesdeCatalogo(e: EjercicioDTO): EjercicioAsignado {
  return {
    id: genCoachClientId("ej"),
    ejercicioId: e.id,
    nombre: e.name,
    grupoMuscular: e.muscleGroup,
    series: [EMPTY_SERIE(1), EMPTY_SERIE(2), EMPTY_SERIE(3)],
    imageUrl: e.imageUrl,
    videoUrl: e.videoUrl,
  };
}

interface Props {
  visible: boolean;
  studentId: string;
  // Siempre la rutina ya parseada (parseRoutineJson(student.routineJson)) —
  // puede venir vacía (emptyRoutineJson()) para una primera asignación.
  initialRoutine: RoutineJson;
  onClose: () => void;
  onSaved: (routine: RoutineJson) => void;
}

export default function AssignRoutineModal({ visible, studentId, initialRoutine, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const hasInitial = !rutinaEstaVacia(initialRoutine);

  const [nombre, setNombre] = useState(hasInitial ? initialRoutine.nombre : "");
  const [semanas, setSemanas] = useState<DiasPorSemana>(() => {
    const seed = emptyDiasPorSemana();
    for (const n of NUMEROS_SEMANA) {
      const cfg = initialRoutine.semanas[n]?.configuracionPorDia;
      if (cfg) seed[n] = { ...cfg };
    }
    return seed;
  });
  // Al abrir, aterriza en la semana que el alumno está viviendo hoy — el
  // punto de edición más probable para un coach que retoma la rutina.
  const [selectedSemana, setSelectedSemana] = useState<NumeroSemana>(
    () => semanaActualPorFecha(initialRoutine.fechaInicio),
  );
  const [selectedDia, setSelectedDia] = useState<DiaSemana>(diaSemanaDeHoy());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const hasInit = !rutinaEstaVacia(initialRoutine);
      setNombre(hasInit ? initialRoutine.nombre : "");
      const seed = emptyDiasPorSemana();
      for (const n of NUMEROS_SEMANA) {
        const cfg = initialRoutine.semanas[n]?.configuracionPorDia;
        if (cfg) seed[n] = { ...cfg };
      }
      setSemanas(seed);
      setSelectedSemana(semanaActualPorFecha(initialRoutine.fechaInicio));
      setSelectedDia(diaSemanaDeHoy());
      setSaving(false);
      setError(null);
    }
  }, [visible, initialRoutine]);

  const dia = semanas[selectedSemana]?.[selectedDia];
  const canSave = nombre.trim().length > 0;

  const patchDia = useCallback((patch: Partial<ConfiguracionDiaRutina>) => {
    setSemanas(s => ({
      ...s,
      [selectedSemana]: { ...s[selectedSemana], [selectedDia]: { ...s[selectedSemana][selectedDia]!, ...patch } },
    }));
  }, [selectedSemana, selectedDia]);

  const addExercisesFromCatalog = useCallback((chosen: EjercicioDTO[]) => {
    patchDia({ ejercicios: [...dia!.ejercicios, ...chosen.map(ejercicioDesdeCatalogo)] });
  }, [dia, patchDia]);

  const removeEjercicio = useCallback((ei: number) => {
    patchDia({ ejercicios: dia!.ejercicios.filter((_, idx) => idx !== ei) });
  }, [dia, patchDia]);

  const patchEjercicio = useCallback((ei: number, patch: Partial<EjercicioAsignado>) => {
    patchDia({ ejercicios: dia!.ejercicios.map((e, idx) => idx === ei ? { ...e, ...patch } : e) });
  }, [dia, patchDia]);

  const addSerie = useCallback((ei: number) => {
    const ej = dia!.ejercicios[ei]!;
    patchEjercicio(ei, { series: [...ej.series, EMPTY_SERIE(ej.series.length + 1)] });
  }, [dia, patchEjercicio]);

  const removeSerie = useCallback((ei: number, si: number) => {
    const ej = dia!.ejercicios[ei]!;
    patchEjercicio(ei, {
      series: ej.series.filter((_, idx) => idx !== si).map((s, idx) => ({ ...s, numero: idx + 1 })),
    });
  }, [dia, patchEjercicio]);

  const patchSerie = useCallback((ei: number, si: number, patch: Partial<SerieAsignada>) => {
    const ej = dia!.ejercicios[ei]!;
    patchEjercicio(ei, { series: ej.series.map((s, idx) => idx === si ? { ...s, ...patch } : s) });
  }, [dia, patchEjercicio]);

  const copiarATodos = useCallback(() => {
    triggerImpact();
    const fuente = semanas[selectedSemana][selectedDia]!;
    setSemanas(s => {
      const next = { ...s[selectedSemana] } as Record<DiaSemana, ConfiguracionDiaRutina>;
      for (const d of DIAS_SEMANA) {
        next[d] = {
          enfoque: fuente.enfoque,
          ejercicios: fuente.ejercicios.map(e => ({
            ...e, id: genCoachClientId("ej"), series: e.series.map(x => ({ ...x })),
          })),
        };
      }
      return { ...s, [selectedSemana]: next };
    });
  }, [semanas, selectedSemana, selectedDia]);

  // Copia la semana completa (los 7 días) a las otras dos — útil para
  // arrancar con el mismo split en las 3 semanas y luego solo subir la
  // intensidad (peso mínimo / reps) semana a semana.
  const copiarSemana = useCallback(() => {
    triggerImpact();
    const fuente = semanas[selectedSemana];
    setSemanas(s => {
      const next = { ...s };
      for (const n of NUMEROS_SEMANA) {
        if (n === selectedSemana) continue;
        const copia = {} as Record<DiaSemana, ConfiguracionDiaRutina>;
        for (const d of DIAS_SEMANA) {
          copia[d] = {
            enfoque: fuente[d]!.enfoque,
            ejercicios: fuente[d]!.ejercicios.map(e => ({
              ...e, id: genCoachClientId("ej"), series: e.series.map(x => ({ ...x })),
            })),
          };
        }
        next[n] = copia;
      }
      return next;
    });
  }, [semanas, selectedSemana]);

  const diasConEjercicios = useMemo(
    () => new Set(DIAS_SEMANA.filter(d => semanas[selectedSemana][d]?.ejercicios.length > 0)),
    [semanas, selectedSemana],
  );
  const semanasConContenido = useMemo(
    () => new Set(NUMEROS_SEMANA.filter(n => DIAS_SEMANA.some(d => semanas[n][d]?.ejercicios.length > 0))),
    [semanas],
  );

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    setSaving(true);
    setError(null);
    try {
      const semanasOut: RoutineJson["semanas"] = {} as RoutineJson["semanas"];
      for (const n of NUMEROS_SEMANA) {
        const configuracionPorDia = {} as Record<DiaSemana, ConfiguracionDiaRutina>;
        for (const d of DIAS_SEMANA) {
          const cfg = semanas[n][d]!;
          configuracionPorDia[d] = {
            enfoque: cfg.enfoque.trim() || "Descanso",
            ejercicios: cfg.ejercicios.filter(e => e.nombre.trim().length > 0),
          };
        }
        semanasOut[n] = { numero: n, configuracionPorDia };
      }
      const routine: RoutineJson = {
        nombre: nombre.trim(),
        fechaInicio: initialRoutine.fechaInicio,
        semanas: semanasOut,
      };
      // PUT /api/students/[id] { detailUpdates: { routine } } — mismo
      // mecanismo que assignStudentDiet (lib/coach.tsx), backend hace
      // JSON.stringify verbatim. El alumno lo lee vía GET
      // /api/students/{su-id} (lib/portal.tsx fetchFullAssignment) para no
      // perder series/minWeight/targetReps en /api/mobile/portal.
      await assignStudentRoutine(studentId, routine, token);
      onSaved(routine);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la rutina.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, studentId, nombre, semanas, initialRoutine.fechaInicio, onSaved, onClose]);

  if (!dia) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: BG, paddingTop: 60 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>
              {hasInitial ? "Editar rutina" : "Asignar rutina"}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
              <X size={22} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* ── Barra de semanas (bloque de intensidad) — altura fija, dos
              líneas de texto, no se estira más allá de lo que su contenido pide. ── */}
          <View style={{ flexDirection: "row", height: 54, paddingHorizontal: 20, gap: 8, marginBottom: 10 }}>
            {NUMEROS_SEMANA.map(n => {
              const active = n === selectedSemana;
              return (
                <Pressable
                  key={n}
                  onPress={() => { triggerImpact(); setSelectedSemana(n); }}
                  style={{
                    flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center",
                    backgroundColor: active ? VOLT : CARD_BG,
                    borderWidth: 1, borderColor: active ? VOLT : BORDER,
                  }}
                >
                  <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : "#fff" }}>
                    Semana {n}
                  </Text>
                  <Text style={{ fontSize: 9, color: active ? "#000" : MUTED, marginTop: 1 }}>
                    {SEMANA_LABEL[n]}{semanasConContenido.has(n) ? " ●" : ""}
                  </Text>
                </Pressable>
              );
            })}
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
                  onPress={() => { triggerImpact(); setSelectedDia(d); }}
                  style={chipStyle(active)}
                >
                  <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : "#d4d4d8" }}>
                    {DIA_LABEL[d].slice(0, 3).toUpperCase()}
                  </Text>
                  {diasConEjercicios.has(d) && (
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? "#000" : VOLT }} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ height: 14 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 6 }}>
              Nombre de la rutina
            </Text>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Ej. Fuerza · Bloque 1"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, marginBottom: 18 }}
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED }}>
                Enfoque — Semana {selectedSemana} · {DIA_LABEL[selectedDia]}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={copiarATodos} hitSlop={8}>
                  <Text style={{ fontSize: 10, color: VOLT, fontWeight: "800" }}>Copiar a todos los días</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={copiarSemana} hitSlop={8}>
                  <Text style={{ fontSize: 10, color: VOLT, fontWeight: "800" }}>Copiar semana a las otras 2</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              value={dia.enfoque}
              onChangeText={t => patchDia({ enfoque: t })}
              placeholder="Ej. Push, Pierna, Descanso"
              placeholderTextColor="#52525b"
              style={{ ...FIELD, marginBottom: 18 }}
            />

            <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 10 }}>
              Ejercicios de {DIA_LABEL[selectedDia]} ({dia.ejercicios.length})
            </Text>
            {dia.ejercicios.map((ej, ei) => (
              <View key={ej.id} style={{ backgroundColor: CARD_SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }} numberOfLines={1}>{ej.nombre}</Text>
                    {!!ej.grupoMuscular && (
                      <Text className="font-mono" style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>{ej.grupoMuscular}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => removeEjercicio(ei)} hitSlop={8}>
                    <Trash2 size={14} color="#f87171" />
                  </TouchableOpacity>
                </View>

                {/* ── Constructor estricto: peso mínimo + reps objetivo + técnica por serie ── */}
                <View style={{ flexDirection: "row", marginBottom: 6, paddingHorizontal: 2 }}>
                  <Text className="font-mono" style={{ flex: 0.5, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Serie</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: MUTED, textTransform: "uppercase", textAlign: "center" }}>Peso mín. (kg)</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: MUTED, textTransform: "uppercase", textAlign: "center" }}>Reps</Text>
                  <View style={{ width: 28 }} />
                </View>
                {ej.series.map((s, si) => (
                  <View key={si} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Text style={{ flex: 0.5, fontSize: 12, color: VOLT, fontWeight: "800" }}>#{s.numero}</Text>
                      <TextInput
                        value={String(s.minWeight || "")}
                        onChangeText={t => patchSerie(ei, si, { minWeight: parseFloat(t) || 0 })}
                        placeholder="0"
                        placeholderTextColor="#52525b"
                        keyboardType="numeric"
                        style={{ ...FIELD, flex: 1, textAlign: "center", paddingVertical: 8 }}
                      />
                      <TextInput
                        value={String(s.targetReps || "")}
                        onChangeText={t => patchSerie(ei, si, { targetReps: parseInt(t, 10) || 0 })}
                        placeholder="0"
                        placeholderTextColor="#52525b"
                        keyboardType="numeric"
                        style={{ ...FIELD, flex: 1, textAlign: "center", paddingVertical: 8 }}
                      />
                      <TouchableOpacity onPress={() => removeSerie(ei, si)} hitSlop={8} style={{ width: 28, alignItems: "center" }}>
                        <Trash2 size={13} color="#f87171" />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      value={s.tecnica ?? ""}
                      onChangeText={t => patchSerie(ei, si, { tecnica: t || undefined })}
                      placeholder="Técnica (ej. al fallo, ida y vuelta, Velocidad 5 / Inclinación 15)"
                      placeholderTextColor="#52525b"
                      style={{ ...FIELD, paddingVertical: 8, fontSize: 11 }}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => addSerie(ei)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 10, marginTop: 4 }}
                >
                  <Plus size={12} color={VOLT} />
                  <Text className="font-bold" style={{ fontSize: 10, color: VOLT }}>Añadir serie</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setPickerOpen(true)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", paddingVertical: 12 }}
            >
              <Plus size={14} color={VOLT} />
              <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>+ Ejercicio (del catálogo)</Text>
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
                {saving ? "Guardando..." : hasInitial ? "Guardar cambios" : "Asignar rutina"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={addExercisesFromCatalog}
      />
    </Modal>
  );
}
