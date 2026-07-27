import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { usePortal } from "@/lib/portal";
import { useSelfCoach } from "@/lib/selfCoach";
import { useAuth } from "@/lib/session";
import { useAppleHealth } from "@/lib/health";
import { api } from "@/lib/api";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";
import type { RoutineExercise, RoutineDay } from "@/lib/portal";

// ── Server sync payload shapes (mirrors mycouch's SessionExercise/SetEntry) ──
interface ServerSetEntry {
  setNumber:  number;
  targetReps: number;
  actualReps: number;
  weight:     number;
  completed:  boolean;
}
interface ServerExerciseLog {
  exerciseName: string;
  muscleGroup:  string | null;
  completed:    boolean;
  sets:         ServerSetEntry[];
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";
export type SessionLifecycle = "IDLE" | "ACTIVE_TRACKING" | "PAUSED" | "COMPLETED";
// Wearable pairing sequence — SCANNING renders the "🔍 BUSCANDO RELOJ..."
// micro-status; telemetry only flows once CONNECTED.
export type WatchStatus = "IDLE" | "SCANNING" | "CONNECTED";

export type BiometricsSnapshot = {
  avgHeartRate:   number;
  maxHeartRate:   number;
  activeCalories: number;
  totalCalories:  number;
  deviceSource:   string;
};

type SavedSession = {
  sessionLifecycle: SessionLifecycle;
  elapsedSeconds:   number;
  date?:            string;
  exercises:        { id: string; completedSets: number }[];
  biometrics?:      BiometricsSnapshot;
};

export function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Coach-assignment day resolution — mirrors the web's resolveRoutineDay
// exactly (assignment blueprint §3.3): an explicit weekday pin wins over
// position; otherwise the routine is ORDINAL (slot 0 = Monday), NOT wrapped
// with modulo. A 3-day routine authored Lunes/Miércoles/Viernes therefore
// resolves on Mon/Tue/Wed and falls through to the empty state on the rest of
// the week — it must not silently replay on every day. `RoutineDay.dayIndex`
// carries the mobile portal's passthrough of the web's `weekday` pin
// (0=Sun…6=Sat, JS Date#getDay convention) when the coach set one. ──────────
function resolveRoutineDay(days: RoutineDay[], targetJsWeekday: number = new Date().getDay()): RoutineDay | undefined {
  if (days.length === 0) return undefined;
  const explicit  = days.find(d => d.dayIndex === targetJsWeekday);
  if (explicit) return explicit;
  const appDayIdx = targetJsWeekday === 0 ? 7 : targetJsWeekday;            // 1=Mon…7=Sun
  return days[appDayIdx - 1];                                   // ordinal, no wrap
}

interface WorkoutState {
  activeDay:      number;
  setActiveDay:   (d: number) => void;
  exercises:      RoutineExercise[];
  routineName:    string;
  dayLabel:       string;
  dayFocus:       string;
  // "Semana 2 · Progresión" — empty string when the assigned routine has no
  // periodización (legacy/Template-authored). See types/coach-client.ts's
  // SEMANA_LABEL / semanaActualPorFecha.
  semanaLabel:    string;
  totalEx:        number;
  hasAssignment:  boolean;
  // Módulo 3 — true si HAY una rutina (real del coach o auto-elegida por un
  // alumno self-coached), sin importar si hoy específicamente es descanso.
  // false solo cuando nunca existió ninguna rutina — la señal exacta para
  // distinguir "descanso programado" de "el coach solo asignó dieta".
  hasAnyRoutine:  boolean;
  // true cuando la rutina activa viene de una plantilla elegida localmente
  // (Módulo 2), no de una asignación real del coach.
  isSelfPlan:     boolean;
  // Portal hydration passthrough — lets consumers distinguish "still fetching
  // the coach's assignment" from "fetched, and today is genuinely unassigned"
  // instead of flashing the empty-state banner during initial load.
  isLoading:      boolean;

  lifecycle:      SessionLifecycle;
  setLifecycle:   (l: SessionLifecycle) => void;
  watchStatus:    WatchStatus;
  doneSets:       Record<number, number>;
  doneEx:         Set<number>;
  setDoneEx:      React.Dispatch<React.SetStateAction<Set<number>>>;
  wDuration:      number;
  biometrics:     BiometricsSnapshot;
  workoutDone:    boolean;
  setWorkoutDone: (b: boolean) => void;
  activeExIdx:    number;
  setActiveExIdx: (i: number) => void;
  restOn:         boolean;
  restSecs:       number;
  restTotal:      number;
  startRest:      () => void;
  skipRest:       () => void;
  extendRest:     (secs: number) => void;
  syncStatus:     SyncStatus;

  handleSetComplete:    (payload?: { weight: number; reps: number }) => Promise<void>;
  syncCompletedSession: () => Promise<void>;
  handleFinalizar:      () => Promise<void>;
  resetSession:         () => void;

  overallPct:      number;
  durationStr:     string;
  allDone:         boolean;
  sortedIndices:   number[];
  lifecycleLabel:  string;
  timerColor:      string;
}

// ── Dev-only fallback routine — see the __DEV__ gate at its one call site
// below for why this must never reach a production bundle. Sample video URL
// points at a real, freely-licensed clip so <VideoView/> has something to
// stream while testing the focus view. ───────────────────────────────────────
const DEV_MOCK_ROUTINE: RoutineExercise[] = [
  {
    name: "PRESS DE BANCA INCLINADO", sets: 4, reps: "8-10", muscleGroup: "PECHO",
    weight: "60", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    name: "REMO CON BARRA", sets: 4, reps: "10-12", muscleGroup: "ESPALDA",
    weight: "50", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
];

const WorkoutContext = createContext<WorkoutState | null>(null);

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const { detail, isLoading: portalLoading } = usePortal();
  const { token } = useAuth();
  const { localRoutineBridge } = useSelfCoach();

  // Módulo 2 "Auto-Entrenador" — cuando el coach nunca asignó una rutina
  // real (detail.routineAssigned === false), un alumno sin coach puede
  // haber elegido una plantilla del catálogo (lib/selfCoach.tsx); esa
  // elección alimenta EXACTAMENTE el mismo pipeline real de sets/XP/sync que
  // una rutina de coach — solo cambia de dónde viene `routine`, nunca cómo
  // se registra el progreso. Un plan local jamás pisa una asignación real.
  const routineAssigned = detail?.routineAssigned ?? (detail?.routine?.days?.length ?? 0) > 0;
  const isSelfPlan = !routineAssigned && !!localRoutineBridge;
  const effectiveRoutine = routineAssigned ? detail?.routine : (isSelfPlan ? localRoutineBridge : detail?.routine);
  // Módulo 3 — distingue "nunca hubo rutina" (ni real ni auto-elegida) de
  // "hay rutina pero hoy es descanso" (routineAssigned/isSelfPlan true,
  // hasAssignment false más abajo) — la pantalla de Workout necesita ambas
  // señales para no confundir un día de descanso legítimo con "solo tienes
  // dieta asignada".
  const hasAnyRoutine = routineAssigned || isSelfPlan;

  const [activeDay, setActiveDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  });

  const routineDays = effectiveRoutine?.days ?? [];
  const activeJsWeekday = activeDay === 7 ? 0 : activeDay;
  const todayDay    = resolveRoutineDay(routineDays, activeJsWeekday);
  // No mock backfill: an unresolved day or an empty exercises[] both mean the
  // coach has not assigned programming for today — totalEx===0 downstream
  // drives the tactical empty state instead of a fabricated split.
  //
  // DEV_MOCK_ROUTINE below is the one deliberate exception, and it's gated
  // hard behind __DEV__ — a compile-time constant Metro strips entirely from
  // production bundles, not a runtime "if empty" check. That distinction
  // matters: completing a set on this screen really does POST to
  // /api/student/workout-session (see syncCompletedSession below), the same
  // endpoint real training data goes to. An ungated fallback would let a real
  // student with a legitimately empty day "complete" a fabricated routine
  // that lands on their coach's dashboard as if it were real. __DEV__ makes
  // that impossible in a release build.
  const exercises: RoutineExercise[] =
    todayDay?.exercises ?? (__DEV__ ? DEV_MOCK_ROUTINE : []);
  const hasAssignment = exercises.length > 0;
  const routineName = effectiveRoutine?.name ?? "RUTINA DE ENTRENAMIENTO";
  const dayLabel    = todayDay?.label ?? "SIN ASIGNAR";
  // Blueprint §1.1: the lobby's H1 is the day's overall muscle focus, not the
  // routine name — "SIN PROGRAMACIÓN" when the coach hasn't assigned today.
  const dayFocus    = todayDay?.focus ?? "SIN PROGRAMACIÓN";
  const semanaActual = effectiveRoutine?.semanaActual;
  const semanaLabel = semanaActual ? `Semana ${semanaActual.numero} · ${semanaActual.nombre}` : "";
  const totalEx     = exercises.length;
  const cacheKey    = `mc:session_demo_${todayDateStr()}`;

  // ── Session state machine ─────────────────────────────────────────────────
  const [lifecycle,   setLifecycle]   = useState<SessionLifecycle>("IDLE");
  const [doneSets,    setDoneSets]    = useState<Record<number, number>>({});
  const [doneEx,      setDoneEx]      = useState<Set<number>>(new Set());
  const [wDuration,   setWDuration]   = useState(0);
  const [biometrics,  setBiometrics]  = useState<BiometricsSnapshot>({
    avgHeartRate: 0, maxHeartRate: 0, activeCalories: 0, totalCalories: 0, deviceSource: "—",
  });
  const [workoutDone, setWorkoutDone] = useState(false);
  const [activeExIdx, setActiveExIdx] = useState(0);
  const [restOn,      setRestOn]      = useState(false);
  const [restSecs,    setRestSecs]    = useState(90);
  const [restTotal,   setRestTotal]   = useState(90);
  const [syncStatus,  setSyncStatus]  = useState<SyncStatus>("idle");
  // Captured live weight/reps per completed set (exerciseIdx → ordered log
  // rows), fed by the Focus View's dual PESO/REPS controller so the session
  // sync carries real values instead of placeholder zeros.
  const [setLogs, setSetLogs] = useState<Record<number, { weight: number; actualReps: number }[]>>({});

  const [watchStatus, setWatchStatus] = useState<WatchStatus>("IDLE");

  const lifecycleRef  = useRef<SessionLifecycle>("IDLE");
  const biometricsRef = useRef<BiometricsSnapshot>({ avgHeartRate: 0, maxHeartRate: 0, activeCalories: 0, totalCalories: 0, deviceSource: "—" });
  const durationRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { lifecycleRef.current  = lifecycle;  }, [lifecycle]);
  useEffect(() => { biometricsRef.current = biometrics; }, [biometrics]);

  // ── Wearable pairing scan — fires the moment a session goes live ─────────
  // NATIVE_BRIDGE: the SCANNING→CONNECTED hop below is where the real
  // WatchConnectivity / CoreBluetooth discovery handshake plugs in; today it
  // resolves after a short discovery window so the UI exercises the full
  // pairing state machine.
  useEffect(() => {
    if (lifecycle === "ACTIVE_TRACKING" && watchStatus === "IDLE") {
      setWatchStatus("SCANNING");
      watchRef.current = setTimeout(() => setWatchStatus("CONNECTED"), 2200);
    }
    if (lifecycle === "IDLE" && watchStatus !== "IDLE") {
      // Session reset → drop the subscription so the next start re-scans.
      if (watchRef.current) clearTimeout(watchRef.current);
      setWatchStatus("IDLE");
    }
  }, [lifecycle, watchStatus]);
  useEffect(() => () => { if (watchRef.current) clearTimeout(watchRef.current); }, []);

  const isTracking = lifecycle === "ACTIVE_TRACKING" || lifecycle === "PAUSED";
  const { heartRate, activeKcal, hasPermissions } = useAppleHealth(isTracking);

  useEffect(() => {
    if (!isTracking || watchStatus !== "CONNECTED") return;
    setBiometrics(prev => ({
      ...prev,
      avgHeartRate: heartRate || 0,
      maxHeartRate: heartRate && heartRate > prev.maxHeartRate ? heartRate : prev.maxHeartRate,
      activeCalories: activeKcal || 0,
      deviceSource: hasPermissions ? "Apple Watch" : "—",
    }));
  }, [isTracking, watchStatus, heartRate, activeKcal, hasPermissions]);

  // ── Mount: hydrate from cache ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return;
        const cache = JSON.parse(raw) as SavedSession;
        const lc    = cache.sessionLifecycle;
        if (lc === "IDLE") return;

        const savedMap      = new Map((cache.exercises ?? []).map(e => [e.id, e.completedSets]));
        const restoredSets: Record<number, number> = {};
        const restoredDone  = new Set<number>();
        exercises.forEach((ex, i) => {
          const clamped = Math.min(savedMap.get(ex.name) ?? 0, ex.sets);
          restoredSets[i] = clamped;
          if (ex.sets > 0 && clamped >= ex.sets) restoredDone.add(i);
        });
        setDoneSets(restoredSets);
        setDoneEx(restoredDone);
        setWDuration(cache.elapsedSeconds ?? 0);
        if (cache.biometrics) setBiometrics(cache.biometrics);
        if (lc === "COMPLETED") { setLifecycle("COMPLETED"); setWorkoutDone(true); return; }
        setLifecycle("PAUSED");
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save on meaningful state change ──────────────────────────────────────
  useEffect(() => {
    if (lifecycle === "IDLE" || lifecycle === "COMPLETED") return;
    const payload: SavedSession = {
      sessionLifecycle: lifecycle,
      elapsedSeconds:   wDuration,
      exercises: exercises.map((ex, i) => ({
        id: ex.name, completedSets: Math.min(doneSets[i] ?? 0, ex.sets),
      })),
      biometrics,
    };
    AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => {});
  }, [lifecycle, doneSets, wDuration, biometrics, cacheKey, exercises]);

  // ── Freeze-on-background ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState !== "active" && lifecycleRef.current === "ACTIVE_TRACKING") {
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (!raw) return;
          const prev = JSON.parse(raw) as SavedSession;
          await AsyncStorage.setItem(cacheKey, JSON.stringify({
            ...prev, sessionLifecycle: "PAUSED", biometrics: biometricsRef.current,
          }));
        } catch {}
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session clock ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (lifecycle !== "ACTIVE_TRACKING") {
      if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      return;
    }
    durationRef.current = setInterval(() => setWDuration(s => s + 1), 1000);
    return () => { if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; } };
  }, [lifecycle]);

  // ── Rest timer ────────────────────────────────────────────────────────────
  // Unmount guard: the duration clock cleans itself up in its own effect, but
  // the rest interval is only cleared via skipRest/expiry — kill it if the
  // provider ever unmounts mid-countdown.
  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);

  const startRest = useCallback(() => {
    setRestOn(true); setRestSecs(90); setRestTotal(90);
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = setInterval(() => {
      setRestSecs(s => {
        if (s <= 1) { clearInterval(restRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  const skipRest = useCallback(() => {
    if (restRef.current) clearInterval(restRef.current);
    setRestOn(false); setRestSecs(90); setRestTotal(90);
  }, []);

  // "+15s" control — stretches both the remaining clock and the arc's total
  // so the halo progress stays proportional after the extension.
  const extendRest = useCallback((secs: number) => {
    setRestSecs(s => s + secs);
    setRestTotal(t => t + secs);
  }, []);

  // ── Set complete handler ──────────────────────────────────────────────────
  // Accepts the Focus View's live PESO/REPS controller values so the captured
  // set log carries real data, not a placeholder.
  const handleSetComplete = useCallback(async (payload?: { weight: number; reps: number }) => {
    const ex = exercises[activeExIdx];
    if (!ex) return;   // day resolved to no/fewer exercises than the stale idx — no-op instead of crashing
    const current = doneSets[activeExIdx] ?? 0;
    if (current >= ex.sets) return;
    const newSets = current + 1;
    const isLast  = newSets >= ex.sets;
    // Tactile tick on every set, in addition to the lifecycle notification.
    triggerImpact();
    setDoneSets(d => ({ ...d, [activeExIdx]: newSets }));
    if (payload) {
      setSetLogs(prev => {
        const arr = [...(prev[activeExIdx] ?? [])];
        arr[current] = { weight: payload.weight, actualReps: payload.reps };
        return { ...prev, [activeExIdx]: arr };
      });
    }
    await Haptics.notificationAsync(
      isLast ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
    if (isLast) {
      setDoneEx(d => new Set([...d, activeExIdx]));
      const next = [...Array(exercises.length).keys()].find(
        i => i !== activeExIdx && (doneSets[i] ?? 0) < exercises[i]!.sets,
      );
      if (next !== undefined) setTimeout(() => setActiveExIdx(next), 600);
    } else {
      startRest();
    }
  }, [activeExIdx, doneSets, exercises, startRest]);

  // ── Server sync — source of truth once a session completes ───────────────
  // AsyncStorage above stays as the in-progress/offline cache; this POST is
  // what makes a finished session visible on the coach dashboard at all.
  const syncCompletedSession = useCallback(async () => {
    if (!token) { setSyncStatus("error"); return; }
    setSyncStatus("syncing");
    try {
      const exerciseLogs: ServerExerciseLog[] = exercises.map((ex, i) => {
        const completedSets    = Math.min(doneSets[i] ?? 0, ex.sets);
        const fallbackReps     = parseInt(ex.reps, 10) || 0;
        return {
          exerciseName: ex.name,
          muscleGroup:  ex.muscleGroup ?? null,
          completed:    ex.sets > 0 && completedSets >= ex.sets,
          sets: Array.from({ length: ex.sets }, (_, s) => {
            // Prefer the real value captured by the Focus View's PESO/REPS
            // controller; fall back to the prescribed reps at 0kg only for
            // sets completed before that controller existed / was skipped.
            const log = setLogs[i]?.[s];
            // Strict-builder exercises (types/coach-client.ts) carry a
            // per-set target; legacy/Template exercises only have one
            // uniform reps string for the whole exercise.
            const targetReps = ex.series?.[s]?.targetReps ?? fallbackReps;
            return {
              setNumber:  s + 1,
              targetReps,
              actualReps: log ? log.actualReps : (s < completedSets ? targetReps : 0),
              weight:     log ? log.weight : 0,
              completed:  s < completedSets,
            };
          }),
        };
      });

      await api("/api/student/workout-session", {
        method: "POST",
        token,
        body: {
          date: todayDateStr(),
          name: `${routineName} — ${dayLabel}`,
          exerciseLogs,
        },
      });

      // The WorkoutSession row must exist before telemetry can attach to it —
      // the POST above guarantees that ordering.
      if (biometrics.avgHeartRate > 0 || biometrics.activeCalories > 0) {
        await api("/api/student/workout-session/telemetry", {
          method: "POST",
          token,
          body: {
            date:           todayDateStr(),
            avgHeartRate:   biometrics.avgHeartRate   || undefined,
            maxHeartRate:   biometrics.maxHeartRate   || undefined,
            activeCalories: biometrics.activeCalories || undefined,
            totalCalories:  biometrics.totalCalories  || undefined,
            deviceSource:   biometrics.deviceSource !== "—" ? biometrics.deviceSource : undefined,
          },
        });
      }

      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }, [token, exercises, doneSets, setLogs, biometrics, routineName, dayLabel]);

  // ── FINALIZAR ─────────────────────────────────────────────────────────────
  const handleFinalizar = useCallback(async () => {
    setLifecycle("COMPLETED");
    setWorkoutDone(true);
    triggerSuccess();
    const finalPayload: SavedSession = {
      sessionLifecycle: "COMPLETED",
      elapsedSeconds:   wDuration,
      date:             todayDateStr(),
      exercises: exercises.map((ex, i) => ({
        id: ex.name, completedSets: Math.min(doneSets[i] ?? 0, ex.sets),
      })),
      biometrics,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(finalPayload)).catch(() => {});
    // Actual sync is kicked off by the watcher effect below, keyed off
    // lifecycle/workoutDone — that also covers resuming a sync that never
    // finished if the app was killed before this POST completed.
  }, [wDuration, exercises, doneSets, biometrics, cacheKey]);

  // Runs the server sync whenever a session becomes COMPLETED and hasn't
  // synced yet — covers both a fresh finalize and restoring a COMPLETED
  // session from AsyncStorage on app relaunch. Safe to re-fire: the server
  // endpoints are upserts keyed by studentId+date.
  useEffect(() => {
    if (lifecycle === "COMPLETED" && workoutDone && syncStatus === "idle") {
      void syncCompletedSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycle, workoutDone, syncStatus]);

  const resetSession = useCallback(() => {
    setLifecycle("IDLE");
    setWorkoutDone(false);
    setDoneSets({});
    setDoneEx(new Set());
    setWDuration(0);
    setActiveExIdx(0);
    setSyncStatus("idle");
    setSetLogs({});
    AsyncStorage.removeItem(cacheKey);
  }, [cacheKey]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const overallPct  = Math.round((doneEx.size / Math.max(totalEx, 1)) * 100);
  const durationStr = `${String(Math.floor(wDuration / 60)).padStart(2, "0")}:${String(wDuration % 60).padStart(2, "0")}`;
  const allDone     = doneEx.size >= totalEx && totalEx > 0;

  const sortedIndices = [...exercises.keys()].sort((a, b) => {
    const aDone = doneEx.has(a) || (doneSets[a] ?? 0) >= exercises[a]!.sets;
    const bDone = doneEx.has(b) || (doneSets[b] ?? 0) >= exercises[b]!.sets;
    return (aDone ? 1 : 0) - (bDone ? 1 : 0);
  });

  const lifecycleLabel = lifecycle === "IDLE"
    ? "LISTO"
    : lifecycle === "ACTIVE_TRACKING" ? "EN CURSO"
    : lifecycle === "PAUSED" ? "PAUSADO"
    : "COMPLETADO";

  // Vitality Core: performance/timers = Teal; paused = warning-amber token.
  const timerColor = lifecycle === "ACTIVE_TRACKING" ? "#CCFF00"
    : lifecycle === "PAUSED" ? "#e5e2e1"
    : "#3f3f46";

  return (
    <WorkoutContext.Provider value={{
      activeDay, setActiveDay,
      exercises, routineName, dayLabel, dayFocus, semanaLabel, totalEx, hasAssignment, hasAnyRoutine, isSelfPlan, isLoading: portalLoading,
      lifecycle, setLifecycle, watchStatus, doneSets, doneEx, setDoneEx, wDuration, biometrics,
      workoutDone, setWorkoutDone, activeExIdx, setActiveExIdx, restOn, restSecs, restTotal,
      startRest, skipRest, extendRest, syncStatus,
      handleSetComplete, syncCompletedSession, handleFinalizar, resetSession,
      overallPct, durationStr, allDone, sortedIndices, lifecycleLabel, timerColor,
    }}>
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout(): WorkoutState {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be inside <WorkoutProvider>");
  return ctx;
}
