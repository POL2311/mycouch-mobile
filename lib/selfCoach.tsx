import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseDietaJson, parseRoutineJson, dietaJsonToPortalDiet, routineJsonToPortalRoutine,
  type DietaJson, type RoutineJson,
} from "@/types/coach-client";
import type { StoredDietTemplate, StoredRoutineTemplate } from "@/lib/coach";
import type { PortalDetail } from "@/lib/portal";

// ── Módulo 2 "Auto-Entrenador" — infraestructura de plan local ──────────────
// mycouch no tiene NINGÚN endpoint donde un CLIENT pueda escribir su propio
// dietJson/routineJson (POST/PUT /api/students/[id] son coach/admin-only, y
// no existe ruta pública de auto-registro); solo lo puede escribir un coach.
// Un alumno sin coach (Student.coachId null — ver isSelfCoached en
// lib/portal.tsx) no tiene entonces ninguna vía real para que un plan
// aterrice en su registro del servidor.
//
// Lo que SÍ es real: GET /api/templates (accesible a cualquier usuario
// autenticado, sin filtro de rol) y los endpoints de registro de progreso
// (POST /api/student/workout-session, POST /api/me/checks) que no validan
// contra ningún routineJson/dietJson asignado — aceptan cualquier
// name/exerciseLogs o kind/itemKey que se les envíe. Eso significa que un
// plan elegido de la plantillas reales SÍ puede alimentar sesiones y
// checklists reales, solo que "cuál es mi plan" vive en este dispositivo
// (AsyncStorage) en vez de en Student.routineJson/dietJson — se declara así
// explícitamente en toda la UI que lo consume, nunca se presenta como
// sincronizado con el coach (que no existe en este modo).
const LOCAL_ROUTINE_KEY = "mc:self_coach_routine";
const LOCAL_DIET_KEY    = "mc:self_coach_diet";

interface SelfCoachState {
  localRoutine: RoutineJson | null;
  localDiet:    DietaJson | null;
  // Ya en la forma que consume el resto del portal (mismo bridge que usan
  // los planes reales del coach) — listos para sustituir a detail.routine/diet
  // cuando no hay asignación real y el usuario es auto-entrenador.
  localRoutineBridge: PortalDetail["routine"] | null;
  localDietBridge:    PortalDetail["diet"] | null;
  applyRoutineTemplate: (tpl: StoredRoutineTemplate) => Promise<void>;
  applyDietTemplate:    (tpl: StoredDietTemplate) => Promise<void>;
  clearRoutine: () => Promise<void>;
  clearDiet:    () => Promise<void>;
}

const SelfCoachContext = createContext<SelfCoachState | null>(null);

export function SelfCoachProvider({ children }: { children: React.ReactNode }) {
  const [localRoutine, setLocalRoutine] = useState<RoutineJson | null>(null);
  const [localDiet,    setLocalDiet]    = useState<DietaJson | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LOCAL_ROUTINE_KEY)
      .then(raw => { if (raw) setLocalRoutine(JSON.parse(raw)); })
      .catch(() => {});
    AsyncStorage.getItem(LOCAL_DIET_KEY)
      .then(raw => { if (raw) setLocalDiet(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const applyRoutineTemplate = useCallback(async (tpl: StoredRoutineTemplate) => {
    // StoredRoutineTemplate ({name, daysPerWeek, days}) es exactamente la
    // forma "legado" que parseRoutineJson ya sabe migrar al formato nuevo
    // (semanas × configuracionPorDia) — mismo parser que usan los planes
    // reales asignados por un coach, cero lógica duplicada.
    const parsed = parseRoutineJson(tpl);
    setLocalRoutine(parsed);
    await AsyncStorage.setItem(LOCAL_ROUTINE_KEY, JSON.stringify(parsed)).catch(() => {});
  }, []);

  const applyDietTemplate = useCallback(async (tpl: StoredDietTemplate) => {
    const parsed = parseDietaJson(tpl);
    setLocalDiet(parsed);
    await AsyncStorage.setItem(LOCAL_DIET_KEY, JSON.stringify(parsed)).catch(() => {});
  }, []);

  const clearRoutine = useCallback(async () => {
    setLocalRoutine(null);
    await AsyncStorage.removeItem(LOCAL_ROUTINE_KEY).catch(() => {});
  }, []);

  const clearDiet = useCallback(async () => {
    setLocalDiet(null);
    await AsyncStorage.removeItem(LOCAL_DIET_KEY).catch(() => {});
  }, []);

  const localRoutineBridge = localRoutine ? routineJsonToPortalRoutine(localRoutine) : null;
  const localDietBridge    = localDiet ? dietaJsonToPortalDiet(localDiet) : null;

  return (
    <SelfCoachContext.Provider value={{
      localRoutine, localDiet, localRoutineBridge, localDietBridge,
      applyRoutineTemplate, applyDietTemplate, clearRoutine, clearDiet,
    }}>
      {children}
    </SelfCoachContext.Provider>
  );
}

export function useSelfCoach(): SelfCoachState {
  const ctx = useContext(SelfCoachContext);
  if (!ctx) throw new Error("useSelfCoach must be inside <SelfCoachProvider>");
  return ctx;
}
