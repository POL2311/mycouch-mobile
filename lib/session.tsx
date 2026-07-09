import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api } from "@/lib/api";

const TOKEN_KEY = "mc_jwt";

interface AuthUser {
  id:    string;
  name:  string;
  email: string;
  role:  "CLIENT" | "COACH" | "ADMIN";
}

interface AuthState {
  token:     string | null;
  user:      AuthUser | null;
  role:      AuthUser["role"] | null;
  isLoading: boolean;
  login:     (email: string, password: string) => Promise<void>;
  logout:    () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,     setToken]     = useState<string | null>(null);
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore token from SecureStore on app launch
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          // Verify token by fetching GET /api/mobile/me — returns {id,name,email,role}
          // on success; 401 on an invalid/expired token, 404 if the user was deleted.
          const me = await api<AuthUser>("/api/mobile/me", { token: stored });
          setToken(stored);
          setUser(me);
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // No imperative routing effect here anymore. Navigation on auth transitions
  // is handled declaratively by <Stack.Protected guard={...}> in the root
  // app/_layout.tsx, which reads token/role straight from this context. That
  // supersedes the old "single-owner router.replace() effect" pattern this
  // file used to carry — this provider's only job now is state.

  async function login(email: string, password: string) {
    const res = await api<{ token: string; user: AuthUser }>("/api/mobile/login", {
      method: "POST",
      body:   { email, password },
    });
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function logout() {
    // Navigation is NOT performed here — clearing token/user causes the root
    // layout's Stack.Protected guards to re-evaluate in the same commit and
    // unmount the protected screens automatically. No router call needed.
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, role: user?.role ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
