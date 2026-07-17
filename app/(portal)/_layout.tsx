import { Tabs } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PortalProvider } from "@/lib/portal";
import { WorkoutProvider } from "@/lib/workout";
import { GamificationProvider } from "@/lib/gamification";
import { MotivationProvider } from "@/lib/motivation";
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
  "salas/index":  { label: "SALAS",   icon: "people",      iconOutline: "people-outline"      },
  "perfil/index": { label: "PERFIL",  icon: "person",      iconOutline: "person-outline"      },
};

// ── Master floor dock — flat frame anchored to the viewport floor. The
// ACTIVE route morphs into the floating volt sphere that breaks out of the
// bar, while inactive slots stay flat outline glyphs.
function LuxuryDock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

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
          else         Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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
          <Tabs.Screen name="salas/index" />
          <Tabs.Screen name="perfil/index" />
          {/* Hidden routes — pushed from their respective flows, off the dock */}
          <Tabs.Screen name="exercise" options={{ href: null }} />
          <Tabs.Screen name="workout" options={{ href: null }} />
        </Tabs>
        {/* Mount-once celebration overlay — RN <Modal> renders in its own
            native layer above the tab dock regardless of tree position, so
            any screen calling useMotivation().celebrate() lights this up. */}
        <CelebrationModal />
      </MotivationProvider>
      </GamificationProvider>
      </WorkoutProvider>
    </PortalProvider>
  );
}
