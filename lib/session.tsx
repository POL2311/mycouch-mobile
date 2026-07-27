import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api";

const TOKEN_KEY = "mc_jwt";

interface AuthUser {
  id:    string;
  name:  string;
  email: string;
  image?: string;
  role:  "CLIENT" | "COACH" | "ADMIN";
  status?: "ACTIVO" | "SUSPENDIDO" | "INACTIVO";
}

interface AuthState {
  token:     string | null;
  user:      AuthUser | null;
  role:      AuthUser["role"] | null;
  isLoading: boolean;
  login:     (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout:    () => Promise<void>;
  // Both PATCH /api/mobile/me and POST /api/mobile/me/password are inferred
  // paths, not verified contracts — GET /api/mobile/me is the one confirmed
  // endpoint on this resource (used for token verification below); these are
  // reasonable RESTful siblings on the same route, following the same
  // "consistent guess, not a spec" treatment as setStudentActive in
  // lib/coach.tsx. If either fails, this is the first place to check against
  // the real Next.js routes.
  updateProfile:  (patch: { name?: string; email?: string; image?: string }) => Promise<void>;
  changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<void>;
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
          const cachedProfile = await AsyncStorage.getItem("@user_profile_data").catch(() => null);
          if (cachedProfile) {
            setUser(JSON.parse(cachedProfile));
            setToken(stored);
          }

          // Verify token by fetching GET /api/mobile/me — returns {id,name,email,role}
          // on success; 401 on an invalid/expired token, 404 if the user was deleted.
          const me = await api<AuthUser>("/api/mobile/me", { token: stored });
          
          if (me.status === "SUSPENDIDO" || me.status === "INACTIVO") {
            throw new Error("Cuenta suspendida");
          }

          setToken(stored);
          setUser(me);
          await AsyncStorage.setItem("@user_profile_data", JSON.stringify(me)).catch(() => {});
        }
      } catch (error: any) {
        if (error.message === "Cuenta suspendida") {
          import("react-native").then(({ Alert }) => {
            Alert.alert(
              "Acceso Denegado",
              "Tu cuenta se encuentra suspendida. Ponte en contacto con tu Coach para reactivar tu acceso."
            );
          });
        }
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

    if (res.user.status === "SUSPENDIDO" || res.user.status === "INACTIVO") {
      import("react-native").then(({ Alert }) => {
        Alert.alert(
          "Acceso Denegado",
          "Tu cuenta se encuentra suspendida. Ponte en contacto con tu Coach para reactivar tu acceso."
        );
      });
      return;
    }

    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function loginWithGoogle() {
    // Implementación simulada de Google Sign-In ya que el backend es custom y no tenemos 
    // supabase o firebase configurado actualmente.
    // En producción esto invocaría expo-auth-session o un SDK de Google Sign In,
    // y enviaría el token de Google al backend para validar e inicializar status="ACTIVO".
    
    // Mock successful auth from google
    const mockUser: AuthUser = {
      id: "google-123",
      name: "Atleta Google",
      email: "atleta@google.com",
      image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=60",
      role: "CLIENT",
      status: "ACTIVO",
    };
    
    const mockToken = "mock_google_jwt_" + Date.now();
    await SecureStore.setItemAsync(TOKEN_KEY, mockToken);
    setToken(mockToken);
    setUser(mockUser);
  }

  async function logout() {
    // Navigation is NOT performed here — clearing token/user causes the root
    // layout's Stack.Protected guards to re-evaluate in the same commit and
    // unmount the protected screens automatically. No router call needed.
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  async function updateProfile(patch: { name?: string; email?: string; image?: string }) {
    if (!token) throw new Error("No hay sesión activa.");
    const updated = await api<AuthUser>("/api/mobile/me", { method: "PATCH", token, body: patch });
    setUser(updated);
    await AsyncStorage.setItem("@user_profile_data", JSON.stringify(updated)).catch(() => {});
  }

  async function changePassword(payload: { currentPassword: string; newPassword: string }) {
    if (!token) throw new Error("No hay sesión activa.");
    await api<{ success: boolean }>("/api/mobile/me/password", { method: "POST", token, body: payload });
  }

  return (
    <AuthContext.Provider value={{ token, user, role: user?.role ?? null, isLoading, login, loginWithGoogle, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
