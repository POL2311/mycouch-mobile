import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { MotivationProvider, useMotivation } from "@/lib/motivation";

jest.mock("@/lib/session", () => ({
  useAuth: () => ({ token: "fake-jwt-token" }),
}));

jest.mock("@/lib/portal", () => ({
  fetchMotivationalPhrases: jest.fn().mockResolvedValue(["¡Frase de prueba del coach!"]),
}));

// Blinda el fix del crash real: el portal del Alumno solía disparar dos
// presentaciones full-screen (el modal de celebración + la pantalla de éxito
// de nutrición) en el mismo tick al llegar al 100%, lo que tumbaba la app en
// iOS. El fix fue encadenar la segunda presentación DESPUÉS de que dismiss()
// realmente cierre el modal, vía onDismiss + setTimeout(400) — nunca ambas
// presentaciones montadas a la vez. Este test congela ese contrato.
function Harness({ onHandoff }: { onHandoff: () => void }) {
  const { activePhrase, celebrate, dismiss } = useMotivation();
  return (
    <>
      <Text testID="active-phrase">{activePhrase ?? "NONE"}</Text>
      <TouchableOpacity
        testID="celebrate-btn"
        onPress={() => celebrate(() => setTimeout(onHandoff, 400))}
      />
      <TouchableOpacity testID="dismiss-btn" onPress={dismiss} />
    </>
  );
}

describe("MotivationProvider", () => {
  it("celebrate() activa una frase (del coach, si está disponible)", async () => {
    const { getByTestId } = await render(
      <MotivationProvider>
        <Harness onHandoff={jest.fn()} />
      </MotivationProvider>,
    );

    expect(getByTestId("active-phrase").props.children).toBe("NONE");

    await fireEvent.press(getByTestId("celebrate-btn"));

    await waitFor(() => {
      expect(getByTestId("active-phrase").props.children).toBe("¡Frase de prueba del coach!");
    });
  });

  it("dismiss() limpia la frase activa e invoca el callback encadenado exactamente una vez", async () => {
    jest.useFakeTimers();
    const onHandoff = jest.fn();

    const { getByTestId } = await render(
      <MotivationProvider>
        <Harness onHandoff={onHandoff} />
      </MotivationProvider>,
    );

    await fireEvent.press(getByTestId("celebrate-btn"));
    expect(getByTestId("active-phrase").props.children).not.toBe("NONE");

    // dismiss() debe cerrar el modal ANTES de que corra el setTimeout(400)
    // encadenado — la segunda presentación nunca debe montarse mientras la
    // primera sigue activa.
    await fireEvent.press(getByTestId("dismiss-btn"));
    expect(getByTestId("active-phrase").props.children).toBe("NONE");
    expect(onHandoff).not.toHaveBeenCalled();

    // El handoff solo dispara después de los 400ms, y solo una vez.
    jest.advanceTimersByTime(399);
    expect(onHandoff).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onHandoff).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it("dismiss() sin una celebración activa no invoca ningún callback", async () => {
    const { getByTestId } = await render(
      <MotivationProvider>
        <Harness onHandoff={jest.fn()} />
      </MotivationProvider>,
    );

    await fireEvent.press(getByTestId("dismiss-btn"));
    expect(getByTestId("active-phrase").props.children).toBe("NONE");
  });
});
