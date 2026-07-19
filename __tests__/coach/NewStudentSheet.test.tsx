import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { NewStudentSheet } from "@/app/(coach)/alumnos";
import { api } from "@/lib/api";

jest.mock("@/lib/session", () => ({
  useAuth: () => ({ token: "fake-jwt-token" }),
}));

jest.mock("@/lib/api", () => ({
  api: jest.fn(),
}));

const mockedApi = api as jest.MockedFunction<typeof api>;

// Blinda el flujo real de creación de alumno (Fase 1/2): el backend
// (POST /api/students, ver backend-context.md §3) lee `startingWeight` como
// un Float de Prisma no-nullable — si el body llega con un string ("72.5")
// en vez de un número real, la creación falla silenciosamente distinto según
// el runtime de Node/Prisma. Este test congela el contrato: el payload debe
// llevar un `number`, no la cadena cruda del TextInput.
describe("NewStudentSheet — creación de alumno", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue({});
  });

  it("envía startingWeight como número (Float), no como string", async () => {
    const onCreated = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = await render(
      <NewStudentSheet visible onClose={onClose} onCreated={onCreated} />,
    );

    await fireEvent.changeText(getByTestId("new-student-name"), "Juan Pérez");
    await fireEvent.changeText(getByTestId("new-student-email"), "juan@example.com");
    await fireEvent.changeText(getByTestId("new-student-weight"), "72.5");

    await fireEvent.press(getByTestId("new-student-save"));

    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(1));

    const [path, opts] = mockedApi.mock.calls[0];
    expect(path).toBe("/api/students");
    expect(opts?.method).toBe("POST");
    expect(opts?.body?.startingWeight).toBe(72.5);
    expect(typeof opts?.body?.startingWeight).toBe("number");
    expect(opts?.body?.currentWeight).toBeUndefined();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no permite guardar (botón deshabilitado) si el peso es inválido o falta", async () => {
    const { getByTestId } = await render(
      <NewStudentSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );

    await fireEvent.changeText(getByTestId("new-student-name"), "Juan Pérez");
    await fireEvent.changeText(getByTestId("new-student-email"), "juan@example.com");
    // Sin peso: el botón debe quedar deshabilitado y no debe poder dispararse.
    await fireEvent.press(getByTestId("new-student-save"));

    expect(mockedApi).not.toHaveBeenCalled();
  });

  it("no permite guardar con un peso no numérico o negativo", async () => {
    const { getByTestId } = await render(
      <NewStudentSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );

    await fireEvent.changeText(getByTestId("new-student-name"), "Juan Pérez");
    await fireEvent.changeText(getByTestId("new-student-email"), "juan@example.com");
    await fireEvent.changeText(getByTestId("new-student-weight"), "-5");
    await fireEvent.press(getByTestId("new-student-save"));

    expect(mockedApi).not.toHaveBeenCalled();
  });
});
