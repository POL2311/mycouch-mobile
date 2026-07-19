import type { TextStyle } from "react-native";

// ── Sistema tipográfico táctico v2 — "Substitution Engine Táctico"
// (limpieza de bugs/refactor: eliminación total del estilo monoespaciado
// tipo typewriter que usaba tacticalSubHeader v1 — letterSpacing extremo +
// fontFamily Courier New/monospace). Ahora una sola familia gobierna TODO el
// texto de sistema de la app: Sans-Serif nativa, extra-heavy, oblicua,
// mayúsculas sostenidas — blanco absoluto o volt sobre negro, sin excepción.
//
// tacticalSubHeader: etiquetas/subtítulos "de sistema" (antes monoespaciadas
// y en oliva atenuado). Mismo rol semántico, tipografía completamente nueva.
//
// metricDisplay: uso RESTRINGIDO exclusivamente a las métricas en vivo del
// tracker de entreno (contador de series, peso/reps, SET COMPLETE, timers de
// descanso) — comparte la misma familia oblicua, escala mayor.
export const tacticalSubHeader: TextStyle = {
  fontWeight: "800",
  fontStyle: "italic",
  textTransform: "uppercase",
  fontSize: 11,
  letterSpacing: 0.8,
  color: "#CCFF00",
};

// fontVariant declarado explícitamente como TextStyle (no `as const`): RN
// tipa TextStyle.fontVariant como el array MUTABLE FontVariant[], así que
// una tupla readonly (lo que produce `as const` en un array) no encaja ahí
// aunque cada string individual sea un literal válido.
export const metricDisplay: TextStyle = {
  fontWeight: "900",
  fontStyle: "italic",
  textTransform: "uppercase",
  fontVariant: ["tabular-nums"],
};
