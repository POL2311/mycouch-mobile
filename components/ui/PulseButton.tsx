import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Elite Telemetry "Pulse Aura" primitive — the shared micro-interaction for
// every primary CTA (SIGUIENTE, INYECTAR, GUARDAR, SET COMPLETE, etc.):
// press-in swells the glow (shadow radius/opacity) and nudges scale up over
// 100ms; press-out relaxes both back. Wrap any primary action's content in
// this instead of a bare TouchableOpacity/Pressable. ────────────────────────
export function PulseButton({
  glowColor, style, children, ...pressableProps
}: PressableProps & { glowColor: string; style?: ViewStyle; children: React.ReactNode }) {
  const pulse = useSharedValue(0);   // 0 = resting, 1 = pressed

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.03 }],
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25 + pulse.value * 0.35,
    shadowRadius: 10 + pulse.value * 14,
    elevation: 6 + pulse.value * 8,
  }));

  return (
    <AnimatedPressable
      {...pressableProps}
      onPressIn={e => { pulse.value = withTiming(1, { duration: 100 }); pressableProps.onPressIn?.(e); }}
      onPressOut={e => { pulse.value = withTiming(0, { duration: 100 }); pressableProps.onPressOut?.(e); }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
