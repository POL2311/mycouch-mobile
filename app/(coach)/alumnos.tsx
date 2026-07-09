import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Plus, Check, X } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import {
  useCoach, STAGES, STAGE_COLORS, paymentBucket,
  type PaymentBucket, type Stage,
} from "@/lib/coach";
import ChangeStageModal from "@/components/coach/ChangeStageModal";
import BulkPeriodizationWizard from "@/components/coach/BulkPeriodizationWizard";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const FILTERS: { id: PaymentBucket | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "al_dia", label: "Al día" },
  { id: "pendiente", label: "Pendientes" },
  { id: "suspendido", label: "Suspendidos" },
];

// Weight-delta color follows the stage's actual goal direction — a loss reads
// green under a cut (Definición) and red under a bulk (Volumen); the
// blueprint doc doesn't formalize this mapping, so it's documented here.
function deltaColor(stage: string, delta: number): string {
  if (Math.abs(delta) < 0.1) return SILVER;
  const losing = delta < 0;
  if (stage === "Definición") return losing ? "#4ade80" : "#ef4444";
  if (stage === "Volumen")    return losing ? "#ef4444" : "#4ade80";
  return "#a1a1aa";   // Mantenimiento / Recomposición — no directional judgment
}

function NewStudentSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("Volumen");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && email.trim().includes("@");

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/students", { method: "POST", token, body: { name: name.trim(), email: email.trim(), stage, stageNumber: 1 } });
      setName(""); setEmail(""); setStage("Volumen");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el alumno.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, name, email, stage, onCreated, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: "#131315", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>Nuevo alumno</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={20} color={SILVER} /></TouchableOpacity>
          </View>
          <TextInput
            value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="#52525b"
            style={{ ...GLASS, borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10 }}
          />
          <TextInput
            value={email} onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor="#52525b"
            keyboardType="email-address" autoCapitalize="none"
            style={{ ...GLASS, borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10 }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {STAGES.map(s => (
              <Pressable
                key={s}
                onPress={() => setStage(s)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: stage === s ? VOLT : "rgba(255,255,255,0.05)",
                }}
              >
                <Text className="font-bold" style={{ fontSize: 11, color: stage === s ? "#000" : "#d4d4d8" }}>{s}</Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={{ color: "#f87171", fontSize: 11, marginBottom: 10, textAlign: "center" }}>{error}</Text>}
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!canSave || saving}
            onPress={save}
            style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: VOLT, opacity: !canSave || saving ? 0.4 : 1 }}
          >
            {saving ? <ActivityIndicator color="#000" /> : <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Crear alumno</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AlumnosScreen() {
  const { students, isLoading, refresh } = useCoach();
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaymentBucket | "todos">("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [changeStageFor, setChangeStageFor] = useState<string[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newStudentOpen, setNewStudentOpen] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    await refresh();
    setSyncing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter(s => filter === "todos" || paymentBucket(s.paymentStatus) === filter)
      .filter(s => q === "" || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, filter, query]);

  const toggleRow = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onApplied = useCallback(() => { setSelected(new Set()); refresh(); }, [refresh]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, marginBottom: 14 }}>
        <Text style={{ ...athletic, fontSize: 24, color: "#fff" }}>Alumnos</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={sync}
            style={{ backgroundColor: "#1C1C1E", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {syncing ? <ActivityIndicator size="small" color={CYAN} /> : <RefreshCw size={13} color={CYAN} />}
            <Text className="font-bold" style={{ fontSize: 11, color: CYAN }}>Sincronizar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setNewStudentOpen(true)}
            style={{ backgroundColor: CYAN, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Plus size={13} color="#000" />
            <Text className="font-black" style={{ fontSize: 11, color: "#000" }}>Nuevo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }} style={{ flexGrow: 0 }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: active ? "#fff" : "transparent",
                borderWidth: active ? 0 : 1, borderColor: "rgba(255,255,255,0.15)",
              }}
            >
              <Text className="font-bold" style={{ fontSize: 12, color: active ? "#000" : "#d4d4d8" }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={{ ...GLASS, borderRadius: 12, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 14, height: 44, justifyContent: "center" }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar alumno..."
          placeholderTextColor="#52525b"
          style={{ color: "#fff", fontSize: 13 }}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: selected.size > 0 ? 110 : 32 }} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 14, paddingVertical: 30, alignItems: "center" }}>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: "#71717a" }}>[ SIN RESULTADOS ]</Text>
            </View>
          ) : (
            filtered.map(s => {
              const sel = selected.has(s.id);
              const delta = +(s.currentWeight - s.previousWeight).toFixed(1);
              const stageColor = STAGE_COLORS[s.stage] ?? SILVER;
              return (
                <View key={s.id} style={{ ...GLASS, borderRadius: 14, padding: 12, marginBottom: 8, borderColor: sel ? VOLT : GLASS.borderColor }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <Pressable onPress={() => toggleRow(s.id)} hitSlop={8} style={{ marginTop: 2 }}>
                      <View
                        style={{
                          width: 18, height: 18, borderRadius: 4, alignItems: "center", justifyContent: "center",
                          backgroundColor: sel ? VOLT : "transparent", borderWidth: 1.5, borderColor: sel ? VOLT : "rgba(255,255,255,0.25)",
                        }}
                      >
                        {sel && <Check size={11} color="#000" strokeWidth={3} />}
                      </View>
                    </Pressable>

                    <Pressable style={{ flex: 1 }} onPress={() => setChangeStageFor([s.id])}>
                      {/* NOMBRE */}
                      <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }} numberOfLines={1}>{s.name}</Text>
                      <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 1 }} numberOfLines={1}>{s.email}</Text>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                        {/* PESO */}
                        <View>
                          <Text className="font-black" style={{ fontSize: 12, color: "#fff" }}>
                            {s.currentWeight} kg
                            {delta !== 0 && (
                              <Text style={{ fontSize: 10, color: deltaColor(s.stage, delta) }}> {delta > 0 ? "+" : ""}{delta}</Text>
                            )}
                          </Text>
                          <Text className="font-mono" style={{ fontSize: 8, color: "#52525b" }}>{s.lastWeighIn}</Text>
                        </View>
                        {/* ETAPA */}
                        <View style={{ backgroundColor: `${stageColor}22`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, color: stageColor, fontWeight: "700" }}>{s.stage}</Text>
                        </View>
                        {/* ESTADO — isActive, NOT paymentStatus (access-gate doctrine) */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.isActive ? "#4ade80" : "#ef4444" }} />
                          <Text className="font-mono" style={{ fontSize: 9, color: s.isActive ? "#4ade80" : "#ef4444" }}>
                            {s.isActive ? "Activo" : "Suspendido"}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Bulk action bar — "usa las acciones en lote de la lista de alumnos" */}
      {selected.size > 0 && (
        <View style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setWizardOpen(true)}
            style={{
              height: 52, borderRadius: 26, backgroundColor: VOLT,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              shadowColor: VOLT, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
            }}
          >
            <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Programar cambio ({selected.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      <ChangeStageModal
        visible={changeStageFor !== null}
        studentIds={changeStageFor ?? []}
        onClose={() => setChangeStageFor(null)}
        onApplied={onApplied}
      />
      <BulkPeriodizationWizard
        visible={wizardOpen}
        roster={students}
        preselected={[...selected]}
        onClose={() => setWizardOpen(false)}
        onApplied={onApplied}
      />
      <NewStudentSheet visible={newStudentOpen} onClose={() => setNewStudentOpen(false)} onCreated={refresh} />
    </SafeAreaView>
  );
}
