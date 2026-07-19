import { View, Text, TouchableOpacity, Modal } from "react-native";
import { useEffect } from "react";
import { MotiView } from "moti";
import { Check } from "lucide-react-native";
import { triggerSuccess } from "@/lib/haptics";
import { useMotivation } from "@/lib/motivation";

// ── Modal de celebración premium — pantalla completa, negro absoluto,
// destellos en verde neón / cian. Disparado por MotivationProvider.celebrate()
// desde dos puntos: checklist de nutrición al 100% (nutrition/index.tsx) y
// última serie del día (app/(portal)/index.tsx). Mount-once en
// app/(portal)/_layout.tsx — no toma props, lee/escribe el estado
// compartido directamente. ──────────────────────────────────────────────────
const VOLT = "#CCFF00";
const CYAN = "#40E0D0";
const PARTICLE_COUNT = 14;

function Particle({ index }: { index: number }) {
  const angle    = (index / PARTICLE_COUNT) * Math.PI * 2;
  const distance = 90 + (index % 3) * 24;
  const color    = index % 2 === 0 ? VOLT : CYAN;
  return (
    <MotiView
      from={{ opacity: 0, translateX: 0, translateY: 0, scale: 0.4 }}
      animate={{
        opacity: [0, 1, 0],
        translateX: Math.cos(angle) * distance,
        translateY: Math.sin(angle) * distance,
        scale: 1,
      }}
      transition={{ type: "timing", duration: 1400, delay: 150 + index * 35, loop: true }}
      style={{
        position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: color,
        shadowColor: color, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

export default function CelebrationModal() {
  const { activePhrase, dismiss } = useMotivation();

  useEffect(() => {
    if (activePhrase) triggerSuccess();
  }, [activePhrase]);

  return (
    <Modal visible={!!activePhrase} transparent={false} animationType="fade" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        {activePhrase && (
          <>
            <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
              {Array.from({ length: PARTICLE_COUNT }, (_, i) => <Particle key={i} index={i} />)}
              <MotiView
                from={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 160, delay: 80 }}
                style={{
                  width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(204,255,0,0.12)",
                  borderWidth: 2, borderColor: VOLT, alignItems: "center", justifyContent: "center",
                  shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
                }}
              >
                <Check size={48} color={VOLT} strokeWidth={3} />
              </MotiView>
            </View>

            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 320, delay: 220 }}
              style={{ marginTop: 28 }}
            >
              <Text style={{ fontSize: 11, fontWeight: "900", letterSpacing: 2, color: VOLT, textTransform: "uppercase", textAlign: "center" }}>
                ¡Objetivo cumplido!
              </Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#ffffff", textAlign: "center", marginTop: 14, lineHeight: 28 }}>
                {activePhrase}
              </Text>
            </MotiView>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={dismiss}
              style={{
                marginTop: 40, height: 52, minWidth: 200, borderRadius: 26, backgroundColor: VOLT,
                alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "900", fontStyle: "italic", letterSpacing: 1, color: "#000", textTransform: "uppercase" }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}
