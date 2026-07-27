import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, Modal, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { router, useFocusEffect } from "expo-router";
import { ChevronLeft, Plus, Check, Search, Trophy, Clock, Flag, Save } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";
import { useSelfCoach } from "@/lib/selfCoach";
import { useGamification } from "@/lib/gamification";
import { requestNotificationPermissions, scheduleRestTimerNotification, cancelScheduledRestNotifications } from "@/lib/notifications";
import { PermissionPreModal } from "@/components/PermissionPreModal";
import { trackMilestoneAndReview } from "@/lib/storeReview";
import { trackEvent } from "@/lib/analytics";
import { usePortal } from "@/lib/portal";
import { PaywallModal } from "@/components/ui/PaywallModal";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";
const GUTTER = 20;

const GLASS = {
  backgroundColor: "rgba(18,18,20,0.65)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
};

const MOCK_EXERCISES = [
  { id: "e1", name: "Press de Banca Plano", muscle: "Pecho" },
  { id: "e2", name: "Sentadilla Libre", muscle: "Pierna" },
  { id: "e3", name: "Peso Muerto Convencional", muscle: "Pierna" },
  { id: "e4", name: "Dominadas", muscle: "Espalda" },
  { id: "e5", name: "Remo con Barra", muscle: "Espalda" },
  { id: "e6", name: "Press Militar", muscle: "Hombro" },
  { id: "e7", name: "Curl de Bíceps", muscle: "Bíceps/Tríceps" },
];

export default function QuickWorkout() {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<{ id: string; name: string; sets: any[] }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [showPRBadge, setShowPRBadge] = useState(false);
  const [showNotifPreModal, setShowNotifPreModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const { student } = usePortal();

  // Esconder la tab bar y limpiar al salir
  useEffect(() => {
    // Check if we already have permissions, if not, we'll prompt via modal when needed
    return () => {
      cancelScheduledRestNotifications();
    };
  }, []);

  // Timer logic
  useEffect(() => {
    if (restTimer === null) return;
    if (restTimer <= 0) {
      triggerSuccess();
      setRestTimer(null);
      return;
    }
    const interval = setInterval(() => {
      setRestTimer(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [restTimer]);

  const handleAddExercise = (ex: any) => {
    setExercises([...exercises, { ...ex, sets: [{ reps: "", weight: "", rpe: "", done: false }] }]);
    setShowAddModal(false);
    setSearch("");
  };

  const updateSet = (exIdx: number, setIdx: number, field: string, value: string) => {
    const next = [...exercises];
    next[exIdx].sets[setIdx][field] = value;
    setExercises(next);
  };

  const toggleSet = (exIdx: number, setIdx: number) => {
    const next = [...exercises];
    const isDone = !next[exIdx].sets[setIdx].done;
    next[exIdx].sets[setIdx].done = isDone;
    setExercises(next);

    if (isDone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Attempt to play a local chime (stub implementation)
      Audio.Sound.createAsync(require("../../assets/icon.png")) // placeholder fallback
        .then(({ sound }) => sound.playAsync().catch(() => {}))
        .catch(() => {});

      const restSeconds = 90;
      setRestTimer(restSeconds); // 1:30 min rest
      
      // We trigger the premodal for the first time we need notifications if not granted
      // In a real app we'd check current status first. For now we assume we need to ask
      // or the modal triggers the OS prompt. Let's just schedule and let OS handle if already asked.
      scheduleRestTimerNotification(restSeconds, next[exIdx].name).catch(() => {
        setShowNotifPreModal(true);
      });
      
      // PR Mock Logic
      const weight = parseFloat(next[exIdx].sets[setIdx].weight);
      if (weight > 100) {
        setShowPRBadge(true);
        triggerSuccess();
        trackEvent("NEW_PR_ACHIEVED", { exercise: next[exIdx].name, weight });
        trackMilestoneAndReview();
        setTimeout(() => setShowPRBadge(false), 3000);
      }
    }
  };

  const addSet = (exIdx: number) => {
    const next = [...exercises];
    next[exIdx].sets.push({ reps: "", weight: "", rpe: "", done: false });
    setExercises(next);
  };

  const filteredCatalog = MOCK_EXERCISES.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  const handleFinish = () => {
    Alert.alert(
      "Entrenamiento Finalizado",
      "¡Excelente trabajo! ¿Deseas guardar esta sesión como una Plantilla Personalizada para repetirla después?",
      [
        { text: "No, solo salir", onPress: () => {
          trackEvent("WORKOUT_COMPLETED", { exercises: exercises.length });
          trackMilestoneAndReview();
          require("expo-router").router.back();
        }, style: "cancel" },
        { text: "Guardar Plantilla", onPress: () => {
            if (!student?.coachId) {
              // Freemium limit reached simulation (assuming they have >= 2 templates)
              setShowPaywall(true);
            } else {
              trackEvent("WORKOUT_COMPLETED", { exercises: exercises.length });
              trackMilestoneAndReview();
              triggerSuccess();
              require("expo-router").router.back();
            }
        }},
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: GUTTER, paddingVertical: 12 }}>
          <TouchableOpacity onPress={() => require("expo-router").router.back()} style={{ padding: 8, marginLeft: -8 }}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff", textTransform: "uppercase" }}>ENTRENO LIBRE</Text>
          <TouchableOpacity onPress={handleFinish} style={{ padding: 8, marginRight: -8 }}>
            <Flag size={20} color={VOLT} />
          </TouchableOpacity>
        </View>

        {showPRBadge && (
          <View style={{ position: "absolute", top: 100, alignSelf: "center", backgroundColor: VOLT, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 10, shadowColor: VOLT, shadowOpacity: 0.5, shadowRadius: 10 }}>
            <Trophy size={20} color="#000" />
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#000" }}>¡NUEVO PR DETECTADO!</Text>
          </View>
        )}

        <ScrollView 
          removeClippedSubviews={true}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 100, gap: 24 }}
        >
          {exercises.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 24, padding: 32, alignItems: "center", gap: 12, marginTop: 40 }}>
              <Trophy size={32} color={SILVER} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>SESIÓN VACÍA</Text>
              <Text style={{ fontSize: 13, color: SILVER, textAlign: "center" }}>Agrega ejercicios sobre la marcha y registra tus levantamientos.</Text>
            </View>
          ) : (
            exercises.map((ex, exIdx) => (
              <View key={exIdx} style={{ ...GLASS, borderRadius: 16, overflow: "hidden" }}>
                <View style={{ backgroundColor: "#1A1A1C", padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>{ex.name}</Text>
                </View>
                
                <View style={{ padding: 16, gap: 12 }}>
                  <View style={{ flexDirection: "row", paddingHorizontal: 8 }}>
                    <Text style={{ flex: 0.5, fontSize: 10, fontWeight: "800", color: SILVER }}>SET</Text>
                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "800", color: SILVER, textAlign: "center" }}>KG</Text>
                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "800", color: SILVER, textAlign: "center" }}>REPS</Text>
                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "800", color: SILVER, textAlign: "center" }}>RPE</Text>
                    <View style={{ width: 32 }} />
                  </View>

                  {ex.sets.map((set, setIdx) => (
                    <View key={setIdx} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, backgroundColor: set.done ? "rgba(204,255,0,0.1)" : "transparent", paddingVertical: 8, borderRadius: 8 }}>
                      <Text style={{ flex: 0.5, fontSize: 14, fontWeight: "800", color: set.done ? VOLT : "#fff" }}>{setIdx + 1}</Text>
                      <TextInput
                        style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, color: "#fff", textAlign: "center", paddingVertical: 6, marginHorizontal: 4 }}
                        keyboardType="decimal-pad"
                        placeholder="-"
                        placeholderTextColor={SILVER}
                        value={set.weight}
                        onChangeText={v => updateSet(exIdx, setIdx, "weight", v)}
                        editable={!set.done}
                      />
                      <TextInput
                        style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, color: "#fff", textAlign: "center", paddingVertical: 6, marginHorizontal: 4 }}
                        keyboardType="number-pad"
                        placeholder="-"
                        placeholderTextColor={SILVER}
                        value={set.reps}
                        onChangeText={v => updateSet(exIdx, setIdx, "reps", v)}
                        editable={!set.done}
                      />
                      <TextInput
                        style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, color: "#fff", textAlign: "center", paddingVertical: 6, marginHorizontal: 4 }}
                        keyboardType="number-pad"
                        placeholder="-"
                        placeholderTextColor={SILVER}
                        value={set.rpe}
                        onChangeText={v => updateSet(exIdx, setIdx, "rpe", v)}
                        editable={!set.done}
                      />
                      <TouchableOpacity
                        onPress={() => toggleSet(exIdx, setIdx)}
                        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: set.done ? VOLT : "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", marginLeft: 8 }}
                      >
                        {set.done && <Check size={16} color="#000" strokeWidth={3} />}
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity onPress={() => addSet(exIdx)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginTop: 8 }}>
                    <Plus size={16} color={VOLT} />
                    <Text style={{ fontSize: 12, fontWeight: "800", color: VOLT }}>AÑADIR SET</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity onPress={() => setShowAddModal(true)} style={{ backgroundColor: VOLT, borderRadius: 16, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <Plus size={20} color="#000" />
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#000" }}>AÑADIR EJERCICIO</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Rest Timer */}
      {restTimer !== null && (
        <View style={{ position: "absolute", bottom: insets.bottom + 16, left: GUTTER, right: GUTTER, backgroundColor: VOLT, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: VOLT, shadowOpacity: 0.3, shadowRadius: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Clock size={24} color="#000" />
            <View>
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#000" }}>TIEMPO DE DESCANSO</Text>
              <Text style={{ fontSize: 24, fontWeight: "900", color: "#000", fontVariant: ["tabular-nums"] }}>
                {Math.floor(restTimer / 60).toString().padStart(2, "0")}:{(restTimer % 60).toString().padStart(2, "0")}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setRestTimer(null)} style={{ backgroundColor: "rgba(0,0,0,0.1)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#000" }}>SALTAR</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Exercise Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#121214" }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: GUTTER, paddingVertical: 20 }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "900", color: "#fff" }}>CATÁLOGO</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: VOLT }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ paddingHorizontal: GUTTER, paddingBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A1C", borderRadius: 12, paddingHorizontal: 12, height: 48 }}>
              <Search size={18} color={SILVER} />
              <TextInput
                placeholder="Buscar ejercicio..."
                placeholderTextColor={SILVER}
                style={{ flex: 1, color: "#fff", marginLeft: 8, fontSize: 14, fontWeight: "600" }}
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40, gap: 12 }}>
            {filteredCatalog.map(ex => (
              <TouchableOpacity
                key={ex.id}
                onPress={() => handleAddExercise(ex)}
                style={{ ...GLASS, padding: 16, borderRadius: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
              >
                <View>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>{ex.name}</Text>
                  <Text style={{ fontSize: 12, color: SILVER, marginTop: 4 }}>{ex.muscle}</Text>
                </View>
                <Plus size={20} color={VOLT} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <PermissionPreModal
        visible={showNotifPreModal}
        title="Alertas de Descanso"
        description="Necesitamos permisos de notificaciones para avisarte cuando termines tu tiempo de descanso, incluso si minimizas la app."
        onGrant={async () => {
          setShowNotifPreModal(false);
          await requestNotificationPermissions();
        }}
        onClose={() => setShowNotifPreModal(false)}
      />

      {/* Paywall Interception */}
      <PaywallModal 
        visible={showPaywall} 
        onClose={() => setShowPaywall(false)}
        title="LÍMITE DE PLANTILLAS"
        description="Has alcanzado el límite de 2 plantillas en la versión gratuita. Actualiza a PRO o contrata a un Coach para guardar plantillas ilimitadas."
      />
    </View>
  );
}
