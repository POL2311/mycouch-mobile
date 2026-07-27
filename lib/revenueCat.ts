import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, PurchasesPackage, PurchasesStoreProduct, PurchasesOfferings } from "react-native-purchases";

const API_KEY_APPLE = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const API_KEY_GOOGLE = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";

const isIOSMock = !API_KEY_APPLE || API_KEY_APPLE.includes("xxxxxxxx");
const isAndroidMock = !API_KEY_GOOGLE || API_KEY_GOOGLE.includes("xxxxxxxx");
const isMock = Platform.OS === "ios" ? isIOSMock : isAndroidMock;

export async function initRevenueCat(userId?: string) {
  if (Platform.OS === "web") return;

  if (isMock) {
    console.warn("RevenueCat: No API keys found in .env, running in mock mode.");
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  if (Platform.OS === "ios" && API_KEY_APPLE) {
    Purchases.configure({ apiKey: API_KEY_APPLE, appUserID: userId });
  } else if (Platform.OS === "android" && API_KEY_GOOGLE) {
    Purchases.configure({ apiKey: API_KEY_GOOGLE, appUserID: userId });
  }
}

export type SubscriptionTier = "FREE_SOLO" | "PRO_SOLO" | "COACHED";

export async function checkEntitlementStatus(): Promise<SubscriptionTier> {
  if (Platform.OS === "web" || isMock) return "FREE_SOLO";
  
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    if (typeof customerInfo.entitlements.active['pro_access'] !== "undefined") {
      return "PRO_SOLO";
    }
    return "FREE_SOLO";
  } catch (e) {
    console.error("Failed to check entitlement status", e);
    return "FREE_SOLO";
  }
}

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (Platform.OS === "web" || isMock) {
    // Return mock offerings for development without keys
    return {
      current: {
        availablePackages: [
          {
            identifier: "$rc_monthly",
            packageType: "MONTHLY",
            product: {
              identifier: "pro_monthly",
              description: "Suscripción PRO Mensual",
              title: "PRO Mensual",
              price: 9.99,
              priceString: "$9.99",
              currencyCode: "USD",
            } as PurchasesStoreProduct
          } as PurchasesPackage
        ]
      }
    } as PurchasesOfferings;
  }

  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (e) {
    console.error("Failed to get offerings", e);
    return null;
  }
}

export async function purchasePackage(pack: PurchasesPackage): Promise<boolean> {
  if (Platform.OS === "web" || isMock) {
    // Simulate successful purchase in mock mode
    return true;
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pack);
    if (typeof customerInfo.entitlements.active['pro_access'] !== "undefined") {
      return true;
    }
  } catch (e: any) {
    if (!e.userCancelled) {
      console.error("Purchase failed", e);
    }
  }
  return false;
}

export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS === "web" || isMock) {
    return true; // Simulate success
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    if (typeof customerInfo.entitlements.active['pro_access'] !== "undefined") {
      return true;
    }
  } catch (e: any) {
    console.error("Restore failed", e);
  }
  return false;
}
