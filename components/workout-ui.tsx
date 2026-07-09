import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import { Droplet } from "lucide-react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop, Rect } from "react-native-svg";

export const VOLT     = "#CCFF00";
export const VOLT_DIM = "#a3e635";
export const ON_VOLT  = "#000000";
export const ICE      = "#F2FFF7";

// ── Hydration Táctica constants (blueprint §2.3 — 12 vials × 250ml = 3.0L) ───
export const WATER_TARGET_ML = 3000;
export const WATER_DOSE_ML   = 250;
export const WATER_VIALS     = 12;
const WATER_R    = 40;
const WATER_CIRC = 2 * Math.PI * WATER_R;

// ── Liquid fill bar — Reanimated spring-driven, glowing. Pass `gradient` for
// the Vitality "liquid rail" (coral→teal completion gradient per DESIGN.md).
let liquidGradSeq = 0;
export function LiquidFillBar({ pct, height = 6, color = VOLT, gradient }: {
  pct: number; height?: number; color?: string; gradient?: [string, string];
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withSpring(pct, { damping: 12, stiffness: 90 });
  }, [pct, w]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  // Stable unique id per mount so multiple rails never share an SVG gradient def.
  const [gradId] = useState(() => `liquidGrad${liquidGradSeq++}`);

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: "#2A2A2A",
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            borderRadius: height / 2,
            overflow: "hidden",
            backgroundColor: gradient ? "transparent" : color,
            shadowColor: gradient ? gradient[1] : color,
            shadowOpacity: 0.7,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
          },
          fillStyle,
        ]}
      >
        {gradient && (
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={gradient[0]} />
                <Stop offset="1" stopColor={gradient[1]} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
          </Svg>
        )}
      </Animated.View>
    </View>
  );
}

// ── Hidratación Táctica — ring + 12 cyan vials (blueprint §2.3) ──────────────
export function HydrationTactica({ totalMl, syncing, onAdd }: {
  totalMl: number; syncing: boolean; onAdd: () => void;
}) {
  const limitReached = totalMl >= WATER_TARGET_ML;
  const waterPct      = Math.min(totalMl / WATER_TARGET_ML, 1);
  const dashOffset     = WATER_CIRC * (1 - waterPct);
  const filledVials    = Math.floor(Math.min(totalMl, WATER_TARGET_ML) / WATER_DOSE_ML);

  return (
    <View
      className="rounded-3xl p-5 mb-4"
      style={{
        backgroundColor: "#1E1E1E",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
      }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Droplet size={14} strokeWidth={1.5} color={VOLT} />
            <Text className="font-black uppercase" style={{ fontSize: 11, letterSpacing: 1.6, color: "#fff" }}>
              HIDRATACIÓN TÁCTICA
            </Text>
          </View>
          <Text className="font-black" style={{ fontSize: 22, color: VOLT, marginTop: 4 }}>
            {(totalMl / 1000).toFixed(1)}
            <Text style={{ fontSize: 13, color: "rgba(204,255,0,0.5)" }}> / 3.0 L</Text>
          </Text>
        </View>

        {/* Progress ring */}
        <View style={{ width: 64, height: 64, alignItems: "center", justifyContent: "center" }}>
          <Svg width={64} height={64} viewBox="0 0 96 96" style={{ transform: [{ rotate: "-90deg" }] }}>
            <Circle cx={48} cy={48} r={WATER_R} stroke="rgba(204,255,0,0.08)" strokeWidth={6} fill="none" />
            <Circle
              cx={48} cy={48} r={WATER_R}
              stroke={VOLT} strokeWidth={6} fill="none"
              strokeLinecap="round"
              strokeDasharray={`${WATER_CIRC}`}
              strokeDashoffset={dashOffset}
            />
          </Svg>
          <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }}>
            <Droplet size={12} strokeWidth={2} color={VOLT} />
            <Text className="font-black" style={{ fontSize: 10, color: VOLT }}>
              {Math.round(waterPct * 100)}%
            </Text>
          </View>
        </View>
      </View>

      {/* 12 vial matrix */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        className="mb-4"
      >
        {Array.from({ length: WATER_VIALS }, (_, idx) => {
          const filled = totalMl >= (idx + 1) * WATER_DOSE_ML;
          return (
            <View
              key={idx}
              className="rounded-xl items-center justify-end overflow-hidden"
              style={{
                width: 36, height: 56,
                backgroundColor: filled ? "rgba(204,255,0,0.1)" : "rgba(255,255,255,0.03)",
                borderWidth: 1,
                borderColor: filled ? "rgba(204,255,0,0.28)" : "rgba(255,255,255,0.05)",
              }}
            >
              {filled && (
                <MotiView
                  key={idx < filledVials ? "on" : "off"}
                  from={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 10, stiffness: 220 }}
                  style={{ width: "100%", height: "75%", borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: "hidden" }}
                >
                  <Svg style={StyleSheet.absoluteFill}>
                    <Defs>
                      <LinearGradient id={`vial${idx}`} x1="0" y1="1" x2="0" y2="0">
                        <Stop offset="0" stopColor={VOLT} stopOpacity="0.12" />
                        <Stop offset="1" stopColor={VOLT} stopOpacity="0.5" />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill={`url(#vial${idx})`} />
                  </Svg>
                </MotiView>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={onAdd}
        disabled={syncing || limitReached}
        className="w-full py-3.5 rounded-2xl items-center flex-row justify-center"
        style={{
          gap: 8,
          backgroundColor: limitReached ? "rgba(255,255,255,0.05)" : "rgba(204,255,0,0.08)",
          borderWidth: 1,
          borderColor: limitReached ? "rgba(255, 255, 255, 0.06)" : "rgba(204,255,0,0.25)",
          opacity: limitReached ? 0.3 : 1,
        }}
      >
        {syncing
          ? <ActivityIndicator size="small" color={VOLT} />
          : (
            <>
              <Droplet size={12} strokeWidth={2} color={limitReached ? "#71717a" : VOLT} />
              <Text
                className="font-black uppercase"
                style={{ fontSize: 13, letterSpacing: 1, color: limitReached ? "#71717a" : VOLT }}
              >
                + 250ML
              </Text>
              {limitReached && (
                <Text className="normal-case" style={{ fontSize: 10, color: "#71717a", fontWeight: "normal" }}>
                  ✓ Meta alcanzada
                </Text>
              )}
            </>
          )
        }
      </Pressable>
    </View>
  );
}

// ── 18-pip rest matrix — sequential fade as the 90s window elapses ──────────
export function RestPipMatrix({ restSecs }: { restSecs: number }) {
  const PIP_COUNT = 18;
  const elapsed    = 90 - restSecs;
  const filledPips = Math.min(Math.round(elapsed / 5), PIP_COUNT);

  return (
    <View className="flex-row justify-center mt-4" style={{ gap: 3, maxWidth: 260 }}>
      {Array.from({ length: PIP_COUNT }, (_, i) => {
        const filled = i < filledPips;
        return (
          <MotiView
            key={i}
            animate={{ opacity: filled ? 1 : 0.15 }}
            transition={{ type: "timing", duration: 450 }}
            style={{
              width: 12, height: 4, borderRadius: 2,
              backgroundColor: filled ? VOLT : "rgba(255,255,255,0.05)",
              ...(filled ? {
                shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
              } : null),
            }}
          />
        );
      })}
    </View>
  );
}
