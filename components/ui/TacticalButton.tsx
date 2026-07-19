import { Pressable, Text, ActivityIndicator, type PressableProps } from "react-native";
import { triggerImpact } from "@/lib/haptics";

type Variant = "primary" | "ghost" | "danger";

const VARIANT_STYLES: Record<Variant, { bg: string; border: string; text: string }> = {
  primary: { bg: "#a3e635", border: "#a3e635", text: "#000000" },
  ghost:   { bg: "transparent", border: "#27272a", text: "#71717a" },
  danger:  { bg: "transparent", border: "#27272a", text: "#71717a" },
};

interface TacticalButtonProps extends Omit<PressableProps, "children"> {
  label:     string;
  variant?:  Variant;
  loading?:  boolean;
  haptic?:   boolean;
}

export function TacticalButton({
  label, variant = "primary", loading = false, haptic = true, onPress, disabled, ...props
}: TacticalButtonProps) {
  const vs = VARIANT_STYLES[variant];

  function handlePress(e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) {
    if (haptic) triggerImpact();
    onPress?.(e);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: vs.bg,
        borderWidth: 1,
        borderColor: vs.border,
        borderRadius: 2,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed || disabled ? 0.7 : 1,
        flexDirection: "row",
        gap: 8,
      })}
      {...props}>
      {loading
        ? <ActivityIndicator size="small" color={vs.text} />
        : <Text style={{
            fontFamily:    "Courier New",
            fontSize:      12,
            fontWeight:    "900",
            letterSpacing: 4,
            color:         vs.text,
            textTransform: "uppercase",
          }}>
            {label}
          </Text>
      }
    </Pressable>
  );
}
