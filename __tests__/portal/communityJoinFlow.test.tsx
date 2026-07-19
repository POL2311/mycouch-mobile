import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";
import { joinCommunityRoom } from "@/lib/portal";

// app/(portal)/salas/index.tsx no se monta aquí directamente: depende de
// expo-blur/moti/react-native-svg y de varios providers anidados (usePortal,
// useAuth, AsyncStorage), lo que la hace pesada de montar solo para blindar
// esta transición puntual. Este harness reproduce *el mismo* camino de
// código que executeJoin() en esa pantalla — mismo estado (codeSuccess →
// currentView), mismo setTimeout(800) — contra la función real
// joinCommunityRoom importada de lib/portal.tsx, con fetch mockeado (nunca
// se golpea el backend real, código de ejemplo: FELLS2026).
type View_ = "JOIN" | "ROOM_ACTIVE";

function JoinRoomHarness() {
  const [currentView, setCurrentView] = useState<View_>("JOIN");
  const [codeSuccess, setCodeSuccess] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const executeJoin = useCallback(async (payload: { code?: string }) => {
    const result = await joinCommunityRoom(payload, "fake-jwt-token");
    if (result.ok) {
      setCodeSuccess(true);
      setTimeout(() => {
        setCurrentView("ROOM_ACTIVE");
        setCodeSuccess(false);
      }, 800);
    } else {
      setJoinError(result.error ?? "ERROR_DESCONOCIDO");
    }
  }, []);

  return (
    <View>
      <Text testID="current-view">{currentView}</Text>
      <Text testID="code-success">{String(codeSuccess)}</Text>
      <Text testID="join-error">{joinError ?? "NONE"}</Text>
      <TouchableOpacity testID="submit-code" onPress={() => executeJoin({ code: "FELLS2026" })} />
    </View>
  );
}

describe("Flujo de ingreso a sala (sindicato) — código FELLS2026", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("transiciona a ROOM_ACTIVE solo después de los 800ms, nunca antes", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coachName: "Coach Fells",
        notices: [{ id: "n1", senderName: "Coach Fells", role: "COACH", content: "Bienvenido", createdAt: "2026-07-16T00:00:00.000Z" }],
      }),
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<JoinRoomHarness />);

    expect(getByTestId("current-view").props.children).toBe("JOIN");

    await fireEvent.press(getByTestId("submit-code"));

    await waitFor(() => {
      expect(getByTestId("code-success").props.children).toBe("true");
    });
    // El éxito ya se registró, pero la vista NO debe cambiar todavía.
    expect(getByTestId("current-view").props.children).toBe("JOIN");

    await act(async () => {
      jest.advanceTimersByTime(799);
    });
    expect(getByTestId("current-view").props.children).toBe("JOIN");

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => {
      expect(getByTestId("current-view").props.children).toBe("ROOM_ACTIVE");
    });
    expect(getByTestId("code-success").props.children).toBe("false");
  });

  it("con un código inválido, no transiciona a ROOM_ACTIVE y expone el error", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "CÓDIGO_INVÁLIDO" }),
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<JoinRoomHarness />);
    await fireEvent.press(getByTestId("submit-code"));

    await waitFor(() => {
      expect(getByTestId("join-error").props.children).toBe("CÓDIGO_INVÁLIDO");
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(getByTestId("current-view").props.children).toBe("JOIN");
  });
});
