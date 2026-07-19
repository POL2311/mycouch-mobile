import { Text } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { Zap } from "lucide-react-native";
import { useState, useRef, useCallback } from "react";

const VOLT = "#CCFF00";

// Estado + auto-dismiss compartido por cualquier caller (chat grupal, DMs) —
// evita reimplementar el mismo setTimeout en cada pantalla que otorga XP.
export function useXPToast(durationMs = 1800) {
  const [amount, setAmount] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showXPToast = useCallback((xp: number) => {
    if (timer.current) clearTimeout(timer.current);
    setAmount(xp);
    timer.current = setTimeout(() => setAmount(null), durationMs);
  }, [durationMs]);

  return { xpToastAmount: amount, showXPToast };
}

// ── Micro-toast de XP — no invasivo, se auto-oculta desde el caller (ver
// useXPToast abajo). Usado por el motor de engagement social (Módulo 5,
// "Sistema de Gamificación por Mensaje") y reutilizable en cualquier otra
// acción que otorgue XP de golpe. ────────────────────────────────────────────
export function XPToast({ amount, topOffset = 0 }: { amount: number | null; topOffset?: number }) {
  return (
    <AnimatePresence>
      {amount !== null && (
        <MotiView
          from={{ opacity: 0, translateY: -12, scale: 0.9 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          exit={{ opacity: 0, translateY: -12, scale: 0.9 }}
          transition={{ type: "timing", duration: 220 }}
          style={{
            position: "absolute", top: topOffset, alignSelf: "center", zIndex: 20,
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: "rgba(204,255,0,0.12)", borderWidth: 1, borderColor: "rgba(204,255,0,0.5)",
            borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
            shadowColor: VOLT, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Zap size={13} color={VOLT} fill={VOLT} />
          <Text className="font-black" style={{ fontSize: 12, color: VOLT, letterSpacing: 0.3 }}>
            +{amount} XP
          </Text>
        </MotiView>
      )}
    </AnimatePresence>
  );
}
