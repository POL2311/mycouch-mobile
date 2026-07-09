import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Check, ChevronRight, ChevronLeft } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import {
  STAGES, fetchTemplates, changeStage,
  type Stage, type CoachStudent, type StoredDietTemplate, type StoredRoutineTemplate,
} from "@/lib/coach";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type WizardStep = 1 | 2 | 3;
const STEP_LABELS: Record<WizardStep, string> = { 1: "Alumnos", 2: "Configuración", 3: "Programar" };

// ── §2C BULK PERIODIZATION WIZARD — 3-step mass programmer, verbatim §3.4/§4.4.
// canNext = step===1 ? selected.size>0 : true. Timing default "scheduled". ──
export default function BulkPeriodizationWizard({ visible, roster, preselected, onClose, onApplied }: {
  visible: boolean;
  roster: CoachStudent[];
  // Seeds step 1's selection — the roster screen's checkbox multi-select
  // feeds this directly ("usa las acciones en lote de la lista de alumnos").
  preselected?: string[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const { token } = useAuth();

  const [step,     setStep]     = useState<WizardStep>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const [stage,       setStage]       = useState<Stage>("Volumen");
  const [stageNumber, setStageNumber] = useState("1");
  const [dietTemplateId,    setDietTemplateId]    = useState("");
  const [routineTemplateId, setRoutineTemplateId] = useState("");
  const [timing,        setTiming]        = useState<"immediate" | "scheduled">("scheduled");
  const [executionDate, setExecutionDate] = useState(plusDays(10));

  const [dietTemplates,    setDietTemplates]    = useState<StoredDietTemplate[]>([]);
  const [routineTemplates, setRoutineTemplates] = useState<StoredRoutineTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setSelected(new Set(preselected ?? []));
    setStageFilter(null);
    setStage("Volumen");
    setStageNumber("1");
    setDietTemplateId("");
    setRoutineTemplateId("");
    setTiming("scheduled");
    setExecutionDate(plusDays(10));
    setError(null);
  // preselected is a seed value only — re-running this on every reference
  // change would fight the coach's in-wizard selection edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || !token) return;
    setTemplatesLoading(true);
    Promise.all([fetchTemplates("diet", token), fetchTemplates("routine", token)])
      .then(([diets, routines]) => {
        setDietTemplates(diets.filter((t): t is StoredDietTemplate => t.type === "diet"));
        setRoutineTemplates(routines.filter((t): t is StoredRoutineTemplate => t.type === "routine"));
      })
      .catch(() => { setDietTemplates([]); setRoutineTemplates([]); })
      .finally(() => setTemplatesLoading(false));
  }, [visible, token]);

  const stageChips = useMemo(() => [...new Set(roster.map(s => s.stage))], [roster]);
  const visibleStudents = useMemo(
    () => stageFilter ? roster.filter(s => s.stage === stageFilter) : roster,
    [roster, stageFilter],
  );
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every(s => selected.has(s.id));

  const toggleStudent = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleStudents.forEach(s => next.delete(s.id));
      else visibleStudents.forEach(s => next.add(s.id));
      return next;
    });
  }, [allVisibleSelected, visibleStudents]);

  const canNext = step === 1 ? selected.size > 0 : true;

  const submit = useCallback(async () => {
    if (!token) return;
    const n = parseInt(stageNumber, 10) || 1;
    setSaving(true);
    setError(null);
    try {
      await changeStage({
        studentIds: [...selected],
        stage,
        stageNumber: Math.max(1, n),
        dietTemplateId: dietTemplateId || undefined,
        routineTemplateId: routineTemplateId || undefined,
        executionDate: timing === "scheduled" ? executionDate.trim() : undefined,
      }, token);
      onApplied();
      onClose();
    } catch {
      setError("Hubo un error al guardar la programación masiva.");
    } finally {
      setSaving(false);
    }
  }, [token, selected, stage, stageNumber, dietTemplateId, routineTemplateId, timing, executionDate, onApplied, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", paddingTop: 60 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 }}>
          <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>Programación masiva</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
            <X size={22} color={SILVER} />
          </TouchableOpacity>
        </View>

        {/* Step strip */}
        <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 18, gap: 8 }}>
          {([1, 2, 3] as WizardStep[]).map(s => (
            <View key={s} style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  height: 3, width: "100%", borderRadius: 2,
                  backgroundColor: s <= step ? VOLT : "rgba(255,255,255,0.1)", marginBottom: 6,
                }}
              />
              <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: s === step ? VOLT : SILVER }}>
                {STEP_LABELS[s]}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {step === 1 && (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <Pressable
                  onPress={() => setStageFilter(null)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: stageFilter === null ? VOLT : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text className="font-bold" style={{ fontSize: 11, color: stageFilter === null ? "#000" : "#d4d4d8" }}>Todos</Text>
                </Pressable>
                {stageChips.map(s => (
                  <Pressable
                    key={s}
                    onPress={() => setStageFilter(s)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                      backgroundColor: stageFilter === s ? VOLT : "rgba(255,255,255,0.05)",
                    }}
                  >
                    <Text className="font-bold" style={{ fontSize: 11, color: stageFilter === s ? "#000" : "#d4d4d8" }}>{s}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={toggleSelectAllVisible}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}
              >
                <View
                  style={{
                    width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center",
                    backgroundColor: allVisibleSelected ? VOLT : "transparent", borderWidth: 1.5, borderColor: allVisibleSelected ? VOLT : "rgba(255,255,255,0.25)",
                  }}
                >
                  {allVisibleSelected && <Check size={12} color="#000" strokeWidth={3} />}
                </View>
                <Text className="font-bold" style={{ fontSize: 12, color: "#d4d4d8" }}>
                  Seleccionar todos ({visibleStudents.length})
                </Text>
              </Pressable>

              {visibleStudents.map(s => {
                const sel = selected.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    activeOpacity={0.7}
                    onPress={() => toggleStudent(s.id)}
                    style={{
                      ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8,
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      borderColor: sel ? VOLT : GLASS.borderColor,
                    }}
                  >
                    <View>
                      <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }}>{s.name}</Text>
                      <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 2 }}>{s.stage} · E{s.stageNumber}</Text>
                    </View>
                    <View
                      style={{
                        width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
                        backgroundColor: sel ? VOLT : "transparent", borderWidth: 1.5, borderColor: sel ? VOLT : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {sel && <Check size={13} color="#000" strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>Nueva Etapa</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {STAGES.map(s => {
                  const active = stage === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setStage(s)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                        backgroundColor: active ? VOLT : "rgba(255,255,255,0.05)",
                        borderWidth: 1, borderColor: active ? VOLT : "rgba(255,255,255,0.1)",
                      }}
                    >
                      <Text className="font-bold" style={{ fontSize: 12, color: active ? "#000" : "#d4d4d8" }}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>Número de Etapa</Text>
              <TextInput
                value={stageNumber}
                onChangeText={setStageNumber}
                keyboardType="number-pad"
                style={{ ...GLASS, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, marginBottom: 18, width: 100 }}
              />

              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>
                Asignar Plantilla de Dieta (Opcional)
              </Text>
              {templatesLoading ? (
                <ActivityIndicator color={VOLT} style={{ marginBottom: 18 }} />
              ) : (
                <View style={{ marginBottom: 18, gap: 6 }}>
                  <Pressable
                    onPress={() => setDietTemplateId("")}
                    style={{ ...GLASS, borderRadius: 10, padding: 10, borderColor: dietTemplateId === "" ? VOLT : GLASS.borderColor }}
                  >
                    <Text style={{ fontSize: 12, color: dietTemplateId === "" ? VOLT : "#d4d4d8" }}>Mantener dieta actual o sin cambios</Text>
                  </Pressable>
                  {dietTemplates.map(t => (
                    <Pressable
                      key={t.id}
                      onPress={() => setDietTemplateId(t.id)}
                      style={{ ...GLASS, borderRadius: 10, padding: 10, borderColor: dietTemplateId === t.id ? VOLT : GLASS.borderColor }}
                    >
                      <Text style={{ fontSize: 12, color: dietTemplateId === t.id ? VOLT : "#d4d4d8" }}>{t.name} ({t.totalCalories} kcal)</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>
                Asignar Plantilla de Rutina (Opcional)
              </Text>
              {!templatesLoading && (
                <View style={{ gap: 6 }}>
                  <Pressable
                    onPress={() => setRoutineTemplateId("")}
                    style={{ ...GLASS, borderRadius: 10, padding: 10, borderColor: routineTemplateId === "" ? VOLT : GLASS.borderColor }}
                  >
                    <Text style={{ fontSize: 12, color: routineTemplateId === "" ? VOLT : "#d4d4d8" }}>Mantener rutina actual o sin cambios</Text>
                  </Pressable>
                  {routineTemplates.map(t => (
                    <Pressable
                      key={t.id}
                      onPress={() => setRoutineTemplateId(t.id)}
                      style={{ ...GLASS, borderRadius: 10, padding: 10, borderColor: routineTemplateId === t.id ? VOLT : GLASS.borderColor }}
                    >
                      <Text style={{ fontSize: 12, color: routineTemplateId === t.id ? VOLT : "#d4d4d8" }}>{t.name} ({t.daysPerWeek} días/sem)</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>Fecha de Ejecución</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {(["immediate", "scheduled"] as const).map(t => {
                  const active = timing === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTiming(t)}
                      style={{
                        flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
                        backgroundColor: active ? VOLT : "rgba(255,255,255,0.05)",
                        borderWidth: 1, borderColor: active ? VOLT : "rgba(255,255,255,0.1)",
                      }}
                    >
                      <Text className="font-black" style={{ fontSize: 12, color: active ? "#000" : "#d4d4d8" }}>
                        {t === "immediate" ? "Inmediato" : "Programar"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {timing === "scheduled" && (
                <TextInput
                  value={executionDate}
                  onChangeText={setExecutionDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#52525b"
                  style={{ ...GLASS, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, marginBottom: 18 }}
                />
              )}

              <View style={{ ...GLASS, borderRadius: 12, padding: 14 }}>
                <Text className="font-black" style={{ fontSize: 11, color: VOLT, marginBottom: 6 }}>RESUMEN</Text>
                <Text style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 18 }}>
                  {selected.size} alumno(s) → {stage} · E{stageNumber}
                  {dietTemplateId ? `\n+ Dieta: ${dietTemplates.find(t => t.id === dietTemplateId)?.name}` : ""}
                  {routineTemplateId ? `\n+ Rutina: ${routineTemplates.find(t => t.id === routineTemplateId)?.name}` : ""}
                  {`\n${timing === "scheduled" ? `Programado: ${executionDate}` : "Aplicación inmediata"}`}
                </Text>
              </View>

              {error && (
                <Text style={{ fontSize: 11, color: "#f87171", marginTop: 16, textAlign: "center" }}>{error}</Text>
              )}
            </>
          )}
        </ScrollView>

        {/* Nav footer */}
        <View style={{ position: "absolute", bottom: 24, left: 20, right: 20, flexDirection: "row", gap: 10 }}>
          {step > 1 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setStep(s => (s - 1) as WizardStep)}
              style={{ flex: 1, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}
            >
              <ChevronLeft size={16} color="#d4d4d8" />
              <Text className="font-bold" style={{ fontSize: 12, color: "#d4d4d8" }}>Atrás</Text>
            </TouchableOpacity>
          )}
          {step < 3 ? (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!canNext}
              onPress={() => setStep(s => (s + 1) as WizardStep)}
              style={{ flex: 2, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: VOLT, opacity: canNext ? 1 : 0.4 }}
            >
              <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Siguiente</Text>
              <ChevronRight size={16} color="#000" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={saving}
              onPress={submit}
              style={{ flex: 2, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: VOLT, opacity: saving ? 0.6 : 1 }}
            >
              {saving && <ActivityIndicator size="small" color="#000" />}
              <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>
                {saving ? "Guardando..." : timing === "scheduled" ? "Programar Cambio" : "Aplicar Cambio"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
