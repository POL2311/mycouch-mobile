import { Stack } from "expo-router";

// Nested Stack so "workout" registers as ONE hidden tab-route in the parent
// Tabs navigator (same trick as exercise/_layout.tsx) — "success" presents as
// a full-screen modal, escaping the Tabs' persistent LuxuryDock entirely.
export default function WorkoutSuccessLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="success" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
