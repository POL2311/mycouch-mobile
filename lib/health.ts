import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import AppleHealthKit, { HealthValue, HealthKitPermissions } from "react-native-health";

// Validación segura de constantes de permisos
const permissions: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit?.Constants?.Permissions?.HeartRate,
      AppleHealthKit?.Constants?.Permissions?.ActiveEnergyBurned,
      AppleHealthKit?.Constants?.Permissions?.Steps,
    ].filter(Boolean) as any[],
    write: [
      AppleHealthKit?.Constants?.Permissions?.Workout,
    ].filter(Boolean) as any[],
  },
};

export function useAppleHealth(isActive: boolean) {
  const [hasPermissions, setHasPermissions] = useState(false);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [activeKcal, setActiveKcal] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    // 🛑 Cláusula de seguridad: evita que la app truene si se ejecuta en Expo Go
    if (!AppleHealthKit || typeof AppleHealthKit.initHealthKit !== "function") {
      console.warn(
        "[HealthKit] El módulo nativo de AppleHealthKit no está disponible. " +
        "Recuerda que para probar esta función necesitas un Development Client (npx expo run:ios)."
      );
      return;
    }

    AppleHealthKit.initHealthKit(permissions, (err: string) => {
      if (err) {
        console.log("[HealthKit] Error al inicializar:", err);
        return;
      }
      setHasPermissions(true);
    });
  }, []);

  const fetchMetrics = useCallback(() => {
    if (!hasPermissions || Platform.OS !== "ios") return;

    // Validación antes de llamar a métodos nativos
    if (typeof AppleHealthKit?.getHeartRateSamples !== "function") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const optionsHr = {
      startDate: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // Últimos 10 minutos
      endDate: new Date().toISOString(),
      limit: 1,
      ascending: false,
    };

    AppleHealthKit.getHeartRateSamples(optionsHr, (err: string, results: HealthValue[]) => {
      if (!err && results && results.length > 0) {
        setHeartRate(results[0].value);
      }
    });

    const optionsEnergy = {
      startDate: today.toISOString(),
      endDate: new Date().toISOString(),
    };

    if (typeof AppleHealthKit?.getActiveEnergyBurned === "function") {
      AppleHealthKit.getActiveEnergyBurned(optionsEnergy, (err: string, results: HealthValue[]) => {
        if (!err && results && results.length > 0) {
          const total = results.reduce((sum, r) => sum + r.value, 0);
          setActiveKcal(Math.round(total));
        }
      });
    }
  }, [hasPermissions]);

  useEffect(() => {
    if (!isActive) return;
    // Consulta inicial
    fetchMetrics();
    // Consulta periódica cada 5 segundos durante el entrenamiento
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [isActive, fetchMetrics]);

  return { heartRate, activeKcal, hasPermissions };
}