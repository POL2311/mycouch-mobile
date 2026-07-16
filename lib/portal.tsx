import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/session";
import { api } from "@/lib/api";

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
  currentWeight: number;
  streak:        number;
  stage:         string;
  stageNumber:   number;
  prSquat:       number;
  prDeadlift:    number;
  prBench:       number;
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

interface PortalState {
  student:   Student | null;
  detail:    PortalDetail | null;
  isLoading: boolean;
  refresh:   () => Promise<void>;
}

const PortalContext = createContext<PortalState | null>(null);

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
      setDetail(d.detail);
    } catch {
      // Silently tolerate network failures — screens handle null state
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <PortalContext.Provider value={{ student, detail, isLoading, refresh }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalState {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be inside <PortalProvider>");
  return ctx;
}
