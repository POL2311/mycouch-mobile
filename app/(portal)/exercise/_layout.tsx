import { Stack } from "expo-router";

// Nested Stack so "exercise" registers as ONE tab-route in the parent Tabs
// navigator while [id] pushes/pops with a real back-gesture and no tab bar
// flash — the Focus View is a stacked screen, not a sibling tab.
export default function ExerciseLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
