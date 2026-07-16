// EXPO_PUBLIC_API_URL is set in .env (see app.json for build-time config).
const BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?:   Record<string, unknown>;
  token?:  string;
}

// Carries the HTTP status alongside the message so callers can branch on
// specific codes (e.g. 403 "No autorizado") without re-parsing the response.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
    // Includes method+path so a failure is diagnosable from the error text
    // alone — "HTTP 404" told you nothing about WHICH endpoint 404'd; this
    // is exactly the gap that made setStudentActive's guessed-path failures
    // slow to track down across three separate attempts.
    let message = `${method} ${path} → HTTP ${res.status}`;
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
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}
