// ══════════════════════════════════════════════════════════════════════════════
//  CONTRATO UNIFICADO COACH ↔ ALUMNO — asignación directa por día de la semana.
//
//  Este es el formato para el flujo de asignación DIRECTA a un alumno
//  (AssignDietModal / AssignRoutineModal, PUT /api/students/[id]
//  { detailUpdates: { diet | routine } }) — NO para el sistema de Plantillas
//  (TemplateEditorModal / createTemplate / ChangeStageModal), que sigue
//  usando el contrato viejo (DietData/RoutineData en lib/coach.tsx) sin
//  cambios. Ambos sistemas escriben a las mismas columnas dietJson/routineJson
//  del backend, por eso los parsers de aquí abajo migran el formato viejo sin
//  pérdida en vez de asumir que siempre van a encontrar el formato nuevo.
//
//  Por qué `configuracionPorDia` es un OBJETO indexado por DiaSemana y NO un
//  arreglo `days[]`: el backend (../mycouch/src/lib/db.ts, getStudentDetail())
//  ejecuta `resolveDays()` cada vez que `detail.routine.days` es verdadero,
//  reescribiendo cada ejercicio a una lista fija de campos (ejercicioId, name,
//  muscleGroup, bodyweight, sets, reps, weight, rest) — borrando `series`,
//  `minWeight` y `targetReps` en cada lectura. Usar una clave distinta de
//  `days` hace que ese bloque nunca se dispare. Esto es estructural, no
//  estético — no renombrar esta clave sin volver a verificar esa función.
// ══════════════════════════════════════════════════════════════════════════════

export type DiaSemana =
  | "domingo" | "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado";

// Índice === JS Date#getDay() (0=domingo…6=sábado). Este es el ÚNICO lugar
// donde ese mapeo numérico debe existir — todo lo demás en este archivo y en
// sus consumidores trabaja con la clave DiaSemana, nunca con el número crudo.
export const DIAS_SEMANA: readonly DiaSemana[] =
  ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

export const DIA_LABEL: Record<DiaSemana, string> = {
  domingo: "Domingo", lunes: "Lunes", martes: "Martes", miercoles: "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado",
};

// Orden Lunes-primero (slot 0 = Lunes) — el mismo orden ordinal que ya usan
// DietDayAuth/RoutineDayAuth (lib/coach.tsx) y resolveDietDay/resolveRoutineDay
// cuando NO hay un pin explícito de día. Se usa solo para migrar datos viejos
// que tampoco tenían un pin explícito.
const ORDINAL_MON_FIRST: readonly DiaSemana[] =
  ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export function diaSemanaDeHoy(d: Date = new Date()): DiaSemana {
  return DIAS_SEMANA[d.getDay()]!;
}

function todayISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Periodización por bloques de 3 semanas (estilo Fells Team Pro) ───────────
export type NumeroSemana = 1 | 2 | 3;
export const NUMEROS_SEMANA: readonly NumeroSemana[] = [1, 2, 3];
export const SEMANA_LABEL: Record<NumeroSemana, string> = {
  1: "Adaptación", 2: "Progresión", 3: "Máxima Intensidad",
};

// `fechaInicio` ancla el cálculo — semana 1 = los primeros 7 días desde esa
// fecha, semana 2 los siguientes 7, semana 3 los siguientes 7 y luego se
// QUEDA en 3 indefinidamente (no vuelve a Adaptación solo). Nunca lanza:
// una fecha inválida/futura resuelve a semana 1.
export function semanaActualPorFecha(fechaInicio: string, hoy: Date = new Date()): NumeroSemana {
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return 1;
  const dias = Math.floor((hoy.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
  const semana = Math.floor(Math.max(0, dias) / 7) + 1;
  return (semana > 3 ? 3 : semana < 1 ? 1 : semana) as NumeroSemana;
}

let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

// ── Dieta ────────────────────────────────────────────────────────────────────

export interface Macros { protein: number; carbs: number; fat: number }

export interface Comida {
  id: string;
  hora: string;
  nombre: string;
  descripcion: string;   // ingredientes/notas, texto libre (una línea = un ítem)
  kcal: number;
  macros: Macros;
}

export interface ConfiguracionDiaDieta {
  kcalObjetivo: number;
  macros: Macros;
  comidas: Comida[];
}

export interface DietaJson {
  nombre: string;
  configuracionPorDia: Record<DiaSemana, ConfiguracionDiaDieta>;
}

// ── Rutina ───────────────────────────────────────────────────────────────────

export interface SerieAsignada {
  numero: number;
  minWeight: number;    // kg — 0 = sin mínimo exigido por el coach
  targetReps: number;   // 0 = sin objetivo exigido por el coach
  // Técnica especial de intensidad: "al fallo", "ida y vuelta", o parámetros
  // de cardio como "Velocidad Nivel 5 / Inclinación Nivel 15". Texto libre,
  // display-only — no participa en el bloqueo de peso/reps.
  tecnica?: string;
}

export interface EjercicioAsignado {
  id: string;
  ejercicioId?: string | null;   // referencia opcional al catálogo del coach
  nombre: string;
  grupoMuscular?: string;
  series: SerieAsignada[];
  descanso?: string;    // ej. "60s" — display only
  videoUrl?: string;
  imageUrl?: string;
}

export interface ConfiguracionDiaRutina {
  enfoque: string;       // ej. "Push", "Pierna", "Descanso"
  ejercicios: EjercicioAsignado[];
}

export interface SemanaEntrenamiento {
  numero: NumeroSemana;
  configuracionPorDia: Record<DiaSemana, ConfiguracionDiaRutina>;
}

export interface RoutineJson {
  nombre: string;
  // "YYYY-MM-DD" — ancla de semanaActualPorFecha(). Se fija automáticamente
  // a hoy la primera vez que se asigna una rutina por el constructor
  // estricto; no se edita a mano en esta versión.
  fechaInicio: string;
  semanas: Record<NumeroSemana, SemanaEntrenamiento>;
}

// ── Defaults vacíos (nunca dejar un día ausente — siempre los 7 presentes) ───

function emptyDiaDieta(): ConfiguracionDiaDieta {
  return { kcalObjetivo: 0, macros: { protein: 0, carbs: 0, fat: 0 }, comidas: [] };
}
function emptyDiaRutina(): ConfiguracionDiaRutina {
  return { enfoque: "Descanso", ejercicios: [] };
}

export function emptyDietaJson(nombre = "Dieta no asignada"): DietaJson {
  const configuracionPorDia = {} as Record<DiaSemana, ConfiguracionDiaDieta>;
  for (const dia of DIAS_SEMANA) configuracionPorDia[dia] = emptyDiaDieta();
  return { nombre, configuracionPorDia };
}

function emptyConfiguracionPorDiaRutina(): Record<DiaSemana, ConfiguracionDiaRutina> {
  const configuracionPorDia = {} as Record<DiaSemana, ConfiguracionDiaRutina>;
  for (const dia of DIAS_SEMANA) configuracionPorDia[dia] = emptyDiaRutina();
  return configuracionPorDia;
}

export function emptyRoutineJson(nombre = "Rutina no asignada"): RoutineJson {
  const semanas = {} as Record<NumeroSemana, SemanaEntrenamiento>;
  for (const n of NUMEROS_SEMANA) semanas[n] = { numero: n, configuracionPorDia: emptyConfiguracionPorDiaRutina() };
  return { nombre, fechaInicio: todayISODate(), semanas };
}

export function dietaEstaVacia(d: DietaJson): boolean {
  return DIAS_SEMANA.every(dia => d.configuracionPorDia[dia]?.comidas.length === 0);
}
export function rutinaEstaVacia(r: RoutineJson): boolean {
  return NUMEROS_SEMANA.every(n =>
    DIAS_SEMANA.every(dia => r.semanas[n]?.configuracionPorDia[dia]?.ejercicios.length === 0),
  );
}

// ── Coerción defensiva (JSON no confiable — nunca lanzar) ────────────────────

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function macros(v: any): Macros {
  return {
    protein: num(v?.protein ?? v?.proteina),
    carbs: num(v?.carbs ?? v?.carbohidratos),
    fat: num(v?.fat ?? v?.grasas),
  };
}

// ── Parsers — nunca lanzan (mismo patrón que parseDiet/parseRoutine en
//    lib/coach.tsx §3.1). Detectan el formato nuevo primero; si no está,
//    migran el formato viejo (DietData/RoutineData, plano o con days[]) sin
//    pérdida; si nada calza, devuelven el objeto vacío pero válido. ─────────

// `input` may be a raw JSON string (e.g. CoachStudent.dietJson from the
// roster) OR an already-parsed object (e.g. GET /api/students/[id]'s
// detail.diet, which the backend parses server-side via its own
// JSON.parse-only parseDiet() before returning it) — both call sites exist
// in this app, so this accepts either without the caller needing to care.
export function parseDietaJson(input: unknown): DietaJson {
  if (!input) return emptyDietaJson();
  let parsed: any;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); } catch { return emptyDietaJson(); }
  } else if (typeof input === "object") {
    parsed = input;
  } else {
    return emptyDietaJson();
  }
  if (!parsed || typeof parsed !== "object") return emptyDietaJson();

  // Formato nuevo — ya viene con configuracionPorDia.
  if (parsed.configuracionPorDia && typeof parsed.configuracionPorDia === "object") {
    const configuracionPorDia = {} as Record<DiaSemana, ConfiguracionDiaDieta>;
    for (const dia of DIAS_SEMANA) {
      const c = parsed.configuracionPorDia[dia];
      configuracionPorDia[dia] = c
        ? {
            kcalObjetivo: num(c.kcalObjetivo),
            macros: macros(c.macros),
            comidas: Array.isArray(c.comidas)
              ? c.comidas.map((m: any) => ({
                  id: str(m.id) || genId("comida"),
                  hora: str(m.hora),
                  nombre: str(m.nombre),
                  descripcion: str(m.descripcion),
                  kcal: num(m.kcal),
                  macros: macros(m.macros),
                }))
              : [],
          }
        : emptyDiaDieta();
    }
    return { nombre: str(parsed.nombre, "Dieta no asignada"), configuracionPorDia };
  }

  // Formato viejo por día (DietDayAuth[] — lib/coach.tsx): cada entrada puede
  // traer un `weekday` explícito (0-6, Date#getDay) o resolver ordinalmente
  // Lunes-primero, igual que el viejo resolveDietDay.
  if (Array.isArray(parsed.days) && parsed.days.length > 0) {
    const empty = emptyDietaJson(str(parsed.name, "Dieta no asignada"));
    parsed.days.forEach((d: any, i: number) => {
      const dia: DiaSemana =
        typeof d.weekday === "number" ? DIAS_SEMANA[d.weekday]! : ORDINAL_MON_FIRST[i % 7]!;
      empty.configuracionPorDia[dia] = {
        kcalObjetivo: num(d.totalCalories),
        macros: macros(d.macros),
        comidas: Array.isArray(d.meals)
          ? d.meals.map((m: any) => ({
              id: genId("comida"),
              hora: str(m.time),
              nombre: str(m.name),
              descripcion: Array.isArray(m.items) ? m.items.join("\n") : "",
              kcal: num(m.calories),
              macros: { protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat) },
            }))
          : [],
      };
    });
    return empty;
  }

  // Formato viejo plano (DietData sin days[]) — la misma configuración se
  // replica en los 7 días.
  if (Array.isArray(parsed.meals) || parsed.totalCalories !== undefined) {
    const cfg: ConfiguracionDiaDieta = {
      kcalObjetivo: num(parsed.totalCalories),
      macros: macros(parsed.macros),
      comidas: Array.isArray(parsed.meals)
        ? parsed.meals.map((m: any) => ({
            id: genId("comida"),
            hora: str(m.time),
            nombre: str(m.name),
            descripcion: Array.isArray(m.items) ? m.items.join("\n") : "",
            kcal: num(m.calories),
            macros: { protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat) },
          }))
        : [],
    };
    const result = emptyDietaJson(str(parsed.name, "Dieta no asignada"));
    for (const dia of DIAS_SEMANA) {
      result.configuracionPorDia[dia] = {
        kcalObjetivo: cfg.kcalObjetivo,
        macros: cfg.macros,
        comidas: cfg.comidas.map(c => ({ ...c, id: genId("comida") })),
      };
    }
    return result;
  }

  return emptyDietaJson();
}

// Reconstruye SerieAsignada[] a partir de un ejercicio viejo (sets: count,
// reps/weight: strings libres). NUNCA fabrica un minWeight/targetReps
// exigible a partir de esos strings — un valor mostrado como sugerencia en
// el editor viejo no era un umbral que el alumno haya aceptado, así que las
// series migradas quedan sin exigencia (0/0) y solo preservan la CANTIDAD de
// series, listas para que el coach las configure explícitamente si abre el
// nuevo constructor sobre una rutina vieja.
function seriesDesdeLegado(sets: unknown): SerieAsignada[] {
  const n = Math.max(0, Math.round(num(sets, 0)));
  return Array.from({ length: n }, (_, i) => ({ numero: i + 1, minWeight: 0, targetReps: 0 }));
}

// Parsea un `configuracionPorDia` en formato nuevo (una semana). Reutilizado
// tanto por el formato con `semanas` como por el formato de la sesión
// anterior (una sola configuración, sin semanas — se replica en las 3).
function parseConfiguracionPorDiaRutinaNueva(raw: any): Record<DiaSemana, ConfiguracionDiaRutina> {
  const configuracionPorDia = {} as Record<DiaSemana, ConfiguracionDiaRutina>;
  for (const dia of DIAS_SEMANA) {
    const c = raw?.[dia];
    configuracionPorDia[dia] = c
      ? {
          enfoque: str(c.enfoque, "Descanso"),
          ejercicios: Array.isArray(c.ejercicios)
            ? c.ejercicios.map((e: any) => ({
                id: str(e.id) || genId("ej"),
                ejercicioId: e.ejercicioId ?? null,
                nombre: str(e.nombre),
                grupoMuscular: e.grupoMuscular ? str(e.grupoMuscular) : undefined,
                series: Array.isArray(e.series)
                  ? e.series.map((s: any, i: number) => ({
                      numero: num(s.numero, i + 1),
                      minWeight: num(s.minWeight),
                      targetReps: num(s.targetReps),
                      tecnica: s.tecnica ? str(s.tecnica) : undefined,
                    }))
                  : [],
                descanso: e.descanso ? str(e.descanso) : undefined,
                videoUrl: e.videoUrl ? str(e.videoUrl) : undefined,
                imageUrl: e.imageUrl ? str(e.imageUrl) : undefined,
              }))
            : [],
        }
      : emptyDiaRutina();
  }
  return configuracionPorDia;
}

// Migra el formato legado (RoutineDayAuth[] — lib/coach.tsx): `weekday`
// explícito si existe, si no ordinal Lunes-primero, igual que el viejo
// resolveRoutineDay.
function configuracionPorDiaDesdeLegado(days: any[]): Record<DiaSemana, ConfiguracionDiaRutina> {
  const configuracionPorDia = emptyConfiguracionPorDiaRutina();
  days.forEach((d: any, i: number) => {
    const dia: DiaSemana =
      typeof d.weekday === "number" ? DIAS_SEMANA[d.weekday]! : ORDINAL_MON_FIRST[i % 7]!;
    configuracionPorDia[dia] = {
      enfoque: str(d.label) || str(d.muscleGroup) || "Descanso",
      ejercicios: Array.isArray(d.exercises)
        ? d.exercises.map((ex: any) => ({
            id: genId("ej"),
            ejercicioId: ex.ejercicioId ?? null,
            nombre: str(ex.name),
            grupoMuscular: ex.muscleGroup ? str(ex.muscleGroup) : undefined,
            series: seriesDesdeLegado(ex.sets),
            descanso: ex.rest ? str(ex.rest) : undefined,
            videoUrl: ex.videoUrl ? str(ex.videoUrl) : undefined,
            imageUrl: ex.imageUrl ? str(ex.imageUrl) : undefined,
          }))
        : [],
    };
  });
  return configuracionPorDia;
}

// See parseDietaJson's doc comment above — accepts a raw JSON string or an
// already-parsed object interchangeably.
export function parseRoutineJson(input: unknown): RoutineJson {
  if (!input) return emptyRoutineJson();
  let parsed: any;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); } catch { return emptyRoutineJson(); }
  } else if (typeof input === "object") {
    parsed = input;
  } else {
    return emptyRoutineJson();
  }
  if (!parsed || typeof parsed !== "object") return emptyRoutineJson();

  const nombre = str(parsed.nombre ?? parsed.name, "Rutina no asignada");
  const fechaInicio = typeof parsed.fechaInicio === "string" && parsed.fechaInicio ? parsed.fechaInicio : todayISODate();

  // Formato nuevo — periodización por semanas.
  if (parsed.semanas && typeof parsed.semanas === "object") {
    const semanas = {} as Record<NumeroSemana, SemanaEntrenamiento>;
    for (const n of NUMEROS_SEMANA) {
      const s = parsed.semanas[n];
      semanas[n] = {
        numero: n,
        configuracionPorDia: parseConfiguracionPorDiaRutinaNueva(s?.configuracionPorDia),
      };
    }
    return { nombre, fechaInicio, semanas };
  }

  // Formato de la sesión anterior — una sola configuración sin semanas; se
  // replica igual en las 3 (todavía no había periodización cuando se guardó).
  if (parsed.configuracionPorDia && typeof parsed.configuracionPorDia === "object") {
    const cfg = parseConfiguracionPorDiaRutinaNueva(parsed.configuracionPorDia);
    const semanas = {} as Record<NumeroSemana, SemanaEntrenamiento>;
    for (const n of NUMEROS_SEMANA) {
      semanas[n] = {
        numero: n,
        configuracionPorDia: Object.fromEntries(
          DIAS_SEMANA.map(dia => [dia, {
            enfoque: cfg[dia]!.enfoque,
            ejercicios: cfg[dia]!.ejercicios.map(e => ({ ...e, id: genId("ej") })),
          }]),
        ) as Record<DiaSemana, ConfiguracionDiaRutina>,
      };
    }
    return { nombre, fechaInicio, semanas };
  }

  // Formato legado (RoutineDayAuth[]) — se migra y se replica en las 3 semanas.
  if (Array.isArray(parsed.days) && parsed.days.length > 0) {
    const cfg = configuracionPorDiaDesdeLegado(parsed.days);
    const semanas = {} as Record<NumeroSemana, SemanaEntrenamiento>;
    for (const n of NUMEROS_SEMANA) {
      semanas[n] = {
        numero: n,
        configuracionPorDia: Object.fromEntries(
          DIAS_SEMANA.map(dia => [dia, {
            enfoque: cfg[dia]!.enfoque,
            ejercicios: cfg[dia]!.ejercicios.map(e => ({ ...e, id: genId("ej") })),
          }]),
        ) as Record<DiaSemana, ConfiguracionDiaRutina>,
      };
    }
    return { nombre, fechaInicio, semanas };
  }

  return emptyRoutineJson();
}

// ── Adaptadores hacia el shape que YA consume lib/portal.tsx (DietDay[]/
//    RoutineDay[]) — estampan un dayIndex EXPLÍCITO en los 7 días siempre,
//    lo que hace que resolveDietDay/resolveRoutineDay (ya priorizan el pin
//    explícito sobre la posición ordinal) dejen de depender del orden. Esto
//    es lo que arregla de raíz el bug de "la rutina/dieta no cambia por día"
//    para cualquier alumno asignado con los nuevos modales. ─────────────────

interface PortalMealShape {
  name: string; time: string; calories: number; items: string[];
  macros: Macros; imageUrl?: string;
}
interface PortalDietDayShape {
  label: string; dayIndex: number; totalCalories: number; macros: Macros; meals: PortalMealShape[];
}
export interface PortalDietBridge {
  name: string; totalCalories: number; macros: Macros; meals: PortalMealShape[]; days: PortalDietDayShape[];
}

function comidaAMeal(c: Comida): PortalMealShape {
  return {
    name: c.nombre,
    time: c.hora,
    calories: c.kcal,
    items: c.descripcion ? c.descripcion.split("\n").map(s => s.trim()).filter(Boolean) : [],
    macros: c.macros,
  };
}

export function dietaJsonToPortalDiet(d: DietaJson): PortalDietBridge {
  const days: PortalDietDayShape[] = DIAS_SEMANA.map((dia, dayIndex) => {
    const cfg = d.configuracionPorDia[dia] ?? emptyDiaDieta();
    return {
      label: DIA_LABEL[dia],
      dayIndex,
      totalCalories: cfg.kcalObjetivo,
      macros: cfg.macros,
      meals: cfg.comidas.map(comidaAMeal),
    };
  });
  const hoy = d.configuracionPorDia[diaSemanaDeHoy()] ?? emptyDiaDieta();
  return {
    name: d.nombre,
    totalCalories: hoy.kcalObjetivo,
    macros: hoy.macros,
    meals: hoy.comidas.map(comidaAMeal),
    days,
  };
}

interface PortalSetShape { minWeight: number; targetReps: number; tecnica?: string }
interface PortalExerciseShape {
  name: string; sets: number; reps: string; muscleGroup?: string;
  ejercicioId?: string | null; weight?: string; rest?: string;
  imageUrl?: string; videoUrl?: string; series?: PortalSetShape[];
}
interface PortalRoutineDayShape {
  label: string; focus?: string; dayIndex: number; exercises: PortalExerciseShape[];
}
export interface PortalRoutineBridge {
  name: string; daysPerWeek: number; days: PortalRoutineDayShape[];
  semanaActual: { numero: NumeroSemana; nombre: string };
}

function ejercicioAExercise(e: EjercicioAsignado): PortalExerciseShape {
  const primera = e.series[0];
  return {
    name: e.nombre,
    sets: e.series.length,
    reps: String(primera?.targetReps ?? 10),
    muscleGroup: e.grupoMuscular,
    ejercicioId: e.ejercicioId ?? null,
    weight: primera?.minWeight ? `${primera.minWeight} kg` : "",
    rest: e.descanso,
    imageUrl: e.imageUrl,
    videoUrl: e.videoUrl,
    series: e.series.map(s => ({ minWeight: s.minWeight, targetReps: s.targetReps, tecnica: s.tecnica })),
  };
}

// `numeroSemana` por defecto se resuelve de `r.fechaInicio` — pásalo
// explícitamente solo si el llamador ya lo calculó (evita recalcularlo dos
// veces cuando el caller también necesita mostrar la etiqueta de semana).
export function routineJsonToPortalRoutine(r: RoutineJson, numeroSemana?: NumeroSemana): PortalRoutineBridge {
  const semana = numeroSemana ?? semanaActualPorFecha(r.fechaInicio);
  const cfgSemana = r.semanas[semana]?.configuracionPorDia ?? emptyConfiguracionPorDiaRutina();
  const days: PortalRoutineDayShape[] = DIAS_SEMANA.map((dia, dayIndex) => {
    const cfg = cfgSemana[dia] ?? emptyDiaRutina();
    return {
      label: DIA_LABEL[dia],
      focus: cfg.enfoque,
      dayIndex,
      exercises: cfg.ejercicios.map(ejercicioAExercise),
    };
  });
  const daysPerWeek = days.filter(d => d.exercises.length > 0).length;
  return { name: r.nombre, daysPerWeek, days, semanaActual: { numero: semana, nombre: SEMANA_LABEL[semana] } };
}

export { genId as genCoachClientId };
