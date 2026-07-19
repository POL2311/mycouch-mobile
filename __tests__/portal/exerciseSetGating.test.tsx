import React, { useState, useCallback } from "react";
import { View, TextInput, TouchableOpacity, Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { exceedsThreshold, serieActivaFor, } from "@/lib/exerciseGating";
import type { RoutineExercise } from "@/lib/portal";

// app/(portal)/exercise/[id].tsx no se monta directamente aquí: importa
// expo-video/expo-blur/moti y depende de useWorkout()/useGamification()/
// usePortal() reales, lo que la vuelve impráctica de montar solo para
// blindar esta regla puntual. En su lugar, este harness reproduce *el mismo*
// camino de código que handleSetCompleteWithCapture (misma condición
// `serieActiva && exceedsThreshold(...)`, mismo copy de Alert.alert) contra
// las funciones reales importadas de lib/exerciseGating — no una reimplementación.
function SetCompleteHarness({ ex }: { ex: RoutineExercise }) {
  const [weight, setWeight] = useState("0");
  const [reps, setReps] = useState("0");
  const [doneSetsForEx] = useState(0);

  const handleSetCompleteWithCapture = useCallback(() => {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps, 10) || 0;
    const serieActiva = serieActivaFor(ex, doneSetsForEx);
    if (serieActiva && exceedsThreshold(serieActiva, w, r)) {
      Alert.alert(
        "Serie insuficiente",
        `Tu coach exige mínimo ${serieActiva.minWeight} kg y ${serieActiva.targetReps} reps para esta serie. Ajusta los valores para continuar.`,
        [{ text: "Entendido" }],
      );
      return;
    }
  }, [weight, reps, ex, doneSetsForEx]);

  return (
    <View>
      <TextInput testID="weight-input" value={weight} onChangeText={setWeight} />
      <TextInput testID="reps-input" value={reps} onChangeText={setReps} />
      <TouchableOpacity testID="complete-set" onPress={handleSetCompleteWithCapture}>
        <></>
      </TouchableOpacity>
    </View>
  );
}

describe("Bloqueo de serie insuficiente — Alert.alert", () => {
  const exConSerie: RoutineExercise = {
    id: "ex-1", name: "Sentadilla", sets: 1, reps: "8", weight: "60kg",
    series: [{ minWeight: 60, targetReps: 8 }],
  } as RoutineExercise;

  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("dispara el Alert con el mínimo exacto del coach cuando el peso registrado es insuficiente", async () => {
    const { getByTestId } = await render(<SetCompleteHarness ex={exConSerie} />);

    await fireEvent.changeText(getByTestId("weight-input"), "50");
    await fireEvent.changeText(getByTestId("reps-input"), "8");
    await fireEvent.press(getByTestId("complete-set"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Serie insuficiente",
      "Tu coach exige mínimo 60 kg y 8 reps para esta serie. Ajusta los valores para continuar.",
      [{ text: "Entendido" }],
    );
  });

  it("no dispara el Alert cuando peso y reps cumplen el mínimo exigido", async () => {
    const { getByTestId } = await render(<SetCompleteHarness ex={exConSerie} />);

    await fireEvent.changeText(getByTestId("weight-input"), "60");
    await fireEvent.changeText(getByTestId("reps-input"), "8");
    await fireEvent.press(getByTestId("complete-set"));

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("no dispara el Alert para ejercicios sin `series` (plantilla/legado, sin exigencia estricta)", async () => {
    const exSinSerie: RoutineExercise = {
      id: "ex-2", name: "Curl", sets: 1, reps: "10", weight: "10kg",
    } as RoutineExercise;
    const { getByTestId } = await render(<SetCompleteHarness ex={exSinSerie} />);

    await fireEvent.changeText(getByTestId("weight-input"), "0");
    await fireEvent.changeText(getByTestId("reps-input"), "0");
    await fireEvent.press(getByTestId("complete-set"));

    expect(alertSpy).not.toHaveBeenCalled();
  });
});
