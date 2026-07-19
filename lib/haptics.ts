import * as Haptics from "expo-haptics";

// Disparadores hápticos centralizados — un único punto de mantenimiento para
// el "carácter" de cada tipo de feedback en toda la app (portal del Alumno y
// panel del Coach), en vez de que cada pantalla decida por su cuenta qué
// ImpactFeedbackStyle/NotificationFeedbackType usar. `.catch(() => {})` en
// los tres: el feedback háptico nunca debe poder tumbar un flujo de guardado
// o navegación si el hardware/OS lo rechaza (simulador, permisos, etc.).

// Checklist al 100%, carga exitosa de un recurso, confirmación de guardado.
export function triggerSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// Tap en botones, selección de días, marcaje de series — el "tick" táctil
// por defecto para cualquier interacción que no sea éxito ni advertencia.
export function triggerImpact(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// El alumno intenta registrar un peso/reps por debajo del mínimo exigido por
// el coach para la serie activa (ver lib/exerciseGating.ts's exceedsThreshold).
export function triggerWarning(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
