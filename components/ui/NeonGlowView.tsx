import { View, type ViewProps, type StyleProp, type ViewStyle } from "react-native";
import { neonGlow, neonGlowFor } from "@/lib/neon";

interface NeonGlowViewProps extends ViewProps {
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

// Envoltorio reutilizable del resplandor LED (Módulo 3) — deliberadamente no
// fija overflow:'hidden' sobre sí misma: en iOS eso recortaría el glow a un
// rectángulo plano sin brillo. Los hijos con sus propias esquinas
// redondeadas/blur/overflow van dentro sin heredar ese recorte.
export function NeonGlowView({ color, style, children, ...props }: NeonGlowViewProps) {
  const glow = color ? neonGlowFor(color) : neonGlow;
  return (
    <View style={[glow, { borderRadius: 20 }, style]} {...props}>
      {children}
    </View>
  );
}
