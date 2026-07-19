import type { ViewStyle } from "react-native";

export const VOLT_NEON = "#CCFF00";

// Resplandor LED reutilizable — usar sobre elementos críticos ACTIVOS
// (tarjeta de racha, tarjeta de nivel, CTA de inicio de entreno) para que
// lean como fuentes de luz propias sobre el fondo negro absoluto de la app.
// `elevation` es lo único que Android respeta; shadowOpacity/shadowRadius
// solo se ven en iOS, y únicamente si la View que los lleva no tiene
// overflow:'hidden' — de ahí NeonGlowView (components/ui/NeonGlowView.tsx),
// que aplica el resplandor en un contenedor exterior separado del contenido
// recortado (blur, imagen, etc.) que pueda llevar dentro.
// Valores exactos declarados en .cursorrules §3 "Resplandor Led (Outer Glow)"
// — única fuente de verdad para este token en todo el workspace.
export const neonGlow: ViewStyle = {
  shadowColor: VOLT_NEON,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.3,
  shadowRadius: 10,
  elevation: 6,
  borderWidth: 1,
  borderColor: VOLT_NEON,
};

// Misma receta con otro color LED — p.ej. rojo de alerta para una racha rota.
export function neonGlowFor(color: string): ViewStyle {
  return { ...neonGlow, shadowColor: color, borderColor: color };
}
