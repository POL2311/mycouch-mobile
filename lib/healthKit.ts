import { Platform } from "react-native";
import { useEffect, useState } from "react";
// En un entorno de Expo Go, importarlo directamente lanzará un error si no hay un build custom (dev client).
// Para no romper la app principal, lo encapsulamos.
let AppleHealthKit: any;
try {
  AppleHealthKit = require("react-native-health").default;
} catch (e) {
  // Ignorar en entorno simulado sin plugin
}

const PERMISSIONS = AppleHealthKit ? {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.HeartRate,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.Workout,
    ],
  },
} : null;

export async function initHealthKit(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== "ios" || !AppleHealthKit) {
      console.log("HealthKit not available on this platform or environment.");
      return resolve(false);
    }
    AppleHealthKit.initHealthKit(PERMISSIONS, (err: string) => {
      if (err) {
        console.error("Error initializing HealthKit: ", err);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

export interface DailyBiometrics {
  steps: number;
  activeCalories: number;
  avgHeartRate: number;
}

export async function fetchDailyBiometrics(): Promise<DailyBiometrics> {
  return new Promise((resolve) => {
    const fallback: DailyBiometrics = { steps: 8432, activeCalories: 640, avgHeartRate: 72 };
    
    if (Platform.OS !== "ios" || !AppleHealthKit) {
      return resolve(fallback); // Mocks for unsupported environment
    }

    const options = {
      date: new Date().toISOString(),
    };

    let steps = 0;
    let activeCalories = 0;
    let avgHeartRate = 0;
    let completed = 0;

    const checkComplete = () => {
      completed++;
      if (completed === 3) resolve({ steps, activeCalories, avgHeartRate });
    };

    AppleHealthKit.getStepCount(options, (err: any, results: any) => {
      if (!err && results) steps = results.value;
      checkComplete();
    });

    AppleHealthKit.getActiveEnergyBurned(options, (err: any, results: any) => {
      if (!err && results && results.length > 0) activeCalories = results[0].value;
      checkComplete();
    });

    AppleHealthKit.getHeartRateSamples(options, (err: any, results: any) => {
      if (!err && results && results.length > 0) {
        avgHeartRate = Math.round(results.reduce((acc: number, r: any) => acc + r.value, 0) / results.length);
      }
      checkComplete();
    });
  });
}

export function useHealthData() {
  const [data, setData] = useState<DailyBiometrics>({ steps: 0, activeCalories: 0, avgHeartRate: 0 });
  const [loading, setLoading] = useState(true);

  const sync = async () => {
    setLoading(true);
    const initialized = await initHealthKit();
    const result = await fetchDailyBiometrics();
    setData(result);
    setLoading(false);
  };

  useEffect(() => {
    sync();
  }, []);

  return { data, loading, sync };
}
