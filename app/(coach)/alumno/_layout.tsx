import { Stack } from "expo-router";

// Nested Stack so "alumno" registers as ONE hidden tab-route in the parent
// Tabs navigator (same pattern as (portal)/exercise/_layout.tsx) — pushed
// from the Alumnos roster, off the dock.
export default function AlumnoDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
