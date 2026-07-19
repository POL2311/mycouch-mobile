import { View, Text, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

// ── Shimmer skeleton engine — reemplaza los textos estáticos "Cargando..."
// por bloques pulsantes en gris premium sobre negro absoluto. Un único
// Animated.loop por árbol de esqueleto (ShimmerProvider), compartido vía
// contexto por todos los ShimmerBox hijos — evita instanciar un loop nativo
// independiente por cada bloque cuando una lista renderiza varias filas. ────
const SHIMMER_GRAY = "#1C1C1E";
const SCREEN_BLACK = "#000000";
const CARD_BG      = "#0F0F10";
const CARD_BORDER  = "#2C2C2E";

const ShimmerOpacityContext = createContext<Animated.AnimatedInterpolation<number> | null>(null);

function ShimmerProvider({ children }: { children: ReactNode }) {
  const shimmerValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerValue, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerValue]);

  const opacity = shimmerValue.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <ShimmerOpacityContext.Provider value={opacity}>
      {children}
    </ShimmerOpacityContext.Provider>
  );
}

// Bloque individual del esqueleto — un rectángulo redondeado en #1C1C1E que
// pulsa siguiendo el Animated.loop del ShimmerProvider más cercano. Fuera de
// un ShimmerProvider cae a una opacidad fija de 0.5 (sin pulso) en vez de
// crashear, para poder usarse suelto si algún caller no envuelve manualmente.
function ShimmerBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useContext(ShimmerOpacityContext);
  return (
    <Animated.View
      style={[
        { backgroundColor: SHIMMER_GRAY, borderRadius: 8, opacity: opacity ?? 0.5 },
        style,
      ]}
    />
  );
}

// Bloque suelto de forma arbitraria (p.ej. el lienzo de video del ejercicio
// mientras carga) — mismo motor de pulso, con su propio ShimmerProvider para
// poder usarse fuera de las variantes predefinidas de abajo.
export function ShimmerBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <ShimmerProvider>
      <ShimmerBox style={style} />
    </ShimmerProvider>
  );
}

// ── Variante 1 · tarjeta de macros vacía ─────────────────────────────────────
function ShimmerMacroCardInner() {
  return (
    <View
      style={{
        backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
        borderRadius: 20, padding: 18,
      }}
    >
      <ShimmerBox style={{ width: 130, height: 14, marginBottom: 16 }} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 8 }}>
            <ShimmerBox style={{ width: 34, height: 18 }} />
            <ShimmerBox style={{ width: 42, height: 8 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function ShimmerMacroCard() {
  return (
    <ShimmerProvider>
      <ShimmerMacroCardInner />
    </ShimmerProvider>
  );
}

// ── Variante 2 · lista de ejercicios ─────────────────────────────────────────
function ShimmerExerciseRow() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
      <ShimmerBox style={{ width: 48, height: 48, borderRadius: 12 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <ShimmerBox style={{ width: "72%", height: 14 }} />
        <ShimmerBox style={{ width: "40%", height: 10 }} />
      </View>
      <ShimmerBox style={{ width: 36, height: 20, borderRadius: 6 }} />
    </View>
  );
}

function ShimmerExerciseListInner({ count }: { count: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => <ShimmerExerciseRow key={i} />)}
    </View>
  );
}

export function ShimmerExerciseList({ count = 5 }: { count?: number }) {
  return (
    <ShimmerProvider>
      <ShimmerExerciseListInner count={count} />
    </ShimmerProvider>
  );
}

// ── Reemplazo directo de un bloque "Cargando..." de pantalla completa —
// fondo #000000 absoluto, título opcional (mismo texto que antes, ahora
// leído mientras el esqueleto pulsa detrás en vez de un spinner desnudo). ───
export function ShimmerScreen({
  variant = "exercise-list", label, rows = 5,
}: {
  variant?: "macro-card" | "exercise-list";
  label?: string;
  rows?: number;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: SCREEN_BLACK, paddingHorizontal: 20, paddingTop: 90 }}>
      {label && (
        <Text
          className="text-[11px] uppercase mb-5"
          style={{ color: "#8e8e93", letterSpacing: 1.2 }}
        >
          {label}
        </Text>
      )}
      {variant === "macro-card"
        ? <ShimmerMacroCard />
        : <ShimmerExerciseList count={rows} />}
    </View>
  );
}
