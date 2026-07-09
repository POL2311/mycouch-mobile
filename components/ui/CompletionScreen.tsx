import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Check, MoreVertical, User, ArrowRight } from "lucide-react-native";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28,28,30,0.4)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const RING_SIZE   = 220;
const RING_RADIUS = 92;
const RING_STROKE = 14;

export interface BentoMetric {
  label: string;
  value: string;
  unit:  string;
  color: string;
}

// ── Shared client success/completion clone (ring + bento + floor CTA) ───────
// Cloned once here and reused by workout/success.tsx and nutrition/success.tsx
// so the two "configurations" stay pixel-identical outside their copy/data.
export function CompletionScreen({
  headline, subheader, ringMain, ringSub, left, right,
  ctaLabel = "REGRESAR AL PANEL", onPressCta, footer,
}: {
  headline:  [string, string];
  subheader: string;
  ringMain:  string;
  ringSub:   string;
  left:      BentoMetric;
  right:     BentoMetric;
  ctaLabel?: string;
  onPressCta: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Top brand nav */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 44 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
            <User size={13} color={SILVER} />
          </View>
          <Text className="font-mono" style={{ fontSize: 12, letterSpacing: 2, color: "#fff", textTransform: "uppercase" }}>
            EXO_PERFORMANCE
          </Text>
        </View>
        <MoreVertical size={18} color={SILVER} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "space-between" }}>
        <View>
          {/* Core headline stack */}
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: "timing", duration: 380 }}>
            <Text style={{ ...athletic, fontSize: 40, lineHeight: 40, color: "#fff", letterSpacing: -1, marginTop: 12 }}>
              {headline[0]}{"\n"}{headline[1]}
            </Text>
            <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 1.5, color: SILVER, marginTop: 10 }}>
              {subheader}
            </Text>
          </MotiView>

          {/* Concentric data ring centerpiece */}
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", damping: 14, delay: 120 }}
            style={{ alignItems: "center", marginTop: 28 }}
          >
            <View style={{ width: RING_SIZE, height: RING_SIZE }}>
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <Defs>
                  <LinearGradient id="successRingGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={CYAN} />
                    <Stop offset="1" stopColor={VOLT} />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                  stroke="url(#successRingGrad)" strokeWidth={RING_STROKE} fill="none"
                  strokeLinecap="round"
                />
              </Svg>
              <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }}>
                <Check size={36} color={VOLT} strokeWidth={3} />
                <Text
                  className="font-black"
                  style={{ fontSize: 15, color: "#fff", textAlign: "center", marginTop: 10, letterSpacing: 0.3, paddingHorizontal: 24 }}
                >
                  {ringMain}
                </Text>
                <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: SILVER, marginTop: 4, textTransform: "uppercase" }}>
                  {ringSub}
                </Text>
              </View>
            </View>
          </MotiView>

          {/* Lower bento grid metrics */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 32 }}>
            {[left, right].map(m => (
              <View key={m.label} style={{ ...GLASS, width: "46%", borderRadius: 24, padding: 16 }}>
                <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: m.color, textTransform: "uppercase" }}>
                  {m.label}
                </Text>
                <Text className="font-black" style={{ fontSize: 24, color: "#fff", marginTop: 6 }}>
                  {m.value}
                  <Text style={{ fontSize: 12, color: SILVER }}> {m.unit}</Text>
                </Text>
              </View>
            ))}
          </View>

          {footer}
        </View>

        {/* Master floor controller */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPressCta}
          style={{
            height: 56, borderRadius: 28, backgroundColor: VOLT,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            marginBottom: 32,
          }}
        >
          <Text style={{ ...athletic, fontSize: 14, color: "#000" }}>{ctaLabel}</Text>
          <ArrowRight size={16} color="#000" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
