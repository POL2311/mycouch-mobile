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
      // Different API routes on the Next.js backend don't all shape errors
      // the same way — `error` is the common case here, but Zod-validated
      // routes commonly return `message` or an `errors[]` array instead. If
      // none of these match, the raw body is logged so a failure is never
      // silently reduced to just "HTTP 400" with no way to see why.
      const err = (await res.json()) as {
        error?: string; message?: string; errors?: (string | { message?: string })[];
      };
      if (err.error) {
        message = err.error;
      } else if (err.message) {
        message = err.message;
      } else if (Array.isArray(err.errors) && err.errors.length > 0) {
        message = err.errors
          .map(e => (typeof e === "string" ? e : e.message))
          .filter(Boolean)
          .join("; ") || message;
      } else {
        console.error(`[api] ${method} ${path} → ${res.status} with unrecognized error shape:`, err);
      }
    } catch {}
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
