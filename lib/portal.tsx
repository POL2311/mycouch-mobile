import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";
import {
  parseDietaJson, parseRoutineJson, dietaJsonToPortalDiet, routineJsonToPortalRoutine,
  dietaEstaVacia, rutinaEstaVacia,
  type NumeroSemana,
} from "@/types/coach-client";
import type { CoachRequest } from "@/types/coachRequest";

// ── Types mirroring the web /api/me response shape ─────────────────────────

export interface RoutineExercise {
  name:         string;
  sets:         number;
  reps:         string;
  muscleGroup?: string;
  tips?:        string[];
  // Extra fields resolved from the coach's exercise catalogue — ignored by mobile UI.
  ejercicioId?: string | null;
  bodyweight?:  boolean;
  weight?:      string;
  rest?:        string;
  imageUrl?:    string;
  videoUrl?:    string;
  // Additive — only present for exercises assigned via the strict routine
  // builder (types/coach-client.ts EjercicioAsignado.series). Index i is the
  // per-set threshold for the i-th set the student logs. Absent entirely for
  // legacy/Template-authored exercises, which stay unenforced.
  series?:      { minWeight: number; targetReps: number; tecnica?: string }[];
}

export interface RoutineDay {
  label:     string;        // normalised by /api/mobile/portal from `day` or `label`
  focus?:    string;        // normalised from `muscleGroup` or `focus`
  // Explicit weekday pin, passthrough of the web's `weekday` field (assignment
  // blueprint §3.3): JS Date#getDay convention, 0=Sun…6=Sat. When present it
  // overrides ordinal position for day resolution; the current coach-side
  // editor never authors it, so most routines resolve ordinally instead.
  dayIndex?: number;
  exercises: RoutineExercise[];
}

// Newer authored dietJson variant (master spec §1.4.1) — per-ingredient rows
// with grams/calories/macros. Older plans only carry `items: string[]`.
export interface MealIngredient {
  name:      string;
  grams?:    number;
  calories?: number;
  unit?:     string;
  unitQty?:  number;
  icon?:     string;
  macros?:   { protein: number; carbs: number; fat: number };
}

export interface Meal {
  name:     string;
  time:     string;
  calories: number;
  items:    string[];
  // The API normalises both flat (protein/carbs/fat) and nested shapes to `macros`.
  macros:   { protein: number; carbs: number; fat: number };
  // Optional hero image for the web-style overlay meal card (e.g. "Desayuno
  // Anabólico"); cards fall back to the flat layout when absent.
  imageUrl?: string;
  // Present only on newer authored plans; consumers must synthesize from
  // `items` when absent.
  ingredients?: MealIngredient[];
}

export interface Student {
  id:            string;
  name:          string;
  email:         string;
  avatarUrl?:    string | null;
  currentWeight: number;
  streak:        number;
  stage:         string;
  stageNumber:   number;
  prSquat:       number;
  prDeadlift:    number;
  prBench:       number;
  // Real field, already returned by toStudent() in mycouch's db.ts (never
  // stripped) — just not previously declared on mobile's Student type.
  // null/undefined = no coach linked (Módulo 2 "Modo Auto-Entrenador").
  coachId?:      string | null;
}

// isSelfCoached se deriva de coachId real — mycouch no tiene (ni puede
// ganar, dado que no editamos ese repo) un campo Student.isSelfCoached
// propio; Student.coachId YA es opcional en el schema (`coachId String?`),
// así que "sin coach" es una condición 100% real y ya representable, solo
// hacía falta exponerla y nombrarla en el cliente.
export function isSelfCoached(student: Student | null | undefined): boolean {
  return !student?.coachId;
}

// Per-day diet override — client-side mirror of DietDayAuth (lib/coach.tsx),
// same dayIndex convention as RoutineDay above (JS Date#getDay, 0=Sun…6=Sat;
// present = explicit pin, absent = resolved ordinally).
export interface DietDay {
  label:         string;
  dayIndex?:     number;
  totalCalories: number;
  macros:        { protein: number; carbs: number; fat: number };
  meals:         Meal[];
}

export interface PortalDetail {
  height?:   number;
  bodyFat?:  number;
  routine:   {
    name:        string;
    daysPerWeek: number;
    days:        RoutineDay[];
    // Periodización por bloques — a qué semana (1-3) del plan corresponde
    // `days` arriba, resuelta server-side-adjacent en fetchFullAssignment()
    // desde RoutineJson.fechaInicio (types/coach-client.ts). Ausente para
    // alumnos sin rutina asignada por el constructor estricto.
    semanaActual?: { numero: NumeroSemana; nombre: string };
  };
  diet: {
    name:           string;
    totalCalories:  number;
    macros:         { protein: number; carbs: number; fat: number };
    meals:          Meal[];
    // NEW — additive, backward compatible. Absent/empty = fixed week-round
    // diet (existing behavior, untouched); non-empty = per-day, resolved via
    // resolveDietDay() below exactly like routine.days already is.
    days?:          DietDay[];
  };
  weightHistory:  { weight: number; date: string }[];
  measurements:   { date: string; weight: number }[];
  // Galería de progreso real (Módulo 4 "Ver Evolución Completa") — viene del
  // mismo GET /api/students/[id] sin recortar que ya usa fetchFullAssignment
  // para diet/routine (a diferencia de /api/mobile/portal, que sí recorta
  // campos). Se sube vía POST /api/me/photos (real, sin cambios de backend).
  photos?: { id: string; url: string; label: string; weight: number | null; createdAt: string }[];
  // Asignaciones asimétricas (Módulo 3) — computados en fetchFullAssignment()
  // ANTES del bridge a la forma de UI (dietaEstaVacia/rutinaEstaVacia operan
  // sobre el DietaJson/RoutineJson crudo, types/coach-client.ts). El bridge
  // siempre produce un objeto `diet`/`routine` válido con 0 kcal y arrays
  // vacíos cuando el coach nunca asignó nada — sin esta bandera, la UI no
  // podía distinguir "el coach asignó un plan de 0 kcal" (no ocurre en la
  // práctica, pero no hay forma de afirmarlo) de "nunca hubo plan".
  dietAssigned:    boolean;
  routineAssigned: boolean;
}

// Mirrors resolveRoutineDay() in lib/workout.tsx: explicit dayIndex pin wins
// over ordinal position; otherwise slot 0 = Monday, wrapping through Sunday.
// `forJsWeekday` defaults to the device's actual calendar day (0=Sun…6=Sat,
// Date#getDay convention) so the workout-style "just show today" callers get
// that automatically — but nutrition/index.tsx lets the user BROWSE other
// days of the week via its WeekdayStrip, so it passes the browsed day's
// weekday explicitly rather than always resolving to literal today, keeping
// the shown diet targets consistent with whichever day's meal-checks are
// on screen.
export function resolveDietDay(days: DietDay[], forJsWeekday: number = new Date().getDay()): DietDay | undefined {
  if (days.length === 0) return undefined;
  const explicit = days.find(d => d.dayIndex === forJsWeekday);
  if (explicit) return explicit;
  const appDayIdx = forJsWeekday === 0 ? 7 : forJsWeekday;      // 1=Mon…7=Sun
  return days[appDayIdx - 1];                                   // ordinal, no wrap
}

export interface PortalState {
  student:   Student | null;
  detail:    PortalDetail | null;
  isLoading: boolean;
  refresh:   () => Promise<void>;
  updateStudent: (patch: Partial<Student>) => void;
}

const PortalContext = createContext<PortalState | null>(null);

// GET /api/mobile/portal strips diet/routine fields down to an old flat-meal
// allowlist server-side (normaliseMeals/normaliseRoutineDays in the backend
// route) — any field outside it, including per-day configuracionPorDia and
// strict-set minWeight/targetReps, is silently dropped before it ever
// reaches the app. GET /api/students/[id] has no such stripping (a CLIENT is
// allowed to fetch their OWN record via this same coach-facing route — see
// types/coach-client.ts's module doc comment for the full reasoning), so
// this pulls diet/routine from there instead, bridged into the exact shape
// the rest of the portal already consumes. Never throws — a failure here
// just means the caller keeps whatever it already had.
async function fetchFullAssignment(
  studentId: string, token: string,
): Promise<{
  diet: PortalDetail["diet"]; routine: PortalDetail["routine"]; photos: PortalDetail["photos"];
  dietAssigned: boolean; routineAssigned: boolean;
} | null> {
  try {
    const res = await api<{ detail?: { diet?: unknown; routine?: unknown; photos?: PortalDetail["photos"] } }>(
      `/api/students/${studentId}`, { token },
    );
    const dietaJson   = parseDietaJson(res.detail?.diet);
    const routineJson = parseRoutineJson(res.detail?.routine);
    return {
      diet: dietaJsonToPortalDiet(dietaJson),
      routine: routineJsonToPortalRoutine(routineJson),
      photos: res.detail?.photos ?? [],
      dietAssigned: !dietaEstaVacia(dietaJson),
      routineAssigned: !rutinaEstaVacia(routineJson),
    };
  } catch {
    return null;
  }
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [student,   setStudent]   = useState<Student | null>(null);
  const [detail,    setDetail]    = useState<PortalDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api<{ student: Student; detail: PortalDetail }>(
        "/api/mobile/portal",
        { token },
      );
      setStudent(d.student);
      const full = await fetchFullAssignment(d.student.id, token);
      setDetail(full
        ? { ...d.detail, diet: full.diet, routine: full.routine, photos: full.photos, dietAssigned: full.dietAssigned, routineAssigned: full.routineAssigned }
        // fetchFullAssignment failed (network hiccup) — fall back to the
        // stripped /api/mobile/portal payload's own meals/days presence
        // rather than leaving dietAssigned/routineAssigned undefined.
        : { ...d.detail, dietAssigned: (d.detail.diet?.meals?.length ?? 0) > 0, routineAssigned: (d.detail.routine?.days?.length ?? 0) > 0 });
    } catch {
      // Silently tolerate network failures — screens handle null state
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateStudent = useCallback((patch: Partial<Student>) => {
    setStudent(prev => prev ? { ...prev, ...patch } : null);
  }, []);

  return (
    <PortalContext.Provider value={{ student, detail, isLoading, refresh, updateStudent }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalState {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be inside <PortalProvider>");
  return ctx;
}

// GET /api/mobile/community/notices — same endpoint app/(portal)/salas/index.tsx
// already uses for the AVISOS tab (correctly coachId-scoped server-side via
// getRecentCoachNotices), reused here as the source for celebration-modal
// motivational phrases (see lib/coach.tsx's postMotivationalPhrase doc
// comment for why this endpoint over GET /api/templates). Bare array
// response, no wrapper bug on this path (unlike the coach-admin
// GET /api/coach/notices). Never throws — an empty/failed fetch just means
// the celebration modal falls back to its built-in default phrases.
// Shared with lib/coach.tsx's postMotivationalPhrase — GroupMessage rows are
// a shared feed with regular avisos (salas/index.tsx's AVISOS tab), so only
// entries explicitly tagged this way become celebration-modal candidates; a
// schedule-change notice never shows up disguised as a "you crushed it!"
// phrase.
export const MOTIVATION_PREFIX = "🔥 MOTIVACIÓN: ";

export async function fetchMotivationalPhrases(token: string): Promise<string[]> {
  try {
    const notices = await api<{ id: string; senderName: string; role: string; content: string; createdAt: string }[]>(
      "/api/mobile/community/notices", { token },
    );
    if (!Array.isArray(notices)) return [];
    return notices
      .filter(n => n.role === "COACH" && n.content.startsWith(MOTIVATION_PREFIX))
      .map(n => n.content.slice(MOTIVATION_PREFIX.length).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Community "sindicato" join — POST /api/community/join ───────────────────
// Extraído verbatim de app/(portal)/salas/index.tsx's executeJoin() para que
// sea testeable sin montar la pantalla completa de Salas (que depende de
// expo-blur, moti, y varios providers anidados). Deliberadamente usa fetch
// crudo en vez de lib/api.ts's api() — ese helper lanza ApiError con un
// mensaje formateado distinto al shape { error } que este endpoint devuelve,
// y la UI de Salas ya está escrita contra ese shape original; cambiarlo
// habría alterado el copy de error mostrado al alumno.
const PORTAL_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export interface CommunityNotice { id: string; senderName: string; role: string; content: string; createdAt: string }

export interface CommunityJoinResult {
  ok: boolean;
  error?: string;
  coachName?: string;
  coachId?: string;
  notices?: CommunityNotice[];
}

// ── Progress photo upload — POST /api/me/photos (real, no backend changes;
// see NSPhotoLibraryUsageDescription in app.json). Used by Módulo 4's
// monthly evolution gallery. Raw fetch + FormData like joinCommunityRoom
// above — api()'s JSON Content-Type would break the multipart boundary.
export async function uploadProgressPhoto(uri: string, label: string, token: string, weight?: number): Promise<{ id: string; url: string; label: string; createdAt: string; weight: number | null } | null> {
  try {
    const formData = new FormData();
    const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    formData.append("file", { uri, name: `photo.${ext}`, type: mime } as unknown as Blob);
    formData.append("label", label);
    if (weight !== undefined) {
      formData.append("weight", weight.toString());
    }
    const res = await fetch(`${PORTAL_BASE_URL}/api/me/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteProgressPhoto(photoId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/me/photos/${photoId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function editProgressPhoto(
  photoId: string, 
  payload: { label?: string; weight?: number | null; createdAt?: string }, 
  token: string
): Promise<boolean> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/me/photos/${photoId}`, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function joinCommunityRoom(payload: { code?: string; roomId?: string }, token: string | null): Promise<CommunityJoinResult> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/community/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string; coachName?: string; coachId?: string; notices?: CommunityNotice[] };
    return res.ok
      ? { ok: true, coachName: data.coachName, coachId: data.coachId, notices: data.notices ?? [] }
      : { ok: false, error: data?.error ?? "ERROR_DESCONOCIDO" };
  } catch {
    return { ok: false, error: "SIN_CONEXIÓN" };
  }
}

// ── Solicitudes de Coaching (Módulo 2) ──────────────────────────────────────
export async function sendCoachRequest(coachId: string, token: string, message?: string): Promise<boolean> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ coachId, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchMyRequests(token: string): Promise<CoachRequest[]> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
