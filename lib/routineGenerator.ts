import { DIAS_SEMANA, emptyRoutineJson, type RoutineJson, genCoachClientId, NUMEROS_SEMANA } from "@/types/coach-client";

export function generateBaseRoutinePlan(daysAvailable: number): RoutineJson {
  // Días disponibles:
  // 2-3 Días: Fullbody Inicial (3 Días)
  // 4 Días: Torso / Pierna (4 Días)
  // 5+ Días: Empuje / Jalón / Pierna (PPL) (6 Días)

  let name = "";
  const config = {} as Record<string, { enfoque: string; ejercicios: any[] }>;

  if (daysAvailable <= 3) {
    name = "Fullbody Inicial (3 Días)";
    const fullbodyEx = [
      { id: genCoachClientId("ej"), nombre: "Sentadilla Libre", grupoMuscular: "Pierna", series: [{ numero: 1, minWeight: 0, targetReps: 12 }, { numero: 2, minWeight: 0, targetReps: 12 }, { numero: 3, minWeight: 0, targetReps: 12 }] },
      { id: genCoachClientId("ej"), nombre: "Press de Banca", grupoMuscular: "Pecho", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Remo con Barra", grupoMuscular: "Espalda", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Press Militar", grupoMuscular: "Hombro", series: [{ numero: 1, minWeight: 0, targetReps: 12 }, { numero: 2, minWeight: 0, targetReps: 12 }] },
    ];
    config["lunes"] = { enfoque: "Fullbody A", ejercicios: fullbodyEx };
    config["miercoles"] = { enfoque: "Fullbody B", ejercicios: fullbodyEx };
    config["viernes"] = { enfoque: "Fullbody C", ejercicios: fullbodyEx };
  } else if (daysAvailable === 4) {
    name = "Torso / Pierna (4 Días)";
    const torsoEx = [
      { id: genCoachClientId("ej"), nombre: "Press de Banca", grupoMuscular: "Pecho", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Remo con Barra", grupoMuscular: "Espalda", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Press Militar", grupoMuscular: "Hombro", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
    ];
    const piernaEx = [
      { id: genCoachClientId("ej"), nombre: "Sentadilla Libre", grupoMuscular: "Pierna", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Peso Muerto Rumano", grupoMuscular: "Pierna", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Prensa de Piernas", grupoMuscular: "Pierna", series: [{ numero: 1, minWeight: 0, targetReps: 12 }, { numero: 2, minWeight: 0, targetReps: 12 }, { numero: 3, minWeight: 0, targetReps: 12 }] },
    ];
    config["lunes"] = { enfoque: "Torso Fuerza", ejercicios: torsoEx };
    config["martes"] = { enfoque: "Pierna Fuerza", ejercicios: piernaEx };
    config["jueves"] = { enfoque: "Torso Hipertrofia", ejercicios: torsoEx };
    config["viernes"] = { enfoque: "Pierna Hipertrofia", ejercicios: piernaEx };
  } else {
    name = "Empuje / Jalón / Pierna (PPL)";
    const pushEx = [
      { id: genCoachClientId("ej"), nombre: "Press de Banca", grupoMuscular: "Pecho", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Press Militar", grupoMuscular: "Hombro", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Extensión Tríceps", grupoMuscular: "Brazo", series: [{ numero: 1, minWeight: 0, targetReps: 12 }, { numero: 2, minWeight: 0, targetReps: 12 }, { numero: 3, minWeight: 0, targetReps: 12 }] },
    ];
    const pullEx = [
      { id: genCoachClientId("ej"), nombre: "Dominadas", grupoMuscular: "Espalda", series: [{ numero: 1, minWeight: 0, targetReps: 8 }, { numero: 2, minWeight: 0, targetReps: 8 }, { numero: 3, minWeight: 0, targetReps: 8 }] },
      { id: genCoachClientId("ej"), nombre: "Remo con Barra", grupoMuscular: "Espalda", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Curl de Bíceps", grupoMuscular: "Brazo", series: [{ numero: 1, minWeight: 0, targetReps: 12 }, { numero: 2, minWeight: 0, targetReps: 12 }, { numero: 3, minWeight: 0, targetReps: 12 }] },
    ];
    const legEx = [
      { id: genCoachClientId("ej"), nombre: "Sentadilla Libre", grupoMuscular: "Pierna", series: [{ numero: 1, minWeight: 0, targetReps: 10 }, { numero: 2, minWeight: 0, targetReps: 10 }, { numero: 3, minWeight: 0, targetReps: 10 }] },
      { id: genCoachClientId("ej"), nombre: "Prensa de Piernas", grupoMuscular: "Pierna", series: [{ numero: 1, minWeight: 0, targetReps: 12 }, { numero: 2, minWeight: 0, targetReps: 12 }, { numero: 3, minWeight: 0, targetReps: 12 }] },
      { id: genCoachClientId("ej"), nombre: "Elevación Talones", grupoMuscular: "Pantorrilla", series: [{ numero: 1, minWeight: 0, targetReps: 15 }, { numero: 2, minWeight: 0, targetReps: 15 }, { numero: 3, minWeight: 0, targetReps: 15 }] },
    ];
    config["lunes"] = { enfoque: "Empuje", ejercicios: pushEx };
    config["martes"] = { enfoque: "Jalón", ejercicios: pullEx };
    config["miercoles"] = { enfoque: "Pierna", ejercicios: legEx };
    config["jueves"] = { enfoque: "Empuje", ejercicios: pushEx };
    config["viernes"] = { enfoque: "Jalón", ejercicios: pullEx };
    config["sabado"] = { enfoque: "Pierna", ejercicios: legEx };
  }

  const routine = emptyRoutineJson(name);

  // Apply to all 3 weeks
  for (const n of NUMEROS_SEMANA) {
    for (const dia of DIAS_SEMANA) {
      if (config[dia]) {
        routine.semanas[n]!.configuracionPorDia[dia] = {
          enfoque: config[dia]!.enfoque,
          ejercicios: config[dia]!.ejercicios.map(e => ({ ...e, id: genCoachClientId("ej") })),
        };
      }
    }
  }

  return routine;
}
