import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/session";
import { fetchMotivationalPhrases } from "@/lib/portal";

// ── Frases motivacionales del coach + disparo del modal de celebración ──────
// Las frases viven como GroupMessage (mismo mecanismo que el Tablón de
// Avisos, ver lib/coach.tsx's postMotivationalPhrase) — se cargan una vez al
// montar. Si el coach no configuró ninguna, o la carga falla, `celebrate()`
// cae en un pool interno de respaldo para que el modal siga teniendo valor
// desde el primer día.
const FALLBACK_PHRASES = [
  "¡La disciplina supera la motivación. Tu único límite eres tú!",
  "Cada repetición cuenta. Hoy fuiste más fuerte que ayer.",
  "El esfuerzo de hoy es el resultado de mañana. ¡Sigue así!",
  "Nadie dijo que sería fácil, pero vale la pena. ¡Excelente trabajo!",
];

interface MotivationState {
  activePhrase: string | null;
  celebrate:    () => void;
  dismiss:      () => void;
}

const MotivationContext = createContext<MotivationState | null>(null);

export function MotivationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [phrases, setPhrases]           = useState<string[]>([]);
  const [activePhrase, setActivePhrase] = useState<string | null>(null);
  const phrasesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchMotivationalPhrases(token).then(p => {
      phrasesRef.current = p;
      setPhrases(p);
    });
  }, [token]);

  const celebrate = useCallback(() => {
    const pool = phrasesRef.current.length > 0 ? phrasesRef.current : FALLBACK_PHRASES;
    setActivePhrase(pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_PHRASES[0]!);
  }, []);

  const dismiss = useCallback(() => setActivePhrase(null), []);

  return (
    <MotivationContext.Provider value={{ activePhrase, celebrate, dismiss }}>
      {children}
    </MotivationContext.Provider>
  );
}

export function useMotivation(): MotivationState {
  const ctx = useContext(MotivationContext);
  if (!ctx) throw new Error("useMotivation must be inside <MotivationProvider>");
  return ctx;
}

// Exported for the one direct consumer that has no reason to mount a second
// provider just to read the list (app/(coach)/perfil/index.tsx reads/writes
// phrases directly via lib/coach.tsx instead) — kept here only in case a
// future screen needs the raw pool without triggering a celebration.
export { FALLBACK_PHRASES };
