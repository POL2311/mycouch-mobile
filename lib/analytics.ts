export function trackEvent(eventName: string, params?: Record<string, any>) {
  // En un entorno de producción, aquí se inicializaría PostHog, Mixpanel o Firebase Analytics.
  // Por ahora loggeamos a consola simulando el payload de telemetría.
  console.log(`[ANALYTICS] Event Tracked: ${eventName}`, params ? JSON.stringify(params) : "");
}
