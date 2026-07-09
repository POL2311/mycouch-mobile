import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";

// ══════════════════════════════════════════════════════════════════════════════
//  COACH DATA LAYER — types, never-throw parsers, and API contracts mirrored
//  verbatim from MYCOACH_COACH_ASSIGNMENT_WEB_BLUEPRINT.md (§1–§2) and the
//  companion MYCOACH_GLOBAL_MASTER_SPEC.md §2.10/§2.12 (roster + templates).
//  No TRPC/React Query — plain fetch() via lib/api.ts, exactly like the rest
//  of this app and the web source it mirrors.
// ══════════════════════════════════════════════════════════════════════════════

// ── §1.2 dietJson snapshot shape (TemplateEditorModal DietData, verbatim) ────
export interface Macros { protein: number; carbs: number; fat: number }
export interface DietMeal {
  name: string; time: string; calories: number;
  protein: number; carbs: number; fat: number;   // flat, as authored/stored
  items: string[];
}
export interface DietData {
  name: string;
  totalCalories: number;
  macros: Macros;
  meals: DietMeal[];
}

// ── §1.3 routineJson snapshot shape (TemplateEditorModal RoutineData) ───────
export interface RoutineExerciseAuth {
  ejercicioId?: string | null;
  name: string;
  bodyweight?: boolean;
  sets: number;
  reps: string;      // display string: "10" · "AMRAP" · "12 c/lado" · "45s"
  weight?: string;    // display string: "40 kg" · ""
  rest?: string;      // display string: "60s"
}
export interface RoutineDayAuth {
  day: string;                 // weekday DISPLAY name — editor dropdown label only
  label: string;                // e.g. "Push"
  muscleGroup: string;          // free text, e.g. "Pecho · Hombro · Tríceps"
  weekday?: number;             // OPTIONAL ISO pin (0=Sun…6=Sat) — overrides ordinal slot
  exercises: RoutineExerciseAuth[];
}
export interface RoutineData {
  name: string;
  daysPerWeek: number;
  days: RoutineDayAuth[];
}

// ── §2.1 Template CRUD — StoredTemplate = { id, type, name, ...parsedDataJson } ──
export type TemplateType = "diet" | "routine";
export interface StoredDietTemplate   { id: string; type: "diet";    name: string; totalCalories: number; macros: Macros; meals: DietMeal[] }
export interface StoredRoutineTemplate { id: string; type: "routine"; name: string; daysPerWeek: number; days: RoutineDayAuth[] }
export type StoredTemplate = StoredDietTemplate | StoredRoutineTemplate;

// ── §2.6 Ejercicio catalog DTO (verbatim) ────────────────────────────────────
export type Equipment = "Barra" | "Mancuerna" | "Polea" | "Peso corporal" | "Máquina" | "Banda";
export interface EjercicioDTO {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  bodyweight: boolean;
  imageUrl?: string;
  videoUrl?: string;
}

// ── §4.1 canonical vocabularies (verbatim) ───────────────────────────────────
export const STAGES = ["Volumen", "Definición", "Mantenimiento", "Recomposición"] as const;
export type Stage = typeof STAGES[number];

// Verbatim coach-dashboard STAGE_COLORS (MYCOACH_GLOBAL_MASTER_SPEC.md §3.3).
export const STAGE_COLORS: Record<string, string> = {
  "Volumen": "#a78bfa",
  "Definición": "#2dd4bf",
  "Mantenimiento": "#facc15",
  "Recomposición": "#f472b6",
};
export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const MUSCLE_GROUPS = ["Pecho", "Espalda", "Pierna", "Glúteo", "Hombro", "Brazo", "Core", "Cardio"] as const;

// ── §2.2 the assignment mutation payload (verbatim, both coach UIs send this) ──
export interface ChangeStagePayload {
  studentIds: string[];
  stage: Stage;
  stageNumber: number;
  dietTemplateId?: string;
  routineTemplateId?: string;
  executionDate?: string;   // "YYYY-MM-DD"; undefined = immediate
}

// ── §2.5 ScheduledChange row (the pending-change queue, 1-per-student) ──────
export interface ScheduledChangeRow {
  id: string;
  executionDate: string;
  stage: string;
  stageNumber: number;
  dietTemplateId?: string | null;
  routineTemplateId?: string | null;
}

// ── Roster row — full Student row per MYCOACH_GLOBAL_MASTER_SPEC.md §1.1
// (raw Prisma scalars; dietJson/routineJson arrive as RAW STRINGS here — the
// roster never parses them, only checks presence via parseDiet/parseRoutine's
// `!json` empty-detector for the "sin dieta"/"sin rutina" chips). ──────────
export interface CoachStudent {
  id: string;
  name: string;
  email: string;
  avatarInitials?: string;
  avatarColor?: string;
  currentWeight: number;
  previousWeight: number;
  lastWeighIn: string;
  stage: string;
  stageNumber: number;
  isActive: boolean;
  // Billing display only — NEVER gates access. `isActive` is the sole access
  // gate and is fully independent of this field (global spec §4.2's "critical
  // invariant"). Keep that split precise everywhere this is consumed.
  paymentStatus: "active" | "inactive" | "grace_period" | "past_due" | string;
  streak: number;
  completionRate: number;
  dietJson: string;
  routineJson: string;
  scheduledChange?: ScheduledChangeRow | null;
}

// Simplified 3-bucket payment view the Pagos/roster-filter screens use over
// the raw 4-value DB enum (spec §2.10/§3.3.2 doesn't name this mapping
// explicitly — grace_period/past_due both read as "pending" to a coach
// scanning for who needs a nudge before they'd call someone "suspended").
export type PaymentBucket = "al_dia" | "pendiente" | "suspendido";
export function paymentBucket(status: string): PaymentBucket {
  if (status === "active") return "al_dia";
  if (status === "grace_period" || status === "past_due") return "pendiente";
  return "suspendido";   // "inactive" and any unrecognized value
}

// ── §2 Coach room profile — GET/PATCH /api/coach/profile (global spec §2.9).
// Backs BOTH the Pagos "TARIFA MENSUAL" panel and the Sala "TOKEN DE ACCESO"
// panel — they're the same three Coach scalar fields. ──────────────────────
export interface CoachRoomProfile {
  isPublic: boolean;
  joinCode: string | null;
  monthlyPrice: number;
}

// ── Coach notices (Tablón de Avisos) — GroupMessage rows with role:"COACH",
// management surface per the Salas blueprint §1.4. ──────────────────────────
export interface CoachNotice {
  id: string;
  senderName: string;
  content: string;
  createdAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
//  §3.1 NEVER-THROW PARSE FALLBACKS — the empty/unassigned detectors, verbatim
// ══════════════════════════════════════════════════════════════════════════════
export const EMPTY_DIET: DietData = {
  name: "Dieta no asignada", totalCalories: 0,
  macros: { protein: 0, carbs: 0, fat: 0 }, meals: [],
};
export const EMPTY_ROUTINE: RoutineData = {
  name: "Rutina no asignada", daysPerWeek: 0, days: [],
};

export function parseDiet(json: string): DietData {
  if (!json) return EMPTY_DIET;
  try {
    const parsed = JSON.parse(json) as Partial<DietData>;
    return {
      name: parsed.name ?? EMPTY_DIET.name,
      totalCalories: parsed.totalCalories ?? 0,
      macros: parsed.macros ?? { protein: 0, carbs: 0, fat: 0 },
      meals: Array.isArray(parsed.meals) ? parsed.meals : [],
    };
  } catch {
    return EMPTY_DIET;
  }
}

export function parseRoutine(json: string): RoutineData {
  if (!json) return EMPTY_ROUTINE;
  try {
    const parsed = JSON.parse(json) as Partial<RoutineData>;
    return {
      name: parsed.name ?? EMPTY_ROUTINE.name,
      daysPerWeek: parsed.daysPerWeek ?? 0,
      days: Array.isArray(parsed.days) ? parsed.days : [],
    };
  } catch {
    return EMPTY_ROUTINE;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  §3.3 TACTICAL CALENDAR DAY RESOLUTION MATH — mirrors lib/workout.tsx's
//  client-side resolver so the coach's authoring UI can show the SAME ordinal
//  mapping the student will actually see: slot 0 → Monday, slot 1 → Tuesday…
//  unless an explicit `weekday` pin overrides it. The `day: "Lunes"` dropdown
//  string is a label only — NOT what schedules the routine. ─────────────────
const ORDINAL_WEEKDAY_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function ordinalScheduleLabel(slotIndex: number, explicitWeekday?: number): string {
  if (typeof explicitWeekday === "number") {
    return `${ORDINAL_WEEKDAY_LABEL[explicitWeekday]} (fijo)`;
  }
  // slot 0 → Monday(1) … slot 5 → Saturday(6) … slot 6 → Sunday(0)
  const jsWeekday = (slotIndex + 1) % 7;
  return ORDINAL_WEEKDAY_LABEL[jsWeekday] ?? "—";
}

// ══════════════════════════════════════════════════════════════════════════════
//  API CONTRACT LAYER — §2 of the blueprint, plus the roster/template routes
//  documented in MYCOACH_GLOBAL_MASTER_SPEC.md §2.10/§2.12.
// ══════════════════════════════════════════════════════════════════════════════

// §2.10 GET /api/students — role-scoped roster; CLIENT always gets [] (never
// an error), so this never throws on a role mismatch either.
export function fetchStudents(token: string): Promise<CoachStudent[]> {
  return api<CoachStudent[]>("/api/students", { token });
}

// GET /api/coach/telemetry — "who did anything today" team pulse
// (MYCOACH_GLOBAL_MASTER_SPEC.md §2.9): union of students with a DailyCheck
// or WorkoutSession dated today, over the coach's roster.
export interface TeamTelemetry { totalStudents: number; activeToday: number; streakPct: number }
export function fetchTeamTelemetry(token: string): Promise<TeamTelemetry> {
  return api<TeamTelemetry>("/api/coach/telemetry", { token });
}

// §2.1 GET /api/templates?type=diet|routine
export function fetchTemplates(type: TemplateType, token: string): Promise<StoredTemplate[]> {
  return api<StoredTemplate[]>(`/api/templates?type=${type}`, { token });
}

// §2.1 POST /api/templates — server strips {id,type,name} off `data`.
export function createTemplate(
  type: TemplateType, name: string, data: Omit<DietData, "name"> | Omit<RoutineData, "name">, token: string,
): Promise<StoredTemplate> {
  return api<StoredTemplate>("/api/templates", { method: "POST", token, body: { type, name, ...data } });
}

// §2.1 PUT /api/templates/[id]
export function updateTemplate(
  id: string, name: string, data: Omit<DietData, "name"> | Omit<RoutineData, "name">, token: string,
): Promise<StoredTemplate> {
  return api<StoredTemplate>(`/api/templates/${id}`, { method: "PUT", token, body: { name, ...data } });
}

// §2.1 DELETE /api/templates/[id] — students keep their snapshots.
export function deleteTemplate(id: string, token: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/templates/${id}`, { method: "DELETE", token });
}

// §2.6 GET /api/ejercicios — COACH own catalog / ADMIN all.
export function fetchEjercicios(token: string): Promise<EjercicioDTO[]> {
  return api<EjercicioDTO[]>("/api/ejercicios", { token });
}

// §2.2 POST /api/students/change-stage — the assignment mutation. Both the
// ChangeStageModal and the BulkPeriodizationWizard send this exact shape.
export function changeStage(payload: ChangeStagePayload, token: string): Promise<{ success: boolean }> {
  // ChangeStagePayload's fixed shape isn't structurally assignable to the
  // api() helper's Record<string, unknown> body param — it's a plain JSON
  // payload either way, so the cast is safe.
  return api<{ success: boolean }>("/api/students/change-stage", {
    method: "POST", token, body: payload as unknown as Record<string, unknown>,
  });
}

// GET/PATCH /api/coach/profile (global spec §2.9) — the room + billing config.
export function fetchCoachRoomProfile(token: string): Promise<CoachRoomProfile> {
  return api<CoachRoomProfile>("/api/coach/profile", { token });
}
export function updateCoachRoomProfile(
  patch: Partial<CoachRoomProfile>, token: string,
): Promise<CoachRoomProfile> {
  return api<CoachRoomProfile>("/api/coach/profile", { method: "PATCH", token, body: patch });
}

// POST /api/coach/students/status — manual paymentStatus override (billing
// display only; never touches isActive, per the access-gate doctrine).
export function setStudentPaymentStatus(
  studentId: string, status: CoachStudent["paymentStatus"], token: string,
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>("/api/coach/students/status", {
    method: "POST", token, body: { studentId, paymentStatus: status },
  });
}

// DELETE /api/coach/students/[id] — soft unlink (coachId: null). History
// survives; this is "DESVINCULAR", never a hard delete.
export function unlinkStudent(studentId: string, token: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/coach/students/${studentId}`, { method: "DELETE", token });
}

// GET /api/coach/notices (take 50) + DELETE /api/coach/notices/[id]
// (ownership-checked) — Tablón de Avisos management.
export function fetchCoachNotices(token: string): Promise<CoachNotice[]> {
  return api<CoachNotice[]>("/api/coach/notices", { token });
}
export function deleteCoachNotice(id: string, token: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/coach/notices/${id}`, { method: "DELETE", token });
}

// ══════════════════════════════════════════════════════════════════════════════
//  COACH ROSTER PROVIDER — mirrors PortalProvider's shape/conventions exactly
//  (single mount-time fetch + manual refresh(), silent network-failure
//  tolerance, isLoading gate) so coach screens follow the same data contract
//  client screens already do.
// ══════════════════════════════════════════════════════════════════════════════
interface CoachState {
  students:  CoachStudent[];
  isLoading: boolean;
  refresh:   () => Promise<void>;
}

const CoachContext = createContext<CoachState | null>(null);

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [students,  setStudents]  = useState<CoachStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await fetchStudents(token);
      setStudents(Array.isArray(rows) ? rows : []);
    } catch {
      // Silently tolerate network failures — screens handle the empty state.
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <CoachContext.Provider value={{ students, isLoading, refresh }}>
      {children}
    </CoachContext.Provider>
  );
}

export function useCoach(): CoachState {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error("useCoach must be inside <CoachProvider>");
  return ctx;
}
