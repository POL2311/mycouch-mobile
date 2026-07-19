import { exceedsThreshold, serieActivaFor } from "@/lib/exerciseGating";
import type { RoutineExercise } from "@/lib/portal";

// Blinda la regla de negocio del coach (types/coach-client.ts
// SerieAsignada.minWeight/targetReps): un set registrado por el alumno por
// debajo del mínimo exigido para la serie activa nunca debe poder guardarse.
// Pruebas puras — sin montar la pantalla del ejercicio (expo-video/expo-blur/
// moti la vuelven pesada de renderizar para esto).
describe("serieActivaFor", () => {
  const ejercicio = (series: RoutineExercise["series"]): RoutineExercise => ({
    id: "ex-1", name: "Sentadilla", sets: 3, reps: "8-10", weight: "60kg",
    series,
  } as RoutineExercise);

  it("devuelve undefined si el ejercicio no trae series estrictas (plantilla/legado)", () => {
    expect(serieActivaFor(ejercicio(undefined), 0)).toBeUndefined();
    expect(serieActivaFor(ejercicio([]), 0)).toBeUndefined();
  });

  it("devuelve la serie correspondiente al número de sets ya completados", () => {
    const series = [
      { minWeight: 40, targetReps: 12 },
      { minWeight: 50, targetReps: 8 },
      { minWeight: 60, targetReps: 6 },
    ];
    expect(serieActivaFor(ejercicio(series), 0)).toEqual(series[0]);
    expect(serieActivaFor(ejercicio(series), 1)).toEqual(series[1]);
    expect(serieActivaFor(ejercicio(series), 2)).toEqual(series[2]);
  });

  it("se recorta a la última serie definida si el alumno hace más sets de los configurados", () => {
    const series = [{ minWeight: 40, targetReps: 12 }];
    expect(serieActivaFor(ejercicio(series), 5)).toEqual(series[0]);
  });
});

describe("exceedsThreshold", () => {
  const serie = { minWeight: 50, targetReps: 8 };

  it("false cuando no hay serie activa (ejercicio sin exigencia estricta)", () => {
    expect(exceedsThreshold(undefined, 0, 0)).toBe(false);
  });

  it("bloquea (true) si el peso registrado es menor al mínimo exigido", () => {
    expect(exceedsThreshold(serie, 49.9, 8)).toBe(true);
  });

  it("bloquea (true) si las repeticiones registradas son menores al objetivo", () => {
    expect(exceedsThreshold(serie, 50, 7)).toBe(true);
  });

  it("no bloquea (false) si el peso y las reps igualan o superan el mínimo", () => {
    expect(exceedsThreshold(serie, 50, 8)).toBe(false);
    expect(exceedsThreshold(serie, 55, 10)).toBe(false);
  });
});
