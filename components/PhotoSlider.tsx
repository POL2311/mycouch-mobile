import { useState, useRef, useCallback } from "react";
import {
  View, Image, Text, PanResponder, StyleSheet,
  type GestureResponderEvent, type PanResponderGestureState, type LayoutChangeEvent,
} from "react-native";

const VOLT = "#CCFF00";

interface PhotoSliderProps {
  fotoAnterior: string;
  fotoActual:   string;
  height?: number;
}

// ── Comparador visual de progreso — arrastra el dedo horizontalmente sobre
// el contenedor para revelar más o menos de la foto ANTERIOR (capa superior,
// recortada al ancho de slidePosition%) sobre la foto ACTUAL (capa inferior,
// siempre a ancho completo). El PanResponder captura tanto el toque inicial
// (onPanResponderGrant) como el arrastre (onPanResponderMove) para que el
// slider salte de inmediato al punto tocado, no solo tras empezar a mover
// el dedo. ────────────────────────────────────────────────────────────────
export function PhotoSlider({ fotoAnterior, fotoActual, height = 400 }: PhotoSliderProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [slidePosition, setSlidePosition]   = useState(50); // 0–100, arranca a la mitad

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const updateFromTouchX = useCallback((locationX: number) => {
    if (containerWidth <= 0) return;
    const pct = Math.min(100, Math.max(0, (locationX / containerWidth) * 100));
    setSlidePosition(pct);
  }, [containerWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => updateFromTouchX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt: GestureResponderEvent, _gesture: PanResponderGestureState) =>
        updateFromTouchX(evt.nativeEvent.locationX),
    }),
  ).current;

  return (
    <View
      onLayout={onLayout}
      style={{ width: "100%", height, borderRadius: 20, overflow: "hidden", backgroundColor: "#0F0F10" }}
    >
      {/* Capa inferior — FOTO ACTUAL, siempre a ancho completo */}
      <Image source={{ uri: fotoActual }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />

      {/* Capa superior — FOTO ANTERIOR, recortada dinámicamente a slidePosition% */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { width: `${slidePosition}%`, overflow: "hidden" }]}
      >
        <Image
          source={{ uri: fotoAnterior }}
          resizeMode="cover"
          style={{ width: containerWidth || "100%", height, position: "absolute", left: 0, top: 0 }}
        />
      </View>

      {/* Línea divisoria luminosa + thumb — siguen slidePosition en vivo */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute", top: 0, bottom: 0, left: `${slidePosition}%`, marginLeft: -1,
          width: 2, backgroundColor: VOLT,
          shadowColor: VOLT, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute", top: height / 2 - 18, left: `${slidePosition}%`, marginLeft: -18,
          width: 36, height: 36, borderRadius: 18, backgroundColor: VOLT,
          alignItems: "center", justifyContent: "center",
          shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "900", color: "#000" }}>⇔</Text>
      </View>

      {/* Etiquetas fijas de referencia */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 12, left: 12, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 }}>ANTES</Text>
      </View>
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 12, right: 12, backgroundColor: VOLT, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 9, fontWeight: "900", color: "#000", letterSpacing: 1 }}>AHORA</Text>
      </View>

      {/* Capa transparente de captura de gesto — cubre todo el contenedor, por
          encima de las dos fotos, para que el arrastre funcione desde
          cualquier punto de la imagen, no solo sobre el thumb. */}
      <View {...panResponder.panHandlers} style={StyleSheet.absoluteFillObject} />
    </View>
  );
}
