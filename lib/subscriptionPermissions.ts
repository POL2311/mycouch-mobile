import type { Student } from "@/lib/portal";

export type SubscriptionTier = "FREE_SOLO" | "PRO_SOLO" | "COACHED";

/**
 * Determina el nivel de suscripción actual del usuario.
 * @param student El objeto estudiante del portal.
 * @param hasActiveSub Si el usuario tiene una suscripción Pro activa (ej. de RevenueCat). Por defecto false para mock.
 */
export function getUserTier(student: Student | null, hasActiveSub: boolean = false): SubscriptionTier {
  if (!student) return "FREE_SOLO";
  if (student.coachId !== null && student.coachId !== undefined) {
    return "COACHED";
  }
  return hasActiveSub ? "PRO_SOLO" : "FREE_SOLO";
}

// ── Permisos Freemium ────────────────────────────────────────────────────────

/**
 * ¿Puede el usuario guardar rutinas como plantillas personalizadas ilimitadas?
 * FREE_SOLO: Limitado a 1.
 * PRO_SOLO / COACHED: Ilimitado.
 */
export function canCreateCustomTemplate(tier: SubscriptionTier, currentTemplatesCount: number): boolean {
  if (tier === "PRO_SOLO" || tier === "COACHED") return true;
  // FREE_SOLO solo puede tener máximo 1 plantilla custom.
  return currentTemplatesCount < 1;
}

/**
 * ¿Puede el usuario ver sugerencias predictivas de peso (Sobrecarga Progresiva)
 * para su siguiente sesión basadas en su rendimiento anterior?
 */
export function canViewNextWeightSuggestion(tier: SubscriptionTier): boolean {
  return tier === "PRO_SOLO" || tier === "COACHED";
}

/**
 * ¿Puede exportar sus reportes de progreso y biometría en PDF?
 */
export function canExportPDF(tier: SubscriptionTier): boolean {
  return tier === "PRO_SOLO" || tier === "COACHED";
}

/**
 * ¿Puede chatear directamente con el entrenador o enviar solicitudes de revisión?
 */
export function canAccessCoachChat(tier: SubscriptionTier): boolean {
  return tier === "COACHED";
}
