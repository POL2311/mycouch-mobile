import { Tabs } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CoachProvider } from "@/lib/coach";
import { triggerImpact } from "@/lib/haptics";

// ── Coach Portal premium dark palette ────────────────────────────────────────
export const COACH_BG     = "#000000";
export const COACH_CARD   = "#0F0F10";
export const COACH_BORDER = "#2C2C2E";
export const COACH_ACCENT = "#CCFF00";
export const COACH_ALERT  = "#FF3B30";
export const COACH_MUTED  = "#8E8E93";
export const COACH_GOLD   = "#FFD700";

type IconName = keyof typeof Ionicons.glyphMap;

// Six-tab coach suite, exact order: Dashboard · Alumnos · Plantillas ·
// Períodos · Pagos · Perfil. The prior "Sala" tab is retired from the dock —
// its room-identity fields (código de vinculación, tarifa) now live on
// Perfil; sala.tsx's telemetry/notices/roster-disconnect tools remain in the
// tree as a non-dock route rather than being deleted outright.
const TAB_META: Record<string, { label: string; icon: IconName; iconOutline: IconName }> = {
  index:         { label: "Dashboard",  icon: "grid",   iconOutline: "grid-outline" },
  alumnos:       { label: "Alumnos",    icon: "people", iconOutline: "people-outline" },
  plantillas:    { label: "Plantillas", icon: "albums", iconOutline: "albums-outline" },
  periodos:      { label: "Períodos",   icon: "calendar", iconOutline: "calendar-outline" },
  pagos:         { label: "Pagos",      icon: "card",   iconOutline: "card-outline" },
  "perfil/index": { label: "Perfil",    icon: "person", iconOutline: "person-outline" },
};

// ── Coach floor dock — premium dark palette: #0F0F10 fill, #2C2C2E hairline.
// The focused tab morphs into the floating cyan-neon sphere; everything else
// stays a flat outline glyph. ────────────────────────────────────────────────
function CoachDock({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  const focusedRoute = state.routes[state.index];
  const { options } = descriptors[focusedRoute.key];
  // @ts-ignore
  if (options.tabBarStyle?.display === "none") return null;

  return (
    <View
      style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 84 + insets.bottom, paddingBottom: insets.bottom,
        backgroundColor: COACH_CARD, borderTopWidth: 0.5, borderColor: COACH_BORDER,
        flexDirection: "row", alignItems: "center",
      }}
    >
      {state.routes.map((route, idx) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === idx;

        const handlePress = () => {
          if (focused) Haptics.selectionAsync();
          else         triggerImpact();

          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        if (focused) {
          return (
            <Pressable key={route.key} onPress={handlePress} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  width: 56, height: 56, borderRadius: 28, backgroundColor: COACH_ACCENT,
                  alignItems: "center", justifyContent: "center",
                  transform: [{ translateY: -16 }, { scale: 1.1 }],
                  shadowColor: COACH_ACCENT, shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 12,
                }}
              >
                <Ionicons name={meta.icon} size={24} color="#000000" />
              </View>
              <Text className="font-semibold uppercase" style={{ fontSize: 8, letterSpacing: 0.5, marginTop: -12, color: "#FFFFFF" }}>
                {meta.label}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable key={route.key} onPress={handlePress} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Ionicons name={meta.iconOutline} size={18} color={COACH_MUTED} />
            <Text className="font-semibold uppercase" style={{ fontSize: 8, letterSpacing: 0.5, color: COACH_MUTED }}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function CoachLayout() {
  return (
    <CoachProvider>
      <Tabs tabBar={props => <CoachDock {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="alumnos" />
        <Tabs.Screen name="plantillas" />
        <Tabs.Screen name="periodos" />
        <Tabs.Screen name="pagos" />
        <Tabs.Screen name="perfil/index" />
        {/* Retired from the dock, kept reachable in the tree */}
        <Tabs.Screen name="sala" options={{ href: null }} />
        {/* Hidden route — pushed from the Alumnos roster, off the dock */}
        <Tabs.Screen name="alumno" options={{ href: null }} />
        {/* Hidden route — pushed from Plantillas' "Gestionar catálogo" link */}
        <Tabs.Screen name="catalogo" options={{ href: null }} />
      </Tabs>
    </CoachProvider>
  );
}
