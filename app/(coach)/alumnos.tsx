import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, ActivityIndicator, Animated,
  KeyboardAvoidingView, Platform, StyleSheet,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { router } from "expo-router";
import { RefreshCw, Plus, Check, X, AlertTriangle, Search, Lock, Dumbbell, Upload } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";
import { ShimmerExerciseList } from "@/components/ShimmerLoader";
import {
  useCoach, STAGES, STAGE_COLORS, setStudentActive, daysSinceLastActivity,
  RED_FLAG_INACTIVITY_DAYS, fetchLastActivityDate,
  type Stage, type CoachStudent,
} from "@/lib/coach";
import { COACH_BG, COACH_CARD, COACH_BORDER, COACH_ACCENT, COACH_ALERT, COACH_MUTED, COACH_GOLD } from "./_layout";
import ChangeStageModal from "@/components/coach/ChangeStageModal";
import BulkPeriodizationWizard from "@/components/coach/BulkPeriodizationWizard";

const CARD_STYLE = {
  backgroundColor: COACH_CARD,
  borderWidth: 1,
  borderColor: COACH_BORDER,
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

type ActiveFilter = "todos" | "activos" | "suspendidos";
const FILTERS: { id: ActiveFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "activos", label: "Activos" },
  { id: "suspendidos", label: "Suspendidos" },
];

// Weight-delta color follows the stage's actual goal direction — a loss reads
// green under a cut (Definición) and red under a bulk (Volumen); the
// blueprint doc doesn't formalize this mapping, so it's documented here.
function deltaColor(stage: string, delta: number): string {
  if (Math.abs(delta) < 0.1) return COACH_MUTED;
  const losing = delta < 0;
  if (stage === "Definición") return losing ? "#4ade80" : COACH_ALERT;
  if (stage === "Volumen")    return losing ? COACH_ALERT : "#4ade80";
  return "#a1a1aa";   // Mantenimiento / Recomposición — no directional judgment
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ── Avatar — gold ring denotes an active (isActive), actively-tracked student.
// A true multi-stop conic gradient border isn't cheap in plain RN views, so
// this approximates "aro degradado dorado" with a solid gold ring + soft glow
// — reads as premium without pulling in an SVG gradient just for a ring. ────
function StudentAvatar({ student, size = 44 }: { student: CoachStudent; size?: number }) {
  const bg = student.avatarColor || (STAGE_COLORS[student.stage] ?? COACH_ACCENT);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        alignItems: "center", justifyContent: "center",
        backgroundColor: bg,
        ...(student.isActive
          ? {
              borderWidth: 2, borderColor: COACH_GOLD,
              shadowColor: COACH_GOLD, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
            }
          : { opacity: 0.5 }),
      }}
    >
      <Text className="font-black" style={{ fontSize: size * 0.36, color: "#000" }}>
        {student.avatarInitials || initialsFor(student.name)}
      </Text>
    </View>
  );
}

// ── Badge de actividad — antes solo existía para el caso rojo (Foco rojo);
// ahora refleja los TRES estados reales de daysSinceLastActivity para que la
// tarjeta nunca quede en silencio sobre un alumno que sí está activo (M1: la
// discrepancia era que la lista mostraba "39 días" hardcodeado por
// lastWeighIn mientras el detalle ya calculaba "1 día" real — con un solo
// componente leyendo la MISMA señal (lastActivityDate), ambos coinciden). ──
function ActivityBadge({ days }: { days: number }) {
  const flagged = days >= RED_FLAG_INACTIVITY_DAYS;
  const activeToday = days === 0;
  const color = flagged ? COACH_ALERT : activeToday ? "#4ade80" : COACH_MUTED;
  const bg    = flagged ? "rgba(255,59,48,0.12)" : activeToday ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)";
  const border = flagged ? "rgba(255,59,48,0.35)" : activeToday ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.1)";
  const label = flagged
    ? `Sin actividad hace ${days} días`
    : activeToday
      ? "✓ Activo hoy"
      : `Activo hace ${days} ${days === 1 ? "día" : "días"}`;

  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 4,
        backgroundColor: bg, borderWidth: 1, borderColor: border,
        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, alignSelf: "flex-start",
      }}
    >
      {flagged && <AlertTriangle size={10} color={color} />}
      <Text style={{ fontSize: 9, color, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

export function NewStudentSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [weight, setWeight] = useState("");
  const [stage, setStage] = useState<Stage>("Volumen");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // POST /api/students, JSON path (src/app/api/students/route.ts on the
  // backend — see backend-context.md §3): the body is read as
  // `data.startingWeight`, NOT `data.currentWeight`/`previousWeight`. The
  // route builds currentWeight = previousWeight = data.startingWeight and
  // creates the first WeightEntry row itself — the client never posts
  // weightHistory directly. `currentWeight`/`previousWeight` are required
  // non-nullable Floats on the Prisma Student model with no default, so if
  // `startingWeight` is missing or NaN the create fails at the DB layer;
  // validating a real, positive number here before sending is what prevents
  // that 500.
  //
  // There's no `password` field here on purpose: provisionUserForStudent()
  // on the backend (src/lib/db.ts) always hashes a fixed DEFAULT_CLIENT_PASSWORD
  // for a brand-new account and ignores anything the client sends — a
  // password input here would only mislead the coach into thinking they set
  // one. The backend does expose POST /api/students/[id]/reset-password for
  // later resets, but no screen in this app calls it yet.
  const parsedWeight = parseFloat(weight);
  const canSave = name.trim().length > 0 && email.trim().includes("@")
    && Number.isFinite(parsedWeight) && parsedWeight > 0;

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    triggerImpact();
    setSaving(true);
    setError(null);
    try {
      await api("/api/students", {
        method: "POST", token,
        body: {
          name: name.trim(), email: email.trim(),
          startingWeight: parsedWeight,
          stage, stageNumber: 1,
        },
      });
      triggerSuccess();
      setName(""); setEmail(""); setWeight(""); setStage("Volumen");
      onCreated();
      onClose();
    } catch (e) {
      console.error("[NewStudentSheet] POST /api/students failed:", e);
      setError(e instanceof Error ? e.message : "No se pudo crear el alumno.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, name, email, parsedWeight, stage, onCreated, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView + ScrollView (.cursorrules §1 "Corrección del
          Modal de Entrada"): sin esto el teclado nativo se encimaba sobre el
          campo de peso y el botón Crear alumno en dispositivos con poco alto
          de pantalla — el sheet nunca se desplazaba hacia arriba. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.85)" }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ backgroundColor: COACH_CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: COACH_BORDER, borderBottomWidth: 0, maxHeight: "88%" }}>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>Nuevo alumno</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}><X size={20} color={COACH_MUTED} /></TouchableOpacity>
            </View>
            <TextInput
              testID="new-student-name" value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="#52525b"
              style={{ ...CARD_STYLE, borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10 }}
            />
            <TextInput
              testID="new-student-email" value={email} onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor="#52525b"
              keyboardType="email-address" autoCapitalize="none"
              style={{ ...CARD_STYLE, borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10 }}
            />
            <TextInput
              testID="new-student-weight" value={weight} onChangeText={setWeight} placeholder="Peso actual (kg)" placeholderTextColor="#52525b"
              keyboardType="decimal-pad"
              style={{ ...CARD_STYLE, borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10 }}
            />
            <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginBottom: 16, lineHeight: 13 }}>
              El alumno se crea con una contraseña inicial genérica para su primer acceso al portal.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {STAGES.map(s => (
                <Pressable
                  key={s}
                  onPress={() => setStage(s)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: stage === s ? COACH_ACCENT : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text className="font-bold" style={{ fontSize: 11, color: stage === s ? "#000" : "#d4d4d8" }}>{s}</Text>
                </Pressable>
              ))}
            </View>
            {error && <Text style={{ color: COACH_ALERT, fontSize: 11, marginBottom: 10, textAlign: "center" }}>{error}</Text>}
            <TouchableOpacity
              testID="new-student-save"
              activeOpacity={0.8}
              disabled={!canSave || saving}
              onPress={save}
              style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: COACH_ACCENT, opacity: !canSave || saving ? 0.4 : 1 }}
            >
              {saving ? <ActivityIndicator color="#000" /> : <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Crear alumno</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Importación masiva — CSV/JSON pegado como texto (sin librería de file
// picker instalada en el proyecto), parseado localmente y creado en lote vía
// el mismo POST /api/students real que usa NewStudentSheet — no es una
// simulación de la escritura, cada fila válida crea una cuenta real. ────────
interface ImportRow { name: string; email: string; startingWeight: number; stage: Stage }
interface ImportParseResult { rows: ImportRow[]; errors: string[] }

function resolveStage(raw: string | undefined): Stage {
  return (STAGES as readonly string[]).includes(raw ?? "") ? (raw as Stage) : "Volumen";
}

const IMPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Split respetando campos entrecomillados ("Pérez, Juan" no se rompe en dos
// columnas, "" dentro de comillas es una comilla literal) — un CSV real
// exportado de Excel/Sheets casi siempre trae al menos un campo así.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map(f => f.trim());
}

// Formato esperado, una línea por alumno (encabezado opcional, se detecta y
// se salta solo): nombre,correo,peso_inicial,etapa. \r\n (Windows/Excel) y
// \n se normalizan igual — antes solo se partía por \n, así que un CSV
// exportado desde Excel dejaba un \r colgando al final de cada campo.
function parseImportCsv(text: string): ImportParseResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const startIdx = /^name\s*,|^nombre\s*,/i.test(lines[0] ?? "") ? 1 : 0;
  for (let i = startIdx; i < lines.length; i++) {
    const [name, email, weightStr, stageStr] = splitCsvLine(lines[i]!);
    const weight = parseFloat(weightStr ?? "");
    if (!name || !email || !IMPORT_EMAIL_RE.test(email) || !Number.isFinite(weight) || weight <= 0) {
      errors.push(`Línea ${i + 1}: datos inválidos`);
      continue;
    }
    rows.push({ name, email, startingWeight: weight, stage: resolveStage(stageStr) });
  }
  return { rows, errors };
}

// Formato esperado: arreglo de objetos {name, email, startingWeight, stage?}
function parseImportJson(text: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], errors: ["JSON inválido — revisa la sintaxis."] };
  }
  if (!Array.isArray(parsed)) return { rows: [], errors: ["El JSON debe ser un arreglo de alumnos."] };
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  parsed.forEach((item: unknown, i: number) => {
    const o = item as Record<string, unknown>;
    const name   = typeof o?.name === "string" ? o.name.trim() : "";
    const email  = typeof o?.email === "string" ? o.email.trim() : "";
    const weight = Number(o?.startingWeight);
    if (!name || !email || !IMPORT_EMAIL_RE.test(email) || !Number.isFinite(weight) || weight <= 0) {
      errors.push(`Elemento ${i + 1}: datos inválidos`);
      return;
    }
    rows.push({ name, email, startingWeight: weight, stage: resolveStage(typeof o?.stage === "string" ? o.stage : undefined) });
  });
  return { rows, errors };
}

function BulkImportModal({ visible, onClose, onImported }: {
  visible: boolean; onClose: () => void; onImported: () => void;
}) {
  const { token } = useAuth();
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [finished, setFinished] = useState(false);

  const { rows, errors } = format === "csv" ? parseImportCsv(raw) : parseImportJson(raw);

  const reset = useCallback(() => {
    setRaw("");
    setFinished(false);
    setProgress({ done: 0, total: 0, failed: 0 });
  }, []);

  const runImport = useCallback(async () => {
    if (!token || rows.length === 0) return;
    triggerImpact();
    setImporting(true);
    setFinished(false);
    let ok = 0, failed = 0;
    for (const row of rows) {
      try {
        await api("/api/students", {
          method: "POST", token,
          body: { name: row.name, email: row.email, startingWeight: row.startingWeight, stage: row.stage, stageNumber: 1 },
        });
        ok++;
      } catch (e) {
        console.error("[BulkImportModal] falló la fila", row.email, e);
        failed++;
      }
      setProgress({ done: ok + failed, total: rows.length, failed });
    }
    setImporting(false);
    setFinished(true);
    if (ok > 0) { triggerSuccess(); onImported(); }
  }, [token, rows, onImported]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.85)" }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ backgroundColor: COACH_CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: COACH_BORDER, borderBottomWidth: 0, maxHeight: "88%" }}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>Importar alumnos</Text>
              <TouchableOpacity onPress={() => { reset(); onClose(); }} hitSlop={10}><X size={20} color={COACH_MUTED} /></TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["csv", "json"] as const).map(f => (
                <Pressable
                  key={f}
                  onPress={() => { triggerImpact(); setFormat(f); }}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    backgroundColor: format === f ? COACH_ACCENT : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text className="font-black" style={{ fontSize: 12, color: format === f ? "#000" : "#d4d4d8" }}>{f.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>

            <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginBottom: 8, lineHeight: 13 }}>
              {format === "csv"
                ? "Pega el contenido de tu archivo CSV — una línea por alumno: nombre,correo,peso_inicial,etapa"
                : 'Pega un arreglo JSON: [{"name":"...","email":"...","startingWeight":70,"stage":"Volumen"}]'}
            </Text>

            <TextInput
              value={raw}
              onChangeText={setRaw}
              multiline
              autoCapitalize="none"
              placeholder={format === "csv" ? "Juan Pérez,juan@example.com,78,Volumen" : "[]"}
              placeholderTextColor="#52525b"
              style={{ ...CARD_STYLE, borderRadius: 10, padding: 12, color: "#fff", fontSize: 12, minHeight: 140, textAlignVertical: "top" }}
            />

            {raw.trim().length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text className="font-bold" style={{ fontSize: 11, color: rows.length > 0 ? COACH_ACCENT : COACH_MUTED }}>
                  {rows.length} alumno{rows.length === 1 ? "" : "s"} listo{rows.length === 1 ? "" : "s"} para importar
                </Text>
                {errors.length > 0 && (
                  <Text style={{ fontSize: 10, color: COACH_ALERT, marginTop: 4 }}>
                    {errors.length} línea{errors.length === 1 ? "" : "s"} inválida{errors.length === 1 ? "" : "s"} — {errors.slice(0, 3).join("; ")}
                  </Text>
                )}
              </View>
            )}

            {importing && (
              <View style={{ marginTop: 12 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: COACH_BORDER, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`, height: "100%", backgroundColor: COACH_ACCENT }} />
                </View>
                <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, marginTop: 6 }}>
                  Importando {progress.done}/{progress.total}...
                </Text>
              </View>
            )}

            {finished && (
              <Text className="font-bold" style={{ fontSize: 12, color: progress.failed > 0 ? COACH_ALERT : "#4ade80", marginTop: 12 }}>
                {progress.done - progress.failed} alumno{progress.done - progress.failed === 1 ? "" : "s"} importado{progress.done - progress.failed === 1 ? "" : "s"} correctamente
                {progress.failed > 0 ? ` · ${progress.failed} fallaron` : ""}
              </Text>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              disabled={rows.length === 0 || importing}
              onPress={runImport}
              style={{
                height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: COACH_ACCENT,
                marginTop: 16, opacity: rows.length === 0 || importing ? 0.4 : 1,
              }}
            >
              {importing
                ? <ActivityIndicator color="#000" />
                : <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>{rows.length > 0 ? `Importar (${rows.length})` : "Importar"}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const NEON_GREEN = "#39FF14";

// ── Panel de acción de swipe — el mismo componente sirve para el candado rojo
// (izquierda) y el verde neón (derecha). `progress` es el Animated.Value
// normalizado 0→1 que react-native-gesture-handler anima mientras el usuario
// arrastra la fila (1 = alcanzó el umbral configurado en leftThreshold/
// rightThreshold). El listener dispara triggerImpact() una única vez, justo
// en el instante en que progress cruza ese umbral en vivo — no al soltar el
// dedo — y se re-arma si el usuario retrocede por debajo del umbral sin soltar.
function SwipeActionPanel({
  progress, color, icon, label, onPress,
}: {
  progress: Animated.AnimatedInterpolation<number>;
  color: string;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const crossedRef = useRef(false);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      if (value >= 1 && !crossedRef.current) {
        crossedRef.current = true;
        triggerImpact();
      } else if (value < 1) {
        crossedRef.current = false;
      }
    });
    return () => progress.removeListener(id);
  }, [progress]);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 92, alignItems: "center", justifyContent: "center", gap: 4,
        backgroundColor: color, borderRadius: 14, marginBottom: 8,
      }}
    >
      {icon}
      <Text className="font-black uppercase" style={{ fontSize: 9, letterSpacing: 0.5, color: "#000" }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Fila de alumno con gestos — swipe izquierda = Suspender/Activar (rojo,
// candado), swipe derecha = Asignar Dieta/Rutina Rápida (verde neón, abre
// BulkPeriodizationWizard preseleccionado en este único alumno). Extraída de
// AlumnosScreen para poder usar useRef/useEffect por fila sin romper las
// reglas de hooks dentro de un .map(). ──────────────────────────────────────
function StudentRow({
  s, sel, toggling, lastActivityDate, onToggleRow, onToggleActive, onQuickAssign,
}: {
  s: CoachStudent; sel: boolean; toggling: boolean;
  // Señal real de actividad (lib/coach.tsx's fetchLastActivityDate — checks
  // de comida/ejercicio + lastWeighIn, mismo cómputo que alumno/[id].tsx),
  // resuelta en el padre y compartida por fila. undefined mientras el batch
  // fetch todavía no resuelve para este alumno — cae a s.lastWeighIn (lo
  // único disponible hasta entonces) en vez de mostrar un estado vacío.
  lastActivityDate: string | null | undefined;
  onToggleRow: (id: string) => void;
  onToggleActive: (s: CoachStudent) => void;
  onQuickAssign: (s: CoachStudent) => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const delta = +(s.currentWeight - s.previousWeight).toFixed(1);
  const stageColor = STAGE_COLORS[s.stage] ?? COACH_MUTED;
  const inactiveDays = daysSinceLastActivity(lastActivityDate ?? s.lastWeighIn);
  // Suspendidos no se marcan "en riesgo" — ya están gateados, isRedFlag
  // original excluía este caso y se preserva aquí.
  const flagged = s.isActive && inactiveDays !== null && inactiveDays >= RED_FLAG_INACTIVITY_DAYS;

  return (
    <Swipeable
      ref={swipeRef}
      leftThreshold={56}
      rightThreshold={56}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={progress => (
        <SwipeActionPanel
          progress={progress}
          color={NEON_GREEN}
          icon={<Dumbbell size={18} color="#000" strokeWidth={2.5} />}
          label="Asignar"
          onPress={() => { swipeRef.current?.close(); onQuickAssign(s); }}
        />
      )}
      renderRightActions={progress => (
        <SwipeActionPanel
          progress={progress}
          color={COACH_ALERT}
          icon={<Lock size={18} color="#000" strokeWidth={2.5} />}
          label={s.isActive ? "Suspender" : "Activar"}
          onPress={() => { swipeRef.current?.close(); onToggleActive(s); }}
        />
      )}
    >
      <View style={{ ...CARD_STYLE, borderRadius: 14, padding: 12, marginBottom: 8, borderColor: sel ? COACH_ACCENT : flagged ? "rgba(255,59,48,0.4)" : COACH_BORDER }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Pressable onPress={() => onToggleRow(s.id)} hitSlop={8} style={{ marginTop: 2 }}>
            <View
              style={{
                width: 18, height: 18, borderRadius: 4, alignItems: "center", justifyContent: "center",
                backgroundColor: sel ? COACH_ACCENT : "transparent", borderWidth: 1.5, borderColor: sel ? COACH_ACCENT : "rgba(255,255,255,0.25)",
              }}
            >
              {sel && <Check size={11} color="#000" strokeWidth={3} />}
            </View>
          </Pressable>

          <StudentAvatar student={s} />

          {/* Row body — tap navigates to the detail screen (primary
              interaction). Single-student stage changes now go
              through the checkbox + bulk-action bar (select just
              one row), which already existed for multi-select. */}
          <Pressable
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: "/(coach)/alumno/[id]", params: { id: s.id } })}
          >
            <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }} numberOfLines={1}>{s.name}</Text>
            <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginTop: 1 }} numberOfLines={1}>{s.email}</Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <View>
                <Text className="font-black" style={{ fontSize: 12, color: "#fff" }}>
                  {s.currentWeight} kg
                  {delta !== 0 && (
                    <Text style={{ fontSize: 10, color: deltaColor(s.stage, delta) }}> {delta > 0 ? "+" : ""}{delta}</Text>
                  )}
                </Text>
                <Text className="font-mono" style={{ fontSize: 8, color: "#52525b" }}>{s.lastWeighIn}</Text>
              </View>
              <View style={{ backgroundColor: `${stageColor}22`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: stageColor, fontWeight: "700" }}>{s.stage}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.isActive ? "#4ade80" : COACH_ALERT }} />
                <Text className="font-mono" style={{ fontSize: 9, color: s.isActive ? "#4ade80" : COACH_ALERT }}>
                  {s.isActive ? "Activo" : "Suspendido"}
                </Text>
              </View>
            </View>

            {s.isActive && inactiveDays !== null && (
              <View style={{ marginTop: 8 }}>
                <ActivityBadge days={inactiveDays} />
              </View>
            )}
          </Pressable>

          {/* Suspender/Activar — mutates isActive via PATCH. Se conserva como
              botón directo además del swipe: el gesto es un atajo, no un
              reemplazo del control visible. */}
          <Pressable
            onPress={() => onToggleActive(s)}
            disabled={toggling}
            hitSlop={8}
            style={{
              marginTop: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
              backgroundColor: s.isActive ? "rgba(255,59,48,0.1)" : "rgba(74,222,128,0.1)",
              borderWidth: 1, borderColor: s.isActive ? "rgba(255,59,48,0.3)" : "rgba(74,222,128,0.3)",
              opacity: toggling ? 0.5 : 1,
            }}
          >
            {toggling
              ? <ActivityIndicator size="small" color={s.isActive ? COACH_ALERT : "#4ade80"} />
              : (
                <Text style={{ fontSize: 9, fontWeight: "800", color: s.isActive ? COACH_ALERT : "#4ade80" }}>
                  {s.isActive ? "SUSPENDER" : "ACTIVAR"}
                </Text>
              )}
          </Pressable>
        </View>
      </View>
    </Swipeable>
  );
}

export default function AlumnosScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { students, isLoading, refresh, patchStudent } = useCoach();
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [changeStageOpen, setChangeStageOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newStudentOpen, setNewStudentOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // M1: la misma señal real que ya usa alumno/[id].tsx (checks de comida/
  // ejercicio + lastWeighIn), resuelta en lote para todo el roster visible —
  // antes esta pantalla solo tenía lastWeighIn (aprox), lo que producía
  // exactamente la discrepancia reportada ("39 días" aquí vs "1 día" en el
  // detalle, para el MISMO alumno). Bounded por el tamaño típico de un
  // roster de coach; un fallo puntual de red para un alumno solo lo deja en
  // su lastWeighIn (StudentRow ya cae a eso si el mapa no tiene su id).
  const [activityMap, setActivityMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!token || students.length === 0) return;
    let cancelled = false;
    Promise.all(
      students.map(s => fetchLastActivityDate(s.id, token, s.lastWeighIn).then(date => [s.id, date] as const)),
    ).then(entries => {
      if (cancelled) return;
      setActivityMap(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [students, token]);

  const sync = useCallback(async () => {
    setSyncing(true);
    await refresh();
    setSyncing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter(s => filter === "todos" || (filter === "activos" ? s.isActive : !s.isActive))
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

  // Suspender/Activar — mutates the real access gate (isActive), independent
  // of paymentStatus. Flips patchStudent() immediately (optimistic — the
  // toggle visibly changes the instant it's tapped, not after a round trip)
  // and rolls it back if the PATCH fails, instead of leaving the button
  // looking like it did nothing on failure.
  const toggleActive = useCallback(async (s: CoachStudent) => {
    if (!token || togglingId) return;
    setTogglingId(s.id);
    setToggleError(null);
    const nextActive = !s.isActive;
    patchStudent(s.id, { isActive: nextActive });
    try {
      await setStudentActive(s.id, nextActive, token);
    } catch (e) {
      patchStudent(s.id, { isActive: s.isActive });   // rollback
      console.error("[AlumnosScreen] setStudentActive failed:", e);
      setToggleError(e instanceof Error ? e.message : "No se pudo actualizar el estado del alumno.");
    } finally {
      setTogglingId(null);
    }
  }, [token, togglingId, patchStudent]);

  // Swipe derecha (verde neón) — atajo de un solo gesto al mismo wizard que
  // ya usa el flujo de selección múltiple: preselecciona SOLO este alumno y
  // abre BulkPeriodizationWizard directo, sin pasar por el checkbox.
  const quickAssign = useCallback((s: CoachStudent) => {
    setSelected(new Set([s.id]));
    setWizardOpen(true);
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: COACH_BG }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, marginBottom: 14 }}>
        <Text style={{ ...athletic, fontSize: 24, color: "#fff" }}>Alumnos</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { triggerImpact(); setBulkImportOpen(true); }}
            style={{ ...CARD_STYLE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Upload size={13} color={COACH_ACCENT} />
            <Text className="font-bold" style={{ fontSize: 11, color: COACH_ACCENT }}>Importar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={sync}
            style={{ ...CARD_STYLE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {syncing ? <ActivityIndicator size="small" color={COACH_ACCENT} /> : <RefreshCw size={13} color={COACH_ACCENT} />}
            <Text className="font-bold" style={{ fontSize: 11, color: COACH_ACCENT }}>Sincronizar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {toggleError && (
        <Pressable
          onPress={() => setToggleError(null)}
          style={{
            marginHorizontal: 20, marginBottom: 10, borderRadius: 10, padding: 10,
            backgroundColor: "rgba(255,59,48,0.1)", borderWidth: 1, borderColor: "rgba(255,59,48,0.35)",
          }}
        >
          <Text style={{ fontSize: 11, color: COACH_ALERT, textAlign: "center" }}>{toggleError} (toca para cerrar)</Text>
        </Pressable>
      )}

      {/* Filter: Todos / Activos / Suspendidos — the real access gate, not
          paymentStatus (billing display only, per the access-gate doctrine
          documented on CoachStudent). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }} style={{ flexGrow: 0 }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: active ? COACH_ACCENT : "transparent",
                borderWidth: active ? 0 : 1, borderColor: COACH_BORDER,
              }}
            >
              <Text className="font-bold" style={{ fontSize: 12, color: active ? "#000" : "#d4d4d8" }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={{ ...CARD_STYLE, borderRadius: 12, marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 14, height: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Search size={15} color={COACH_MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar alumno..."
          placeholderTextColor="#52525b"
          style={{ flex: 1, color: "#fff", fontSize: 13 }}
        />
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <ShimmerExerciseList count={6} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            // Clears the CoachDock (84 + insets.bottom, absolute bottom:0)
            // plus the floating bulk-action bar / FAB — the ScrollView's own
            // content sits underneath both.
            paddingBottom: 84 + insets.bottom + (selected.size > 0 ? 90 : 80),
          }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={{ ...CARD_STYLE, borderRadius: 14, paddingVertical: 30, alignItems: "center" }}>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: COACH_MUTED }}>[ SIN RESULTADOS ]</Text>
            </View>
          ) : (
            filtered.map(s => (
              <StudentRow
                key={s.id}
                s={s}
                sel={selected.has(s.id)}
                toggling={togglingId === s.id}
                lastActivityDate={activityMap[s.id]}
                onToggleRow={toggleRow}
                onToggleActive={toggleActive}
                onQuickAssign={quickAssign}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Bulk action bar — select one or more rows via the checkbox.
          ChangeStageModal (quick, one-step assigner) and
          BulkPeriodizationWizard (3-step scheduling flow) serve different
          purposes — both are offered rather than collapsing to just the
          heavier wizard now that a single row tap navigates to detail
          instead of opening the quick modal directly. */}
      {selected.size > 0 && (
        <View style={{ position: "absolute", bottom: 84 + insets.bottom + 12, left: 20, right: 20, flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setChangeStageOpen(true)}
            style={{
              flex: 1, height: 52, borderRadius: 26, backgroundColor: COACH_CARD, borderWidth: 1, borderColor: COACH_ACCENT,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Text style={{ ...athletic, fontSize: 12, color: COACH_ACCENT }}>Cambiar etapa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setWizardOpen(true)}
            style={{
              flex: 1, height: 52, borderRadius: 26, backgroundColor: COACH_ACCENT,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              shadowColor: COACH_ACCENT, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
            }}
          >
            <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>Programar ({selected.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Floating neon add button */}
      {selected.size === 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setNewStudentOpen(true)}
          style={{
            position: "absolute", bottom: 84 + insets.bottom + 12, right: 20,
            width: 56, height: 56, borderRadius: 28, backgroundColor: COACH_ACCENT,
            alignItems: "center", justifyContent: "center",
            shadowColor: COACH_ACCENT, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10,
          }}
        >
          <Plus size={24} color="#000" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      <ChangeStageModal
        visible={changeStageOpen}
        studentIds={[...selected]}
        onClose={() => setChangeStageOpen(false)}
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
      <BulkImportModal visible={bulkImportOpen} onClose={() => setBulkImportOpen(false)} onImported={refresh} />
    </SafeAreaView>
  );
}
