import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Local-only gamification layer ────────────────────────────────────────────
// Deliberately NOT synced to the backend and NOT the same thing as
// Student.streak (see lib/portal.tsx / lib/coach.tsx) — that field is real,
// server-owned, and already drives the coach dashboard's team telemetry.
// totalXP/currentRank here are client-side flavor only: trivially editable by
// the user, invisible to coaches. Fine for engagement chrome, not a source of
// truth for anything a coach needs to see or trust.
const XP_CACHE_KEY = "mc:gamification_xp";

// ── Rango único, basado en XP (unificación .cursorrules Parte 3) ────────────
// Antes había DOS sistemas de rango en paralelo: este (XP real, persistido,
// 4 tiers genéricos RECLUTA/ATLETA TÁCTICO/...) y otro completamente aparte
// en app/(portal)/perfil/index.tsx derivado de Student.streak con sus
// propios 6 nombres temáticos (Atleta Init...Bestia Élite) — de ahí la
// contradicción real que veía el usuario ("13 días" en un lado, "3
// entrenamientos perfectos" en otro, para el MISMO rango). Ahora este es el
// único sistema: conserva los 6 nombres temáticos (la identidad visual que
// ya existía), pero el ascenso es 100% por XP acumulado — perfil.tsx ya no
// mantiene su propio cálculo de rango basado en racha.
export interface RankTier { minXP: number; name: string; sub: string; icon: string; voltTheme?: boolean }

export const RANK_TIERS: RankTier[] = [
  { minXP: 0,    name: "ATLETA INIT",  sub: "NIVEL 1",      icon: "⬡" },
  { minXP: 150,  name: "GUERRERO PRO", sub: "NIVEL 2",      icon: "◈" },
  { minXP: 500,  name: "TITÁN",        sub: "NIVEL 3",      icon: "◆" },
  { minXP: 1200, name: "COMANDANTE",   sub: "NIVEL 4",      icon: "✦" },
  { minXP: 2500, name: "PREDADOR",     sub: "NIVEL 5",      icon: "⬢" },
  { minXP: 5000, name: "BESTIA ÉLITE", sub: "NIVEL MÁXIMO", icon: "★", voltTheme: true },
];

export function rankForXP(xp: number): string {
  let rank = RANK_TIERS[0]!.name;
  for (const tier of RANK_TIERS) {
    if (xp >= tier.minXP) rank = tier.name; else break;
  }
  return rank;
}

// Progress (0-100) within the athlete's current tier, and the XP value of
// the next tier up (null once at the top tier).
export function rankProgress(xp: number): { pct: number; nextThresholdXP: number | null } {
  let tierMin = RANK_TIERS[0]!.minXP;
  let tierMax: number | null = null;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (xp >= RANK_TIERS[i]!.minXP) {
      tierMin = RANK_TIERS[i]!.minXP;
      tierMax = RANK_TIERS[i + 1]?.minXP ?? null;
    }
  }
  if (tierMax === null) return { pct: 100, nextThresholdXP: null };
  const pct = Math.round(((xp - tierMin) / (tierMax - tierMin)) * 100);
  return { pct: Math.min(Math.max(pct, 0), 100), nextThresholdXP: tierMax };
}

interface GamificationState {
  totalXP:          number;
  currentRank:      string;
  progressPct:      number;
  nextThresholdXP:  number | null;
  addXP:            (amount: number) => void;
  // One-shot rank-up event for the UI to flash then clear — not persisted,
  // so a stale rank-up toast never replays on reload.
  rankUpFlash:      string | null;
  clearRankUpFlash: () => void;
}

const GamificationContext = createContext<GamificationState | null>(null);

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const [totalXP,     setTotalXP]     = useState(0);
  const [rankUpFlash, setRankUpFlash] = useState<string | null>(null);
  const hydrated = useRef(false);

  // ── Mount: hydrate cached XP ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(XP_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { totalXP?: number };
          if (typeof cached.totalXP === "number") setTotalXP(cached.totalXP);
        }
      } catch {}
      hydrated.current = true;
    })();
  }, []);

  // ── Save on change — guarded until hydration resolves, so the initial
  // totalXP=0 default can't race ahead of the cache read and clobber it. ────
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(XP_CACHE_KEY, JSON.stringify({ totalXP })).catch(() => {});
  }, [totalXP]);

  const addXP = useCallback((amount: number) => {
    setTotalXP(prev => {
      const next = prev + amount;
      const prevRank = rankForXP(prev);
      const nextRank = rankForXP(next);
      if (nextRank !== prevRank) setRankUpFlash(nextRank);
      return next;
    });
  }, []);

  const clearRankUpFlash = useCallback(() => setRankUpFlash(null), []);

  const currentRank = rankForXP(totalXP);
  const { pct: progressPct, nextThresholdXP } = rankProgress(totalXP);

  return (
    <GamificationContext.Provider
      value={{ totalXP, currentRank, progressPct, nextThresholdXP, addXP, rankUpFlash, clearRankUpFlash }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification(): GamificationState {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error("useGamification must be inside <GamificationProvider>");
  return ctx;
}
