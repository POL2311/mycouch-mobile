import { joinCommunityRoom } from "@/lib/portal";

// Fase 3 — POST /api/community/join. Nunca se golpea el backend real aquí:
// se mockea global.fetch por completo para no escribir datos basura en
// producción (instrucción explícita). Blinda el contrato exacto que
// app/(portal)/salas/index.tsx's executeJoin() espera de vuelta.
describe("joinCommunityRoom", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("con el código FELLS2026, devuelve ok:true + coachName + notices en éxito", async () => {
    const mockNotices = [
      { id: "n1", senderName: "Coach Fells", role: "COACH", content: "Bienvenido al sindicato", createdAt: "2026-07-16T00:00:00.000Z" },
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ coachName: "Coach Fells", coachId: "coach-1", notices: mockNotices }),
    }) as unknown as typeof fetch;

    const result = await joinCommunityRoom({ code: "FELLS2026" }, "fake-jwt-token");

    expect(result).toEqual({ ok: true, coachName: "Coach Fells", notices: mockNotices });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/api\/community\/join$/);
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer fake-jwt-token");
    expect(JSON.parse(opts.body)).toEqual({ code: "FELLS2026" });
  });

  it("devuelve notices: [] si el backend no incluye avisos", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ coachName: "Coach Fells" }),
    }) as unknown as typeof fetch;

    const result = await joinCommunityRoom({ code: "FELLS2026" }, "fake-jwt-token");
    expect(result).toEqual({ ok: true, coachName: "Coach Fells", notices: [] });
  });

  it("propaga el mensaje de error del backend cuando el código es inválido", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "CÓDIGO_INVÁLIDO" }),
    }) as unknown as typeof fetch;

    const result = await joinCommunityRoom({ code: "CODIGO-FALSO" }, "fake-jwt-token");
    expect(result).toEqual({ ok: false, error: "CÓDIGO_INVÁLIDO" });
  });

  it("cae en SIN_CONEXIÓN si el fetch mismo rechaza (sin red)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await joinCommunityRoom({ code: "FELLS2026" }, "fake-jwt-token");
    expect(result).toEqual({ ok: false, error: "SIN_CONEXIÓN" });
  });
});
