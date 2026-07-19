import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, AlertTriangle, Check, X as XIcon, Plus, ClipboardList, Eye } from "lucide-react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import { useAuth } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { triggerImpact } from "@/lib/haptics";
import {
  useCoach, STAGES, STAGE_COLORS, paymentBucket,
  setStudentActive, daysSinceLastActivity, fetchStudentDetail, RED_FLAG_INACTIVITY_DAYS,
  type CoachStudentDetail, type WeightHistoryPoint, type Stage,
} from "@/lib/coach";
import {
  DIAS_SEMANA, DIA_LABEL, diaSemanaDeHoy, parseDietaJson, parseRoutineJson,
  dietaEstaVacia, rutinaEstaVacia, NUMEROS_SEMANA, SEMANA_LABEL, semanaActualPorFecha,
  type DiaSemana, type NumeroSemana,
} from "@/types/coach-client";
import { COACH_BG, COACH_CARD, COACH_BORDER, COACH_ACCENT, COACH_ALERT, COACH_MUTED, COACH_GOLD } from "../_layout";
import ChangeStageModal from "@/components/coach/ChangeStageModal";
import AssignDietModal from "@/components/coach/AssignDietModal";
import DietTemplateCatalogModal from "@/components/coach/DietTemplateCatalogModal";
import AssignRoutineModal from "@/components/coach/AssignRoutineModal";

const CARD = { backgroundColor: COACH_CARD, borderWidth: 1, borderColor: COACH_BORDER } as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const PAYMENT_LABEL: Record<string, string> = {
  al_dia: "Al día", pendiente: "Pendiente", suspendido: "Suspendido",
};
const PAYMENT_COLOR: Record<string, string> = {
  al_dia: "#4ade80", pendiente: "#f59e0b", suspendido: COACH_ALERT,
};

type TabId = "resumen" | "entreno" | "nutricion" | "progreso";
const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "entreno", label: "Entreno" },
  { id: "nutricion", label: "Nutrición" },
  { id: "progreso", label: "Progreso" },
];

function StatTile({ label, value, unit, color = "#fff" }: {
  label: string; value: string; unit?: string; color?: string;
}) {
  return (
    <View style={{ ...CARD, flex: 1, borderRadius: 20, padding: 14 }}>
      <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text className="font-black" style={{ fontSize: 22, color, marginTop: 4 }}>
        {value}
        {unit && <Text style={{ fontSize: 12, color: COACH_MUTED, fontWeight: "400" }}> {unit}</Text>}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COACH_MUTED, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

// ── Mini-anillo circular de progreso — un macro (P/C/G), relleno según la
// PORCIÓN calórica que ese macro representa del total del día (proteína/carbs
// ×4 kcal/g, grasa ×9 kcal/g) — no consumo real (el coach ve el PLAN
// asignado, no el checklist del alumno; eso ya vive aparte más abajo). ──────
function MacroRing({ label, grams, kcalShare, color }: {
  label: string; grams: number; kcalShare: number; color: string;
}) {
  const SIZE = 56, STROKE = 5, R = (SIZE - STROKE) / 2, CIRC = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, kcalShare));
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#1C1C1E" strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color} strokeWidth={STROKE} fill="none"
            strokeDasharray={`${CIRC * pct} ${CIRC}`} strokeLinecap="round"
            rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text className="font-black" style={{ fontSize: 12, color: "#fff" }}>{grams}g</Text>
        </View>
      </View>
      <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginTop: 4, letterSpacing: 1 }}>{label}</Text>
    </View>
  );
}

function MacroRingsRow({ macros, kcalObjetivo }: {
  macros: { protein: number; carbs: number; fat: number }; kcalObjetivo: number;
}) {
  const pKcal = macros.protein * 4, cKcal = macros.carbs * 4, fKcal = macros.fat * 9;
  const totalKcal = Math.max(pKcal + cKcal + fKcal, 1);
  return (
    <View style={{ ...CARD, borderRadius: 16, padding: 16, marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, letterSpacing: 1, textTransform: "uppercase" }}>
          División de macronutrientes
        </Text>
        <Text className="font-black" style={{ fontSize: 14, color: COACH_ACCENT }}>{kcalObjetivo} KCAL</Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <MacroRing label="PROTEÍNA" grams={macros.protein} kcalShare={pKcal / totalKcal} color={COACH_ACCENT} />
        <MacroRing label="CARBS"    grams={macros.carbs}   kcalShare={cKcal / totalKcal} color="#60a5fa" />
        <MacroRing label="GRASA"    grams={macros.fat}     kcalShare={fKcal / totalKcal} color="#fb923c" />
      </View>
    </View>
  );
}

// ── Vista mensual de carga — proyecta el patrón semanal ya asignado
// (configuracionPorDia se repite cada semana; no existe un modelo de
// asignación por fecha calendario específica en el backend) sobre los días
// reales del mes actual: cada celda resuelve su propio día-de-semana y
// consulta el MISMO Set que ya alimenta WeekdayBar. Tocar una celda salta a
// ese día de semana en el editor de arriba — "programar" un día de semana
// una vez ya cubre todas sus futuras ocurrencias del mes, que es justamente
// lo que un sistema recurrente-semanal significa. ───────────────────────────
const JS_DAY_TO_DIA: DiaSemana[] = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTH_LABEL = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function MonthlyLoadCalendar({ diasConContenido, selectedDia, onSelectDia }: {
  diasConContenido: Set<DiaSemana>; selectedDia: DiaSemana; onSelectDia: (d: DiaSemana) => void;
}) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayNum = now.getDate();

  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const diaSemana = JS_DAY_TO_DIA[new Date(year, month, dayNum).getDay()]!;
    return {
      dayNum, diaSemana,
      hasContent: diasConContenido.has(diaSemana),
      isToday: dayNum === todayNum,
      isSelected: diaSemana === selectedDia,
    };
  });

  return (
    <View style={{ ...CARD, borderRadius: 16, padding: 14, marginTop: 10 }}>
      <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
        Vista mensual de carga — {MONTH_LABEL[month]}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {cells.map(c => (
          <Pressable
            key={c.dayNum}
            onPress={() => { triggerImpact(); onSelectDia(c.diaSemana); }}
            style={{ width: 30, alignItems: "center" }}
          >
            <View
              style={{
                width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
                backgroundColor: c.hasContent ? COACH_ACCENT : "#1C1C1E",
                borderWidth: c.isToday ? 2 : c.isSelected ? 1.5 : 0,
                borderColor: c.isToday ? "#fff" : COACH_ACCENT,
              }}
            >
              <Text className="font-bold" style={{ fontSize: 9, color: c.hasContent ? "#000" : COACH_MUTED }}>
                {c.dayNum}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: COACH_MUTED, marginTop: 10, lineHeight: 13 }}>
        Toca un día para programar su dieta y rutina — el patrón se repite cada semana.
      </Text>
    </View>
  );
}

// Lunes-primero para la barra de días — el modelo de datos (configuracionPorDia)
// es un objeto indexado por DiaSemana, no depende de este orden de UI.
const ORDEN_TABS: DiaSemana[] = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function WeekdayBar({ selected, onSelect, filled }: {
  selected: DiaSemana; onSelect: (d: DiaSemana) => void; filled: Set<DiaSemana>;
}) {
  return (
    <ScrollView
      horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
      style={{ marginBottom: 4 }}
    >
      {ORDEN_TABS.map(d => {
        const active = d === selected;
        return (
          <Pressable
            key={d}
            onPress={() => { triggerImpact(); onSelect(d); }}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: active ? COACH_ACCENT : COACH_CARD,
              borderWidth: 1, borderColor: active ? COACH_ACCENT : COACH_BORDER,
              flexDirection: "row", alignItems: "center", gap: 6,
            }}
          >
            <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : "#d4d4d8" }}>
              {DIA_LABEL[d].slice(0, 3).toUpperCase()}
            </Text>
            {filled.has(d) && (
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? "#000" : COACH_ACCENT }} />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Selector de bloque de intensidad (Semana 1/2/3) — vive arriba de la barra
// de días en la pestaña Entreno; la Nutrición no tiene periodización por
// semanas (solo por día), así que esto no se reutiliza allí.
function WeekBar({ selected, onSelect, filled }: {
  selected: NumeroSemana; onSelect: (n: NumeroSemana) => void; filled: Set<NumeroSemana>;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
      {NUMEROS_SEMANA.map(n => {
        const active = n === selected;
        return (
          <Pressable
            key={n}
            onPress={() => { triggerImpact(); onSelect(n); }}
            style={{
              flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center",
              backgroundColor: active ? COACH_ACCENT : COACH_CARD,
              borderWidth: 1, borderColor: active ? COACH_ACCENT : COACH_BORDER,
            }}
          >
            <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : "#fff" }}>
              Semana {n}{filled.has(n) ? " ●" : ""}
            </Text>
            <Text style={{ fontSize: 9, color: active ? "#000" : COACH_MUTED, marginTop: 1 }}>{SEMANA_LABEL[n]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const CHART_W = 320, CHART_H = 120, CHART_PAD = 12;

function WeightHistoryChart({ points }: { points: WeightHistoryPoint[] }) {
  const weights = points.map(p => p.weight);
  const min = Math.min(...weights) - 0.5;
  const max = Math.max(...weights) + 0.5;
  const span = Math.max(max - min, 0.1);
  const toX = (i: number) => CHART_PAD + (i / Math.max(points.length - 1, 1)) * (CHART_W - CHART_PAD * 2);
  const toY = (w: number) => CHART_H - CHART_PAD - ((w - min) / span) * (CHART_H - CHART_PAD * 2);
  const coords = points.map((p, i) => `${toX(i)},${toY(p.weight)}`).join(" ");

  return (
    <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED }}>{points[0]!.date}</Text>
        <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED }}>{points[points.length - 1]!.date}</Text>
      </View>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <Polyline points={coords} fill="none" stroke={COACH_ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <Circle key={i} cx={toX(i)} cy={toY(p.weight)} r={3} fill={COACH_ACCENT} />
        ))}
      </Svg>
      <Text className="font-black" style={{ fontSize: 18, color: "#fff", marginTop: 4 }}>
        {points[points.length - 1]!.weight}kg
      </Text>
    </View>
  );
}

// ── Modal de inspección de solo lectura — lectura instantánea del contenido
// ya cargado (rutina/dieta del día seleccionado) sin entrar al editor
// completo. Genérico: recibe título/subtítulo + el contenido ya armado por
// cada tab, en vez de conocer el shape de rutina o dieta directamente. ──────
function ReadOnlyPlanModal({ visible, onClose, title, subtitle, children }: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)", paddingTop: 70 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, marginBottom: 18 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>{title}</Text>
            {!!subtitle && (
              <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, marginTop: 4, letterSpacing: 0.5 }}>
                {subtitle}
              </Text>
            )}
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={10}>
            <XIcon size={22} color={COACH_MUTED} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

// Botón secundario de contorno neón — mismo tratamiento visual que "Cargar
// Plantilla de Alimentación", reutilizado aquí para abrir el modal de solo
// lectura.
function ViewPlanButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => { triggerImpact(); onPress(); }}
      style={{
        height: 44, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: COACH_ACCENT,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      }}
    >
      <Eye size={14} color={COACH_ACCENT} />
      <Text className="font-bold" style={{ fontSize: 11, color: COACH_ACCENT, letterSpacing: 0.3 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AlumnoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const { students, refresh, patchStudent } = useCoach();
  const student = students.find(s => s.id === id);
  const [tab, setTab] = useState<TabId>("resumen");
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [assignRoutineOpen, setAssignRoutineOpen] = useState(false);
  const [assignDietOpen, setAssignDietOpen] = useState(false);
  const [dietCatalogOpen, setDietCatalogOpen] = useState(false);
  const [changeStageOpen, setChangeStageOpen] = useState(false);
  const [routineViewOpen, setRoutineViewOpen] = useState(false);
  const [dietViewOpen, setDietViewOpen] = useState(false);
  const [selectedDia, setSelectedDia] = useState<DiaSemana>(diaSemanaDeHoy());
  // Aterriza en la semana que el alumno está viviendo hoy según fechaInicio —
  // requiere parsear routineJson una vez antes del early-return de abajo
  // (student puede ser undefined ahí, parseRoutineJson nunca lanza).
  const [selectedSemana, setSelectedSemana] = useState<NumeroSemana>(
    () => semanaActualPorFecha(parseRoutineJson(student?.routineJson).fechaInicio),
  );

  // GET /api/students/[id] → { student, detail } — confirmed contract, see
  // backend-context.md and fetchStudentDetail (lib/coach.tsx). A failure here
  // just means "keep showing the honest empty-state cards", never a crash or
  // a stuck spinner — detailLoading always resolves to false either way.
  const [detail, setDetail] = useState<CoachStudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  // Bumped on every reloadDetail() call (mount + post-assign refresh) so an
  // in-flight response from a superseded call never clobbers a newer one.
  const requestSeq = useRef(0);

  const reloadDetail = useCallback(() => {
    if (!token || !id) { setDetailLoading(false); return; }
    const seq = ++requestSeq.current;
    setDetailLoading(true);
    fetchStudentDetail(id, token)
      .then(d => { if (requestSeq.current === seq) setDetail(d); })
      .catch(() => { if (requestSeq.current === seq) setDetail(null); })
      .finally(() => { if (requestSeq.current === seq) setDetailLoading(false); });
  }, [id, token]);

  useEffect(() => { reloadDetail(); }, [reloadDetail]);

  if (!student) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: COACH_BG }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text className="text-center" style={{ fontSize: 13, color: COACH_MUTED }}>
            Alumno no disponible.
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16, borderWidth: 1, borderColor: COACH_BORDER, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text className="uppercase" style={{ fontSize: 11, letterSpacing: 1, color: "#fff" }}>← Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stageColor    = STAGE_COLORS[student.stage] ?? COACH_MUTED;
  const bucket        = paymentBucket(student.paymentStatus);
  const delta         = +(student.currentWeight - student.previousWeight).toFixed(1);
  const dieta          = parseDietaJson(student.dietJson);
  const rutina         = parseRoutineJson(student.routineJson);
  // "Nada asignado en ningún día de la semana" — el único detector real de
  // "sin asignar", tanto si dietJson/routineJson está vacío como si se
  // guardó una configuración vacía a propósito.
  const dietUnassigned    = dietaEstaVacia(dieta);
  const rutinaUnassigned  = rutinaEstaVacia(rutina);
  const diaCfgDieta   = dieta.configuracionPorDia[selectedDia];
  const cfgSemana     = rutina.semanas[selectedSemana]?.configuracionPorDia;
  const diaCfgRutina  = cfgSemana?.[selectedDia];
  const diasConComidas = new Set(DIAS_SEMANA.filter(d => dieta.configuracionPorDia[d]?.comidas.length > 0));
  const diasConEjercicios = new Set(DIAS_SEMANA.filter(d => (cfgSemana?.[d]?.ejercicios.length ?? 0) > 0));
  const semanasConEjercicios = new Set(
    NUMEROS_SEMANA.filter(n => DIAS_SEMANA.some(d => (rutina.semanas[n]?.configuracionPorDia[d]?.ejercicios.length ?? 0) > 0)),
  );
  const esHoy = selectedDia === diaSemanaDeHoy();
  // Bug del Foco Rojo: antes esto solo miraba lastWeighIn, así que un alumno
  // que entrena y marca su dieta a diario pero no se pesa hace semanas se
  // marcaba como "sin actividad" de forma incorrecta. detail.lastActivityDate
  // (lib/coach.tsx's fetchStudentDetail) ya considera también los DailyCheck
  // reales de comida/ejercicio — se prefiere en cuanto detail termina de
  // cargar; mientras tanto cae de vuelta al mismo cálculo de antes (roster-
  // only), así que nunca hay un estado en blanco.
  const lastActivityDate = detail?.lastActivityDate ?? student.lastWeighIn;
  const inactiveDays  = daysSinceLastActivity(lastActivityDate);
  const flagged       = student.isActive && inactiveDays !== null && inactiveDays >= RED_FLAG_INACTIVITY_DAYS;
  const activeToday   = inactiveDays === 0;
  // CoachStudent.stage is a plain string (raw DB scalar), not the Stage
  // union — validate before handing it to ChangeStageModal's typed prop
  // rather than blindly casting an unverified string.
  const studentStage: Stage = (STAGES as readonly string[]).includes(student.stage)
    ? (student.stage as Stage)
    : "Volumen";

  const toggleActive = async () => {
    if (!token || toggling) return;
    setToggling(true);
    setToggleError(null);
    const nextActive = !student.isActive;
    patchStudent(student.id, { isActive: nextActive });   // optimistic
    try {
      await setStudentActive(student.id, nextActive, token);
    } catch (e) {
      patchStudent(student.id, { isActive: student.isActive });   // rollback
      console.error("[AlumnoDetailScreen] setStudentActive failed:", e);
      // PATCH /api/students/[id] returns 403 "No autorizado" whenever the
      // signed-in token's role isn't COACH/ADMIN — surface that specifically
      // rather than the raw backend string, which doesn't explain WHY.
      if (e instanceof ApiError && e.status === 403) {
        setToggleError("Tu cuenta no tiene permisos de administrador (COACH o ADMIN) para suspender o activar alumnos.");
      } else {
        setToggleError(e instanceof Error ? e.message : "No se pudo actualizar el estado del alumno.");
      }
    } finally {
      setToggling(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: COACH_BG }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={toggleActive}
          disabled={toggling}
          style={{
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
            backgroundColor: student.isActive ? "rgba(255,59,48,0.1)" : "rgba(74,222,128,0.1)",
            borderWidth: 1, borderColor: student.isActive ? "rgba(255,59,48,0.3)" : "rgba(74,222,128,0.3)",
            opacity: toggling ? 0.5 : 1,
          }}
        >
          {toggling
            ? <ActivityIndicator size="small" color={student.isActive ? COACH_ALERT : "#4ade80"} />
            : (
              <Text style={{ fontSize: 11, fontWeight: "800", color: student.isActive ? COACH_ALERT : "#4ade80" }}>
                {student.isActive ? "Suspender" : "Activar"}
              </Text>
            )}
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* ── Identity ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
              backgroundColor: student.avatarColor || stageColor,
              ...(student.isActive
                ? { borderWidth: 2, borderColor: COACH_GOLD, shadowColor: COACH_GOLD, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }
                : { opacity: 0.5 }),
            }}
          >
            <Text className="font-black" style={{ fontSize: 18, color: "#000" }}>
              {student.avatarInitials || student.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...athletic, fontSize: 22, color: "#fff", letterSpacing: -0.5 }} numberOfLines={1}>
              {student.name}
            </Text>
            <Text className="font-mono" style={{ fontSize: 11, color: COACH_MUTED, marginTop: 1 }} numberOfLines={1}>
              {student.email}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <View style={{ backgroundColor: `${stageColor}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, color: stageColor, fontWeight: "800" }}>{student.stage}</Text>
          </View>
          <View style={{ backgroundColor: `${PAYMENT_COLOR[bucket]}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, color: PAYMENT_COLOR[bucket], fontWeight: "800" }}>{PAYMENT_LABEL[bucket]}</Text>
          </View>
          <View style={{ backgroundColor: student.isActive ? "#4ade8022" : `${COACH_ALERT}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, color: student.isActive ? "#4ade80" : COACH_ALERT, fontWeight: "800" }}>
              {student.isActive ? "Activo" : "Suspendido"}
            </Text>
          </View>
        </View>

        {toggleError && (
          <Pressable
            onPress={() => setToggleError(null)}
            style={{ marginTop: 14, borderRadius: 12, padding: 12, backgroundColor: "rgba(255,59,48,0.1)", borderWidth: 1, borderColor: "rgba(255,59,48,0.35)" }}
          >
            <Text style={{ fontSize: 11, color: COACH_ALERT, textAlign: "center" }}>{toggleError} (toca para cerrar)</Text>
          </Pressable>
        )}

        {/* ── Foco rojo — inactivity alert, ahora derivado de la actividad
             real más reciente (peso, comida o serie), no solo del pesaje. ── */}
        {flagged && inactiveDays !== null && (
          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14,
              backgroundColor: "rgba(255,59,48,0.1)", borderWidth: 1, borderColor: "rgba(255,59,48,0.35)",
              borderRadius: 12, padding: 12,
            }}
          >
            <AlertTriangle size={16} color={COACH_ALERT} />
            <Text style={{ fontSize: 12, color: COACH_ALERT, fontWeight: "700", flex: 1 }}>
              Foco rojo: sin actividad hace {inactiveDays} días
            </Text>
          </View>
        )}

        {/* ── Activo Hoy — estado positivo cuando la actividad más reciente
             (peso, comida o serie) es de hoy mismo. */}
        {activeToday && (
          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14,
              backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.3)",
              borderRadius: 12, padding: 12,
            }}
          >
            <Check size={16} color={COACH_ACCENT} strokeWidth={3} />
            <Text className="font-black uppercase" style={{ fontSize: 12, color: COACH_ACCENT, letterSpacing: 0.5, flex: 1 }}>
              ✓ Activo Hoy
            </Text>
          </View>
        )}

        {/* ── Tab bar ── */}
        <View style={{ flexDirection: "row", backgroundColor: COACH_CARD, borderRadius: 12, padding: 3, marginTop: 18, borderWidth: 1, borderColor: COACH_BORDER }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: active ? COACH_ACCENT : "transparent" }}
              >
                <Text className="font-black" style={{ fontSize: 11, color: active ? "#000" : COACH_MUTED }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {tab === "resumen" && (
          <>
            <SectionLabel>Métricas clave</SectionLabel>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatTile label="Peso actual" value={String(student.currentWeight)} unit="kg" />
              <StatTile
                label="Cambio"
                value={`${delta > 0 ? "+" : ""}${delta}`}
                unit="kg"
                color={Math.abs(delta) < 0.1 ? COACH_MUTED : delta < 0 ? "#4ade80" : COACH_ALERT}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <StatTile label="Racha" value={String(student.streak)} unit="días" color={COACH_ACCENT} />
              {/* Only one aggregate completionRate exists on CoachStudent —
                  not separately split into workout vs. diet adherence, so
                  this is labeled as the single real number it is rather than
                  presented as two different metrics that don't exist. */}
              <StatTile label="Cumplimiento" value={`${Math.round(student.completionRate)}`} unit="%" color={COACH_ACCENT} />
            </View>
            <View style={{ marginTop: 10 }}>
              <StatTile
                label="Última actividad"
                value={inactiveDays === null ? "—" : inactiveDays === 0 ? "Hoy" : `Hace ${inactiveDays}`}
                unit={inactiveDays !== null && inactiveDays > 0 ? "días" : undefined}
                color={flagged ? COACH_ALERT : "#4ade80"}
              />
            </View>

            <SectionLabel>Peso</SectionLabel>
            {detailLoading ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={COACH_ACCENT} />
              </View>
            ) : detail && detail.weightHistory.length > 0 ? (
              <WeightHistoryChart points={detail.weightHistory} />
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED }}>ANTERIOR: {student.previousWeight}kg</Text>
                  <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED }}>ACTUAL: {student.currentWeight}kg</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: COACH_BORDER, overflow: "hidden", flexDirection: "row" }}>
                  <View style={{ flex: 1, backgroundColor: delta <= 0 ? "#4ade80" : COACH_ACCENT }} />
                </View>
                <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginTop: 8 }}>
                  No se pudo cargar el historial completo de peso. Desliza hacia abajo para reintentar.
                </Text>
              </View>
            )}
          </>
        )}

        {tab === "entreno" && (
          <>
            <SectionLabel>Rutina asignada</SectionLabel>
            <WeekBar selected={selectedSemana} onSelect={setSelectedSemana} filled={semanasConEjercicios} />
            <WeekdayBar selected={selectedDia} onSelect={setSelectedDia} filled={diasConEjercicios} />

            {rutinaUnassigned ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setAssignRoutineOpen(true)}
                style={{
                  height: 52, borderRadius: 16, backgroundColor: COACH_ACCENT, marginTop: 10,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Plus size={16} color="#000" strokeWidth={2.5} />
                <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Asignar rutina</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16, marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text className="font-black" style={{ fontSize: 14, color: "#fff" }}>{rutina.nombre}</Text>
                    <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, marginTop: 2 }}>
                      {DIA_LABEL[selectedDia]} · {diaCfgRutina?.enfoque || "Descanso"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setAssignRoutineOpen(true)} hitSlop={8}>
                    <Text style={{ fontSize: 11, color: COACH_ACCENT, fontWeight: "800" }}>Editar</Text>
                  </TouchableOpacity>
                </View>
                {!diaCfgRutina || diaCfgRutina.ejercicios.length === 0 ? (
                  <Text style={{ fontSize: 12, color: COACH_MUTED, marginTop: 10 }}>Día de descanso — sin ejercicios.</Text>
                ) : (
                  diaCfgRutina.ejercicios.map((ej, i) => (
                    <View
                      key={ej.id}
                      style={{ paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: COACH_BORDER, marginTop: i > 0 ? 4 : 10 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{ej.nombre}</Text>
                      <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, marginTop: 1 }}>
                        {ej.series.length} series
                        {ej.series.some(s => s.minWeight > 0 || s.targetReps > 0) && (
                          <Text style={{ color: COACH_ACCENT }}>
                            {" · mín. "}{Math.max(...ej.series.map(s => s.minWeight))}kg · obj. {Math.max(...ej.series.map(s => s.targetReps))} reps
                          </Text>
                        )}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {!rutinaUnassigned && (
              <ViewPlanButton label="👁️ Ver Rutina Actual" onPress={() => setRoutineViewOpen(true)} />
            )}

            {/* ChangeStageModal ya no aplica plantillas de dieta/rutina (se
                simplificó a un asignador rápido de solo etapa/número/fecha —
                ese flujo completo con plantillas vive en
                BulkPeriodizationWizard para asignación masiva), así que ya
                no puede pisar en silencio una rutina estricta al usarse — el
                aviso de colisión que vivía aquí quedó sin caso real y se quitó. */}
            <TouchableOpacity onPress={() => setChangeStageOpen(true)} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: COACH_MUTED, textDecorationLine: "underline" }}>
                Cambiar etapa
              </Text>
            </TouchableOpacity>

            <SectionLabel>Récords personales</SectionLabel>
            {/* Student.prSquat/prDeadlift/prBench are single current-best
                scalars on the roster row itself — no PR history table exists
                on the backend, so this shows the real current bests instead
                of a fabricated timeline. */}
            {student.prSquat > 0 || student.prDeadlift > 0 || student.prBench > 0 ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                {[
                  { lift: "Sentadilla", weight: student.prSquat },
                  { lift: "Peso muerto", weight: student.prDeadlift },
                  { lift: "Press banca", weight: student.prBench },
                ].filter(pr => pr.weight > 0).map((pr, i) => (
                  <View
                    key={pr.lift}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: COACH_BORDER }}
                  >
                    <Text className="font-bold" style={{ fontSize: 12, color: "#fff" }}>{pr.lift}</Text>
                    <Text className="font-black" style={{ fontSize: 16, color: COACH_ACCENT }}>{pr.weight}kg</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 12, color: COACH_MUTED }}>Aún no hay récords personales registrados.</Text>
              </View>
            )}
          </>
        )}

        {tab === "nutricion" && (
          <>
            <SectionLabel>Dieta asignada</SectionLabel>
            <WeekdayBar selected={selectedDia} onSelect={setSelectedDia} filled={diasConComidas} />

            {dietUnassigned ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setAssignDietOpen(true)}
                style={{
                  height: 52, borderRadius: 16, backgroundColor: COACH_ACCENT, marginTop: 10,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Plus size={16} color="#000" strokeWidth={2.5} />
                <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>+ Asignar dieta</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16, marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text className="font-black" style={{ fontSize: 14, color: "#fff" }}>{dieta.nombre}</Text>
                    <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, marginTop: 2 }}>{DIA_LABEL[selectedDia]}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setAssignDietOpen(true)} hitSlop={8}>
                    <Text style={{ fontSize: 11, color: COACH_ACCENT, fontWeight: "800" }}>Editar</Text>
                  </TouchableOpacity>
                </View>
                {!diaCfgDieta || diaCfgDieta.comidas.length === 0 ? (
                  <Text style={{ fontSize: 12, color: COACH_MUTED, marginTop: 10 }}>Sin comidas asignadas este día.</Text>
                ) : (
                  <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED, marginTop: 8 }}>
                    {diaCfgDieta.comidas.length} COMIDAS
                  </Text>
                )}
              </View>
            )}

            {/* Control visual del plan — anillos de macros del día seleccionado
                (Módulo "Visualización Intuitiva"), reemplaza la fila de texto
                plano P/C/G anterior. */}
            {!dietUnassigned && diaCfgDieta && diaCfgDieta.comidas.length > 0 && (
              <MacroRingsRow macros={diaCfgDieta.macros} kcalObjetivo={diaCfgDieta.kcalObjetivo} />
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setDietCatalogOpen(true)}
              style={{
                height: 44, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: COACH_ACCENT,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <ClipboardList size={14} color={COACH_ACCENT} />
              <Text className="font-bold" style={{ fontSize: 11, color: COACH_ACCENT, letterSpacing: 0.3 }}>
                Cargar Plantilla de Alimentación
              </Text>
            </TouchableOpacity>

            {!dietUnassigned && diaCfgDieta && diaCfgDieta.comidas.length > 0 && (
              <ViewPlanButton label="👁️ Ver Dieta Actual" onPress={() => setDietViewOpen(true)} />
            )}

            {/* Vista mensual de carga — control visual de qué días del mes ya
                tienen contenido programado; tocar una celda salta a ese día
                de semana en el WeekdayBar de arriba. */}
            <MonthlyLoadCalendar
              diasConContenido={diasConComidas}
              selectedDia={selectedDia}
              onSelectDia={setSelectedDia}
            />

            <SectionLabel>Checklist del día</SectionLabel>
            {!esHoy ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 12, color: COACH_MUTED }}>
                  El checklist de cumplimiento solo aplica al día de hoy ({DIA_LABEL[diaSemanaDeHoy()]}).
                </Text>
              </View>
            ) : detailLoading ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={COACH_ACCENT} />
              </View>
            ) : dietUnassigned ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 12, color: COACH_MUTED }}>Asigna una dieta para ver el checklist diario.</Text>
              </View>
            ) : detail && detail.todayMealChecks.length > 0 ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                {detail.todayMealChecks.map((m, i) => (
                  <View
                    key={i}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: COACH_BORDER }}
                  >
                    <View
                      style={{
                        width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
                        backgroundColor: m.completed ? COACH_ACCENT : "transparent",
                        borderWidth: 1.5, borderColor: m.completed ? COACH_ACCENT : COACH_BORDER,
                      }}
                    >
                      {m.completed
                        ? <Check size={12} color="#000" strokeWidth={3} />
                        : <XIcon size={11} color={COACH_MUTED} strokeWidth={2.5} />}
                    </View>
                    <Text style={{ fontSize: 12, color: m.completed ? "#fff" : COACH_MUTED, fontWeight: "600" }}>{m.name}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 12, color: COACH_MUTED }}>No se pudo cargar el checklist de hoy. Desliza hacia abajo para reintentar.</Text>
              </View>
            )}
          </>
        )}

        {tab === "progreso" && (
          <>
            <SectionLabel>Peso histórico</SectionLabel>
            {detailLoading ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={COACH_ACCENT} />
              </View>
            ) : detail && detail.weightHistory.length > 0 ? (
              <WeightHistoryChart points={detail.weightHistory} />
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 12, color: COACH_MUTED }}>No se pudo cargar el historial de peso. Desliza hacia abajo para reintentar.</Text>
              </View>
            )}

            <SectionLabel>Medidas corporales</SectionLabel>
            {detailLoading ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={COACH_ACCENT} />
              </View>
            ) : detail && detail.measurements.length > 0 ? (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <View style={{ flexDirection: "row", marginBottom: 6 }}>
                  <Text className="font-mono" style={{ flex: 1.4, fontSize: 9, color: COACH_MUTED, textTransform: "uppercase" }}>Fecha</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: COACH_MUTED, textTransform: "uppercase", textAlign: "center" }}>Pecho</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: COACH_MUTED, textTransform: "uppercase", textAlign: "center" }}>Cintura</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: COACH_MUTED, textTransform: "uppercase", textAlign: "center" }}>Cadera</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: COACH_MUTED, textTransform: "uppercase", textAlign: "center" }}>Brazos</Text>
                  <Text className="font-mono" style={{ flex: 1, fontSize: 9, color: COACH_MUTED, textTransform: "uppercase", textAlign: "center" }}>Piernas</Text>
                </View>
                {detail.measurements.map((m, i) => (
                  <View key={i} style={{ flexDirection: "row", paddingVertical: 6, borderTopWidth: 1, borderTopColor: COACH_BORDER }}>
                    <Text style={{ flex: 1.4, fontSize: 11, color: "#fff" }}>{m.date}</Text>
                    <Text style={{ flex: 1, fontSize: 11, color: COACH_MUTED, textAlign: "center" }}>{m.chest}</Text>
                    <Text style={{ flex: 1, fontSize: 11, color: COACH_MUTED, textAlign: "center" }}>{m.waist}</Text>
                    <Text style={{ flex: 1, fontSize: 11, color: COACH_MUTED, textAlign: "center" }}>{m.hips}</Text>
                    <Text style={{ flex: 1, fontSize: 11, color: COACH_MUTED, textAlign: "center" }}>{m.armL}/{m.armR}</Text>
                    <Text style={{ flex: 1, fontSize: 11, color: COACH_MUTED, textAlign: "center" }}>{m.thighL}/{m.thighR}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 12, color: COACH_MUTED }}>Aún no hay medidas corporales registradas para este alumno.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Vía secundaria: plantillas de la librería + cambio de etapa. La vía
          primaria para asignar una rutina directa es AssignRoutineModal
          abajo — ambas escriben al mismo routineJson (ver el aviso de
          colisión más arriba). */}
      <ChangeStageModal
        visible={changeStageOpen}
        studentIds={[student.id]}
        initialStage={studentStage}
        initialStageNumber={student.stageNumber}
        onClose={() => setChangeStageOpen(false)}
        onApplied={refresh}
      />

      <AssignRoutineModal
        visible={assignRoutineOpen}
        studentId={student.id}
        initialRoutine={rutina}
        onClose={() => setAssignRoutineOpen(false)}
        onSaved={savedRoutine => {
          // Optimistic local update — roster's routineJson (raw string)
          // drives both this screen's `rutina` and the "sin rutina" CTA
          // elsewhere, so patch it immediately instead of waiting on refresh().
          patchStudent(student.id, { routineJson: JSON.stringify(savedRoutine) });
        }}
      />

      <AssignDietModal
        visible={assignDietOpen}
        studentId={student.id}
        initialDieta={dieta}
        onClose={() => setAssignDietOpen(false)}
        onSaved={savedDiet => {
          // Optimistic local update — roster's dietJson (raw string) drives
          // both this screen's `dieta` and the "sin dieta" chip elsewhere, so
          // patch it immediately instead of waiting on a full refresh().
          patchStudent(student.id, { dietJson: JSON.stringify(savedDiet) });
          // The checklist reads today's checks against the NEW meal list —
          // reload so it doesn't show yesterday's (now stale) meal names.
          reloadDetail();
        }}
      />

      <DietTemplateCatalogModal
        visible={dietCatalogOpen}
        studentId={student.id}
        onClose={() => setDietCatalogOpen(false)}
        onAssigned={assignedDieta => {
          // Mismo patrón que AssignDietModal.onSaved arriba — actualización
          // optimista del roster + recarga del checklist contra las comidas
          // nuevas.
          patchStudent(student.id, { dietJson: JSON.stringify(assignedDieta) });
          reloadDetail();
        }}
      />

      {/* ── Inspección de solo lectura — lectura instantánea sin editor ── */}
      <ReadOnlyPlanModal
        visible={routineViewOpen}
        onClose={() => setRoutineViewOpen(false)}
        title="Rutina actual"
        subtitle={`Semana ${selectedSemana} · ${DIA_LABEL[selectedDia]} · ${diaCfgRutina?.enfoque || "Descanso"}`}
      >
        {!diaCfgRutina || diaCfgRutina.ejercicios.length === 0 ? (
          <Text style={{ fontSize: 13, color: COACH_MUTED, textAlign: "center", marginTop: 40 }}>
            Día de descanso — sin ejercicios programados.
          </Text>
        ) : (
          diaCfgRutina.ejercicios.map(ej => {
            // Resumen de pirámide — "3x12,8,6" — condensa la misma lista de
            // series que ya se desglosa abajo fila por fila, para una
            // lectura instantánea del patrón antes de entrar al detalle.
            const piramide = `${ej.series.length}x${ej.series.map(s => s.targetReps).join(",")}`;
            return (
              <View key={ej.id} style={{ ...CARD, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text className="font-black" style={{ fontSize: 14, color: "#fff" }}>{ej.nombre}</Text>
                    {!!ej.grupoMuscular && (
                      <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginTop: 2 }}>{ej.grupoMuscular}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text className="font-black" style={{ fontSize: 13, color: COACH_ACCENT }}>{piramide}</Text>
                    {!!ej.descanso && (
                      <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, marginTop: 1 }}>
                        Descanso {ej.descanso}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={{ marginTop: 10, gap: 6 }}>
                  {ej.series.map(s => (
                    <View
                      key={s.numero}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                      }}
                    >
                      <Text className="font-bold" style={{ fontSize: 11, color: COACH_MUTED }}>Serie {s.numero}</Text>
                      <Text className="font-black" style={{ fontSize: 11, color: COACH_ACCENT }}>
                        {s.minWeight}kg × {s.targetReps} reps{s.tecnica ? ` · ${s.tecnica}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ReadOnlyPlanModal>

      <ReadOnlyPlanModal
        visible={dietViewOpen}
        onClose={() => setDietViewOpen(false)}
        title="Dieta actual"
        subtitle={DIA_LABEL[selectedDia]}
      >
        {!diaCfgDieta || diaCfgDieta.comidas.length === 0 ? (
          <Text style={{ fontSize: 13, color: COACH_MUTED, textAlign: "center", marginTop: 40 }}>
            Sin comidas asignadas este día.
          </Text>
        ) : (
          <>
            {/* Matriz de distribución macro — barras de carga horizontales
                compactas (relleno = participación calórica real: P/C ×4,
                G ×9 kcal/g), junto al total de calorías de la meta. */}
            <View style={{ ...CARD, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, letterSpacing: 1, textTransform: "uppercase" }}>
                  Distribución macro
                </Text>
                <Text className="font-black" style={{ fontSize: 15, color: "#fff" }}>
                  {diaCfgDieta.kcalObjetivo} <Text style={{ fontSize: 10, color: COACH_MUTED }}>KCAL META</Text>
                </Text>
              </View>
              {(() => {
                const pKcal = diaCfgDieta.macros.protein * 4;
                const cKcal = diaCfgDieta.macros.carbs * 4;
                const fKcal = diaCfgDieta.macros.fat * 9;
                const total = Math.max(pKcal + cKcal + fKcal, 1);
                const bars = [
                  { label: "PROTEÍNA", grams: diaCfgDieta.macros.protein, pct: (pKcal / total) * 100, color: COACH_ACCENT },
                  { label: "CARBOHIDRATOS", grams: diaCfgDieta.macros.carbs, pct: (cKcal / total) * 100, color: "#60a5fa" },
                  { label: "GRASAS", grams: diaCfgDieta.macros.fat, pct: (fKcal / total) * 100, color: "#fb923c" },
                ];
                return bars.map(b => (
                  <View key={b.label} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, letterSpacing: 0.5 }}>{b.label}</Text>
                      <Text className="font-black" style={{ fontSize: 11, color: "#fff" }}>{b.grams}g</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: "#1C1C1E", overflow: "hidden" }}>
                      <View style={{ width: `${Math.max(b.pct, 2)}%`, height: "100%", borderRadius: 3, backgroundColor: b.color }} />
                    </View>
                  </View>
                ));
              })()}
            </View>

            {diaCfgDieta.comidas.map(c => {
              // Comida.descripcion es texto libre donde una línea = un ítem
              // (ver types/coach-client.ts) — desglosarlo línea por línea en
              // vez de un párrafo da la lectura de "4 huevos enteros - 100g"
              // por fila que pide la inspección detallada.
              const items = c.descripcion.split("\n").map(l => l.trim()).filter(Boolean);
              return (
                <View key={c.id} style={{ ...CARD, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text className="font-black" style={{ fontSize: 13, color: "#fff", flex: 1, paddingRight: 8 }}>{c.nombre}</Text>
                    <Text className="font-mono" style={{ fontSize: 10, color: COACH_MUTED }}>{c.hora}</Text>
                  </View>
                  {items.length > 0 && (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      {/* Calorías "unitarias" por línea — Comida.kcal solo existe
                          a nivel de comida completa, no hay un valor real por
                          ingrediente en el modelo, así que esto es un reparto
                          proporcional del total real entre sus líneas (marcado
                          "≈"), no una consulta a una base de datos nutricional. */}
                      {items.map((item, i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                          <Text style={{ fontSize: 11, color: COACH_ACCENT, lineHeight: 15 }}>·</Text>
                          <Text style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 15, flex: 1 }}>{item}</Text>
                          <Text className="font-mono" style={{ fontSize: 9, color: COACH_MUTED, lineHeight: 15 }}>
                            ≈{Math.round(c.kcal / items.length)} kcal
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text className="font-mono" style={{ fontSize: 10, color: COACH_ACCENT, marginTop: 8 }}>
                    {c.kcal} KCAL · P {c.macros.protein}g · C {c.macros.carbs}g · G {c.macros.fat}g
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </ReadOnlyPlanModal>
    </SafeAreaView>
  );
}
