import { Tabs } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PortalProvider } from "@/lib/portal";
import { SelfCoachProvider } from "@/lib/selfCoach";
import { WorkoutProvider } from "@/lib/workout";
import { GamificationProvider } from "@/lib/gamification";
import { MotivationProvider } from "@/lib/motivation";
import { triggerImpact } from "@/lib/haptics";
import CelebrationModal from "@/components/ui/CelebrationModal";

const VOLT = "#CCFF00";

type IconName = keyof typeof Ionicons.glyphMap;

// Route → dock item mapping. Exactly five tabs (profile blueprint §1.3):
// DIETA · STATS · WORKOUT · SALAS · PERFIL. The SALIR trigger is purged from
// the nav tree — the canonical logout surface is the Perfil screen's
// CERRAR SESIÓN latch.
const TAB_META: Record<string, { label: string; icon: IconName; iconOutline: IconName }> = {
  nutrition:      { label: "DIETA",   icon: "restaurant",  iconOutline: "restaurant-outline"  },
  "stats/index":  { label: "STATS",   icon: "stats-chart", iconOutline: "stats-chart-outline" },
  index:          { label: "WORKOUT", icon: "barbell",     iconOutline: "barbell-outline"     },
  salas:          { label: "SALAS",   icon: "people",      iconOutline: "people-outline"      },
  "perfil/index": { label: "PERFIL",  icon: "person",      iconOutline: "person-outline"      },
};

// Nested sub-routes that must render truly full-screen, with zero dock
// underneath — both workout/success.tsx and nutrition/success.tsx already
// set presentation:"fullScreenModal" on their own nested Stack.Screen, but
// that option only governs how THAT stack transitions between ITS OWN
// screens; it does nothing to detach the stack from the parent Tabs
// navigator. Since LuxuryDock is a fully custom tabBar (not React
// Navigation's stock BottomTabBar), Stack.Screen's tabBarStyle:{display:
// 'none'} escape hatch has no effect here either — this component never
// reads that option. The dock has to be told explicitly which nested
// screens to disappear for.
//
// "[id]" (exercise/[id].tsx) joined this set per .cursorrules' explicit
// "un tracker en vivo" clause — that screen used to just reserve bottom
// padding (DOCK_CLEAR) to coexist with the dock instead of hiding it, which
// is exactly the coexistence pattern the rule prohibits for this class of
// screen, dock-height math fragility aside.
const NO_DOCK_SCREENS = new Set(["success", "[id]"]);

// ── Master floor dock — flat frame anchored to the viewport floor. The
// ACTIVE route morphs into the floating volt sphere that breaks out of the
// bar, while inactive slots stay flat outline glyphs.
function LuxuryDock({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Salas is a fully immersive experience end-to-end (feed + chat) — the dock
  // never coexists with it, not even on its own tab root, unlike every other
  // tab where NO_DOCK_SCREENS only hides the dock for specific NESTED
  // sub-routes. salas/index.tsx renders its own custom back button in place
  // of the dock for this exact reason.
  const focusedRoute = state.routes[state.index];
  if (focusedRoute?.name === "salas") return null;

  // Respect tabBarStyle: { display: 'none' } from the screen options.
  const { options } = descriptors[focusedRoute.key];
  // @ts-ignore - tabBarStyle may not be perfectly typed for custom docks but it's passed in options
  if (options.tabBarStyle?.display === "none") return null;

  // Look one level down into the focused tab's own nested navigator (if it
  // has one) to find which sub-screen is actually on screen right now.
  const nestedState   = focusedRoute?.state;
  const nestedIdx     = nestedState?.index ?? (nestedState ? nestedState.routes.length - 1 : -1);
  const nestedRouteName = nestedState?.routes[nestedIdx]?.name;
  if (nestedRouteName && NO_DOCK_SCREENS.has(nestedRouteName)) return null;

  return (
    <View
      style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 84 + insets.bottom, paddingBottom: insets.bottom,
        backgroundColor: "#161618",
        flexDirection: "row", alignItems: "center",
        // Floating panel, no hairline seam — separation comes from the shadow
        // alone (Elite Telemetry dock polish).
        shadowColor: "#000", shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16,
      }}
    >
      {state.routes.map((route, idx) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === idx;

        const handlePress = () => {
          // Tactile layer: selection tick on the active sphere, light impact
          // on the side tabs.
          if (focused) Haptics.selectionAsync();
          else         triggerImpact();

          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        if (focused) {
          return (
            <Pressable
              key={route.key}
              onPress={handlePress}
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: VOLT,
                  justifyContent: "center",
                  alignItems: "center",
                  // The Active Morph: the focused tab swells 1.1x on top of
                  // its floating lift, anchoring where the user is at a glance.
                  transform: [{ translateY: -16 }, { scale: 1.1 }],
                  shadowColor: VOLT,
                  shadowOpacity: 0.45,
                  shadowRadius: 22,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 12,
                }}
              >
                <Ionicons name={meta.icon} size={26} color="#000000" />
              </View>
              <Text
                className="font-semibold uppercase"
                style={{ fontSize: 9, letterSpacing: 0.8, marginTop: -12, color: "#FFFFFF" }}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={handlePress}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Ionicons name={meta.iconOutline} size={20} color="#71717a" />
            <Text
              className="font-semibold uppercase"
              style={{ fontSize: 9, letterSpacing: 0.8, color: "#71717a" }}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PortalLayout() {
  return (
    <PortalProvider>
      {/* Módulo 2 "Auto-Entrenador" — el plan local (sin coach) que
          WorkoutProvider abajo consulta cuando no hay routineJson real
          asignado. Debe montarse antes de WorkoutProvider. */}
      <SelfCoachProvider>
      {/* Session engine shared between the WORKOUT lobby and the dynamic
          exercise/[id] focus screen, so the lifecycle machine, timers, and
          set state survive the stack push instead of forking per screen. */}
      <WorkoutProvider>
      <GamificationProvider>
      <MotivationProvider>
        <Tabs
          tabBar={props => <LuxuryDock {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="nutrition" />
          <Tabs.Screen name="stats/index" />
          <Tabs.Screen name="index" />
          <Tabs.Screen name="salas" />
          <Tabs.Screen name="perfil/index" />
          {/* Hidden routes — pushed from their respective flows, off the dock */}
          <Tabs.Screen name="exercise" options={{ href: null, tabBarStyle: { display: 'none' } }} />
          <Tabs.Screen name="workout" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        </Tabs>
        {/* Mount-once celebration overlay — RN <Modal> renders in its own
            native layer above the tab dock regardless of tree position, so
            any screen calling useMotivation().celebrate() lights this up. */}
        <CelebrationModal />
      </MotivationProvider>
      </GamificationProvider>
      </WorkoutProvider>
      </SelfCoachProvider>
    </PortalProvider>
  );
}
