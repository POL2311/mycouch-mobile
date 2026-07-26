import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { type DietaJson, type RoutineJson } from "@/types/coach-client";
import { MOTIVATION_PREFIX } from "@/lib/portal";

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

// ── Per-day diet override — mirrors RoutineDayAuth's exact shape/convention
// (day label is display-only, weekday is the optional ISO pin that overrides
// ordinal slot position, resolved the same way via ordinalScheduleLabel /
// the client-side resolveDietDay in lib/portal.tsx). Each day carries its
// OWN totalCalories/macros/meals — a leg day and a rest day can have
// completely different targets, not just a different meal list under one
// shared calorie total. ──────────────────────────────────────────────────
export interface DietDayAuth {
  day: string;
  weekday?: number;
  totalCalories: number;
  macros: Macros;
  meals: DietMeal[];
}

export interface DietData {
  name: string;
  // Used directly when `days` is absent/empty (fixed week-round diet, the
  // only mode that existed before per-day diets). When `days` is present and
  // non-empty, these three fields are unused by day-aware consumers and only
  // exist for older clients / the "sin dieta" empty-detector.
  totalCalories: number;
  macros: Macros;
  meals: DietMeal[];
  // NEW — additive, backward compatible. Absent or empty = fixed week-round
  // diet (existing behavior, untouched). Non-empty = per-day diet; each
  // DietDayAuth is independently targeted.
  days?: DietDayAuth[];
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
export interface StoredDietTemplate   { id: string; type: "diet";    name: string; totalCalories: number; macros: Macros; meals: DietMeal[]; days?: DietDayAuth[] }
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
  avatarUrl?: string | null;
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
  // Real Prisma scalars (toStudent() always includes these — confirmed via
  // backend-context.md) — current best-lift values, not a history log.
  prSquat: number;
  prDeadlift: number;
  prBench: number;
  // toStudent() on the backend always includes this (coachId ?? undefined) —
  // never previously declared here because nothing needed it client-side
  // until postMotivationalPhrase() required the coach's own Coach.id, which
  // no endpoint this app calls otherwise exposes back to the coach's own
  // session. Any roster row works as a source since a coach's whole roster
  // shares one coachId.
  coachId?: string;
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
      days: Array.isArray(parsed.days) && parsed.days.length > 0 ? parsed.days : undefined,
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

// ══════════════════════════════════════════════════════════════════════════════
//  Per-student detail — confirmed against the backend source (backend-context.md,
//  generated from a direct read of the `mycouch` repo):
//    GET /api/students/[id] → { student, detail }, NOT a flat object.
//      · student.{prSquat,prDeadlift,prBench}: current single best-lift
//        values — there is no PR *history* table, so no "récord por fecha"
//        list actually exists on the backend.
//      · detail.weightHistory: [{ date, weight }] (WeightEntry rows, asc).
//      · detail.measurements: [{ id, date, chest, waist, hips, armL, armR,
//        thighL, thighR }] (Measurement rows, asc) — real Prisma field
//        names, NOT the invented chest/waist/hip/arms shape this used to
//        assume.
//      · Daily meal-check completion is NOT included here — it lives in
//        DailyCheck rows, read via the separate GET /api/students/[id]/checks
//        (kind: "meal" | "exercise", itemKey = the meal's `name`, per the
//        student-side check-setter in app/(portal)/nutrition/index.tsx).
// ══════════════════════════════════════════════════════════════════════════════
export interface WeightHistoryPoint { date: string; weight: number }

export interface BodyMeasurementPoint {
  date:   string;
  chest:  number;
  waist:  number;
  hips:   number;
  armL:   number;
  armR:   number;
  thighL: number;
  thighR: number;
}

export interface DailyMealCheck { name: string; completed: boolean }

export interface CoachStudentDetail {
  weightHistory:   WeightHistoryPoint[];
  measurements:    BodyMeasurementPoint[];
  todayMealChecks: DailyMealCheck[];
  // Fecha real más reciente de CUALQUIER señal de actividad del alumno —
  // DailyCheck de comida o de ejercicio (GET /api/students/[id]/checks, ya
  // se pedía aquí pero solo se usaba filtrado a "hoy"), o su último
  // lastWeighIn si es más reciente que cualquier check. isRedFlag/
  // daysSinceLastActivity de abajo se calculan sobre ESTO, no solo sobre
  // lastWeighIn — un alumno que marca comidas o series a diario pero no
  // pesa hace semanas ya no se marca como inactivo por error.
  lastActivityDate: string | null;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function mostRecentDateStr(candidates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c).getTime();
    if (!Number.isNaN(t) && t > bestTime) { bestTime = t; best = c; }
  }
  return best;
}

// Versión ligera de la señal de "última actividad real" usada por
// fetchStudentDetail — solo pide GET /api/students/[id]/checks (sin
// weightHistory/measurements/dietJson, que el roster no necesita) para que
// AlumnosScreen pueda calcularla para CADA fila de la lista sin pagar el
// costo completo de fetchStudentDetail por alumno. Nunca lanza: un fallo de
// red para un alumno puntual solo hace que esa fila se quede con su
// lastWeighIn (ya lo tenía disponible desde el roster), nunca rompe la lista.
export async function fetchLastActivityDate(
  studentId: string, token: string, lastWeighIn: string,
): Promise<string | null> {
  try {
    const checks = await api<{ date: string }[]>(`/api/students/${studentId}/checks`, { token });
    return mostRecentDateStr([...(Array.isArray(checks) ? checks.map(c => c.date) : []), lastWeighIn]);
  } catch {
    return lastWeighIn || null;
  }
}

export async function fetchStudentDetail(studentId: string, token: string): Promise<CoachStudentDetail> {
  const [wrapped, checks] = await Promise.all([
    api<{ student: { dietJson: string; lastWeighIn: string; currentWeight: number }; detail: Record<string, unknown> }>(
      `/api/students/${studentId}`, { token },
    ),
    // Read-only compliance feed — same 401/403 rules as the parent route.
    // A student with no checks yet (or a transient failure) just means
    // "nothing done today", never a broken screen.
    api<{ date: string; kind: string; itemKey: string }[]>(`/api/students/${studentId}/checks`, { token })
      .catch(() => [] as { date: string; kind: string; itemKey: string }[]),
  ]);

  const { detail, student } = wrapped as any;

  const weightHistory = asArray<WeightHistoryPoint>(detail?.weightHistory);
  const measurements  = asArray<BodyMeasurementPoint>(detail?.measurements);

  const diet  = parseDiet(student?.dietJson ?? "");
  const today = todayStr();
  const doneToday = new Set(
    checks.filter(c => c.kind === "meal" && c.date === today).map(c => c.itemKey),
  );

  return {
    // A brand-new student always has at least the creation-time weigh-in row
    // on the backend, but this stays defensive: an empty/malformed response
    // still renders a usable single point instead of a blank chart.
    weightHistory: weightHistory.length > 0
      ? weightHistory
      : [{ date: student?.lastWeighIn ?? today, weight: student?.currentWeight ?? 0 }],
    measurements,
    todayMealChecks: diet.meals.map(m => ({ name: m.name, completed: doneToday.has(m.name) })),
    // El check MÁS RECIENTE de cualquier tipo (comida o ejercicio), no solo
    // los de hoy — checks ya trae la lista completa del endpoint, filtrarla
    // a `date === today` arriba era solo para el checklist visual de hoy.
    lastActivityDate: mostRecentDateStr([...checks.map(c => c.date), student?.lastWeighIn]),
  };
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

// POST /api/ejercicios — confirmed real and already role/ownership-checked
// server-side (../mycouch/src/app/api/ejercicios/route.ts): COACH-only,
// accepts a plain JSON body (imageUrl/videoUrl as pasted URL strings — no
// multipart upload path exists on the mobile client). `@@unique([coachId,
// name])` on the backend means a duplicate name 500s; the catalog screen
// surfaces that via the normal api() error message.
export function createEjercicio(
  data: { name: string; muscleGroup: string; equipment: string; bodyweight: boolean; imageUrl?: string; videoUrl?: string },
  token: string,
): Promise<EjercicioDTO> {
  return api<EjercicioDTO>("/api/ejercicios", { method: "POST", token, body: data });
}

// PUT /api/ejercicios/[id] — same body shape, ownership-checked (COACH must
// own the row, or ADMIN).
export function updateEjercicio(
  id: string,
  data: { name: string; muscleGroup: string; equipment: string; bodyweight: boolean; imageUrl?: string; videoUrl?: string },
  token: string,
): Promise<EjercicioDTO> {
  return api<EjercicioDTO>(`/api/ejercicios/${id}`, { method: "PUT", token, body: data });
}

// DELETE /api/ejercicios/[id] — ownership-checked, same as PUT.
export function deleteEjercicio(id: string, token: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/ejercicios/${id}`, { method: "DELETE", token });
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

// PUT /api/students/[id] { detailUpdates: { diet } } — direct diet assignment
// on the student's OWN dietJson (src/lib/db.ts updateStudent(): `if
// (detailUpdates.diet !== undefined) data.dietJson = JSON.stringify(...)`).
// Distinct from createTemplate/updateTemplate, which write to the reusable
// Templates library instead — this is the "asignar directo a este alumno"
// path, using the new per-day contract (types/coach-client.ts). The student
// reads this same dietJson column back via GET /api/students/[id] (its own
// record — see lib/portal.tsx's fetchFullStudentDetail), NOT via
// /api/mobile/portal, whose field-stripping normalizer would silently drop
// anything outside its old flat-meal allowlist.
export function assignStudentDiet(
  studentId: string, diet: DietaJson, token: string,
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/students/${studentId}`, {
    method: "PUT", token, body: { detailUpdates: { diet } } as unknown as Record<string, unknown>,
  });
}

// PUT /api/students/[id] { detailUpdates: { routine } } — direct routine
// assignment, same mechanism as assignStudentDiet above (src/lib/db.ts
// updateStudent(): `if (detailUpdates.routine !== undefined) data.routineJson
// = JSON.stringify(...)`, confirmed real, zero backend changes needed). This
// is the ONLY path that can carry per-set minWeight/targetReps end to end —
// ChangeStageModal's template-based routineTemplateId path writes the OLD
// flat RoutineData shape and has no concept of strict per-set thresholds.
export function assignStudentRoutine(
  studentId: string, routine: RoutineJson, token: string,
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/students/${studentId}`, {
    method: "PUT", token, body: { detailUpdates: { routine } } as unknown as Record<string, unknown>,
  });
}

// Used by ChangeStageModal to warn a coach before a template-based routine
// assignment silently overwrites a routine built with the strict per-set
// builder (both write the same routineJson column — see the module doc
// comment in types/coach-client.ts for why they aren't unified).
export function hasStrictAssignment(routineJson: string): boolean {
  if (!routineJson) return false;
  try {
    const parsed = JSON.parse(routineJson);
    // `semanas` = periodización actual; `configuracionPorDia` = formato de
    // la sesión anterior a la periodización (todavía puede existir en datos
    // no re-guardados) — ambos son "asignación directa estricta".
    return parsed?.semanas !== undefined || parsed?.configuracionPorDia !== undefined;
  } catch {
    return false;
  }
}

// PATCH /api/students/[id] — toggles the real access gate (isActive), fully
// independent of paymentStatus (see CoachStudent's doc comment).
//
// Empirically confirmed real (curl against couch-oqvh.vercel.app): an
// unauthenticated PATCH to this exact path returns 403 {"error":"No
// autorizado"} — a real JSON auth-guard response — not Next.js's 404 page.
// The previous two guesses (/api/coach/students/[id], then
// /api/coach/students/[id]/status) both returned that 404 page, i.e.
// genuinely don't exist. The request BODY shape ({isActive}) still hasn't
// been verified against a real authenticated response, only the route
// itself — if this still fails with a real token, the body/field name is
// the next thing to check, not the path.
export function setStudentActive(
  studentId: string, isActive: boolean, token: string,
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/students/${studentId}`, {
    method: "PATCH", token, body: { isActive },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  RED-FLAG (INACTIVITY) DETECTION — CoachStudent carries no explicit "last
//  activity" field; lastWeighIn is the only real date signal the roster
//  endpoint exposes per student. Labeled generically ("actividad", not
//  "entrenamiento") since a weigh-in isn't specifically a workout log — this
//  computes a real, honest number from real data, not a fabricated one, but
//  it's an approximation of "activity" bounded by what the API actually
//  returns today. ─────────────────────────────────────────────────────────
export const RED_FLAG_INACTIVITY_DAYS = 14;

export function daysSinceLastActivity(lastWeighIn: string): number | null {
  const then = new Date(lastWeighIn);
  if (Number.isNaN(then.getTime())) return null;
  const ms = Date.now() - then.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function isRedFlag(student: Pick<CoachStudent, "lastWeighIn" | "isActive">): boolean {
  if (!student.isActive) return false;   // suspended students aren't "at risk", they're already gated
  const days = daysSinceLastActivity(student.lastWeighIn);
  return days !== null && days >= RED_FLAG_INACTIVITY_DAYS;
}

// GET /api/coach/notices (take 50) + DELETE /api/coach/notices/[id]
// (ownership-checked) — Tablón de Avisos management.
//
// Bug fix: the backend wraps this response as `{ notices: [...] }`
// (../mycouch/src/app/api/coach/notices/route.ts), not a bare array — this
// used to call api<CoachNotice[]>(...) directly and every caller's
// `Array.isArray(rows) ? rows : []` guard silently discarded the wrapped
// object, so the coach's own Tablón de Avisos always rendered empty
// regardless of what was actually in the room. Unwrapped here once so every
// consumer (sala.tsx, and the new motivational-phrases section) gets a real
// array.
export function fetchCoachNotices(token: string): Promise<CoachNotice[]> {
  return api<{ notices: CoachNotice[] }>("/api/coach/notices", { token })
    .then(res => Array.isArray(res.notices) ? res.notices : []);
}
export function deleteCoachNotice(id: string, token: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/coach/notices/${id}`, { method: "DELETE", token });
}

// POST /api/community/messages — confirmed real, role-checked (COACH-only)
// server-side, but never previously called from ANY frontend (mobile or
// web). Used as the persistence for "frases motivacionales" (perfil/index.tsx):
// GroupMessage rows created here are exactly what a student already reads
// via GET /api/mobile/community/notices (correctly coachId-scoped
// server-side — unlike GET /api/templates, which returns every coach's
// templates with no filter, ruled out for this exact reason). The backend
// takes `coachId` verbatim from the body (not derived from the session) —
// callers must supply the coach's own CoachStudent.coachId, read off any
// roster row (see perfil/index.tsx).
export function postMotivationalPhrase(
  coachId: string, phrase: string, senderName: string, token: string,
): Promise<{ id: string }> {
  return api<{ id: string }>("/api/community/messages", {
    method: "POST", token, body: { coachId, content: `${MOTIVATION_PREFIX}${phrase}`, senderName },
  });
}

// Mismo endpoint que postMotivationalPhrase, sin el MOTIVATION_PREFIX — un
// comunicado oficial real (Módulo 4, Feed de la Comunidad del coach), no una
// frase motivacional. Ambos crean la misma fila GroupMessage real; el prefijo
// es la única convención de la app que distingue "para el pool de frases del
// modal de celebración" de "aviso normal del Tablón".
export function postGroupMessage(
  coachId: string, content: string, senderName: string, token: string,
): Promise<{ id: string }> {
  return api<{ id: string }>("/api/community/messages", {
    method: "POST", token, body: { coachId, content, senderName },
  });
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
  // Local, synchronous patch — lets a mutation (e.g. setStudentActive) update
  // the roster instantly instead of waiting on a full refetch, so a coach
  // sees the Suspender/Activar toggle flip the moment they tap it. Callers
  // are responsible for reverting this (pass the inverse patch) if the
  // matching API call then fails.
  patchStudent: (id: string, patch: Partial<CoachStudent>) => void;
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

  const patchStudent = useCallback((id: string, patch: Partial<CoachStudent>) => {
    setStudents(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  return (
    <CoachContext.Provider value={{ students, isLoading, refresh, patchStudent }}>
      {children}
    </CoachContext.Provider>
  );
}

export function useCoach(): CoachState {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error("useCoach must be inside <CoachProvider>");
  return ctx;
}
