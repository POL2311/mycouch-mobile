import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { STAGES, changeStage, type Stage } from "@/lib/coach";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";

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

// ── §2B CHANGE STAGE MODAL — single/multi student quick assigner.
// Open-reset defaults, verbatim §3.4: stage "Volumen", stageNumber 1, empty
// template ids, timing "immediate", executionDate = today+10d. ─────────────
export default function ChangeStageModal({ visible, studentIds, onClose, onApplied, initialStage, initialStageNumber }: {
  visible: boolean;
  studentIds: string[];
  onClose: () => void;
  onApplied: () => void;
  // Optional overrides for the open-reset defaults below — every existing
  // call site (the roster's bulk-select bar) omits these and keeps the
  // exact spec'd "always resets to Volumen/1" behavior untouched. Added so
  // alumno/[id].tsx's "Asignar rutina" button — which opens this modal for
  // ONE already-in-progress student just to attach a routine — doesn't
  // silently reset that student's real current stage back to Volumen/1 as
  // a side effect of a change they never asked for.
  initialStage?: Stage;
  initialStageNumber?: number;
}) {
  const { token } = useAuth();

  const [stage,       setStage]       = useState<Stage>(initialStage ?? "Volumen");
  const [stageNumber, setStageNumber] = useState(String(initialStageNumber ?? 1));
  const [timing,       setTiming]       = useState<"immediate" | "scheduled">("immediate");
  const [executionDate, setExecutionDate] = useState(plusDays(10));

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Open-reset (verbatim) — re-arms every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStage(initialStage ?? "Volumen");
    setStageNumber(String(initialStageNumber ?? 1));
    setTiming("immediate");
    setExecutionDate(plusDays(10));
    setError(null);
  }, [visible, initialStage, initialStageNumber]);

  // Asignación de plantillas de dieta/rutina ya NO vive aquí — este modal es
  // deliberadamente el "asignador rápido de un solo paso" (ver comentario en
  // alumnos.tsx junto a BulkPeriodizationWizard, que sí conserva su propio
  // selector de plantillas independiente para el flujo de 3 pasos). Tener
  // listados completos de plantillas incrustados aquí saturaba una acción
  // que debería ser minimalista: solo etapa + número + cuándo.
  const submit = useCallback(async () => {
    if (!token) return;
    const n = parseInt(stageNumber, 10) || 1;
    if (timing === "scheduled" && !executionDate.trim()) { setError("La fecha de ejecución es obligatoria para programar."); return; }
    triggerImpact();
    setSaving(true);
    setError(null);
    try {
      await changeStage({
        studentIds,
        stage,
        stageNumber: Math.max(1, n),
        executionDate: timing === "scheduled" ? executionDate.trim() : undefined,
      }, token);
      triggerSuccess();
      onApplied();
      onClose();
    } catch {
      setError("Hubo un error al guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }, [token, stage, stageNumber, timing, executionDate, studentIds, onApplied, onClose]);

  const title = studentIds.length === 1 ? "Cambiar Etapa del Alumno" : `Cambiar Etapa de Alumnos (${studentIds.length})`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView (.cursorrules §1): "Número de Etapa" y "Fecha de
          Ejecución" son campos de texto reales, y los botones de acción están
          fijos en bottom:24 — sin esto ambos quedaban tapados por el teclado. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", paddingTop: 70 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, marginBottom: 6 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>{title}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
            <X size={22} color={SILVER} />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: SILVER, paddingHorizontal: 20, marginBottom: 20, lineHeight: 17 }}>
          Define la nueva etapa, el número de mes y cuándo debe aplicarse.
        </Text>

        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* Nueva Etapa */}
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

          {/* Número de Etapa */}
          <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>
            Número de Etapa
          </Text>
          <TextInput
            value={stageNumber}
            onChangeText={setStageNumber}
            keyboardType="number-pad"
            style={{ ...GLASS, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14, marginBottom: 18, width: 100 }}
          />

          {/* Timing */}
          <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>
            Fecha de Ejecución
          </Text>
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
              style={{ ...GLASS, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14 }}
            />
          )}

          {error && (
            <Text style={{ fontSize: 11, color: "#f87171", marginTop: 16, textAlign: "center" }}>{error}</Text>
          )}
        </ScrollView>

        <View style={{ position: "absolute", bottom: 24, left: 20, right: 20, flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            style={{ flex: 1, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}
          >
            <Text className="font-bold" style={{ fontSize: 12, color: "#d4d4d8" }}>Cancelar</Text>
          </TouchableOpacity>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
