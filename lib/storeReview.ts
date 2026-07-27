import * as StoreReview from "expo-store-review";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HAS_REVIEWED_KEY = "@mycoach_has_reviewed";
const MILESTONE_COUNT_KEY = "@mycoach_milestone_count";
const REQUIRED_MILESTONES = 3; // Mostrar al 3er hito (ej. 3 entrenos o 3 PRs)

export async function trackMilestoneAndReview() {
  try {
    const hasReviewed = await AsyncStorage.getItem(HAS_REVIEWED_KEY);
    if (hasReviewed === "true") return; // Ya se pidió reseña exitosamente

    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    const countStr = await AsyncStorage.getItem(MILESTONE_COUNT_KEY);
    let count = countStr ? parseInt(countStr, 10) : 0;
    count += 1;
    
    if (count >= REQUIRED_MILESTONES) {
      const hasAction = await StoreReview.hasAction();
      if (hasAction) {
        await StoreReview.requestReview();
        await AsyncStorage.setItem(HAS_REVIEWED_KEY, "true");
      }
    } else {
      await AsyncStorage.setItem(MILESTONE_COUNT_KEY, count.toString());
    }
  } catch (e) {
    console.error("Store review trigger error:", e);
  }
}
