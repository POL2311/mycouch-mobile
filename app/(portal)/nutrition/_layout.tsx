import { Stack } from "expo-router";

// Nested Stack so "nutrition" keeps registering as ONE visible tab-route in
// the parent Tabs navigator (same trick as exercise/_layout.tsx) — "success"
// presents as a full-screen modal, escaping the Tabs' persistent LuxuryDock.
export default function NutritionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="success" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
