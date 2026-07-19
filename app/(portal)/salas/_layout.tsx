import { Stack } from "expo-router";

// Nested Stack so "salas" registers as ONE tab-route in the parent Tabs
// navigator while "chat" pushes/pops with a real back-gesture and no tab bar
// flash (same trick as exercise/_layout.tsx) — the Challenge Engine chat is a
// stacked full-immersion screen, not a sibling tab.
export default function SalasLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
    </Stack>
  );
}
