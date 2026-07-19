import type { RoutineExercise } from "@/lib/portal";

// La serie que corresponde al set que el alumno está a punto de registrar.
// `ex.series` solo existe para ejercicios asignados vía el constructor
// estricto (types/coach-client.ts) — ejercicios de plantilla/legado no lo
// traen y quedan sin exigencia (undefined). Si el alumno hace más sets de
// los configurados, se recorta a la última serie definida.
//
// Vive en su propio módulo (sin imports de expo-video/expo-blur/moti) para
// que app/(portal)/exercise/[id].tsx pueda seguir importándola normalmente
// mientras un test puede importarla sola sin arrastrar toda esa cadena de
// dependencias nativas pesadas.
export function serieActivaFor(ex: RoutineExercise | undefined, doneSetsForEx: number) {
  if (!ex?.series || ex.series.length === 0) return undefined;
  return ex.series[Math.min(doneSetsForEx, ex.series.length - 1)];
}

// Regla de negocio del coach (types/coach-client.ts SerieAsignada.minWeight/
// targetReps): true cuando el set registrado por el alumno no alcanza el
// mínimo exigido para la serie activa.
export function exceedsThreshold(
  serie: { minWeight: number; targetReps: number } | undefined,
  weight: number,
  reps: number,
): boolean {
  return !!serie && (weight < serie.minWeight || reps < serie.targetReps);
}
