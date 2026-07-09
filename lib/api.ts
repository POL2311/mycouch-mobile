// EXPO_PUBLIC_API_URL is set in .env (see app.json for build-time config).
const BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?:   Record<string, unknown>;
  token?:  string;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, token } = opts;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) message = err.error;
    } catch {}
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
