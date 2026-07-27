import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { router } from "expo-router";
import { Search, ChevronLeft, Star, Users, CheckCircle2, ChevronRight, X } from "lucide-react-native";
import { BlurView } from "expo-blur";
import { EnterCoachCodeModal } from "@/components/portal/EnterCoachCodeModal";
import { triggerSuccess } from "@/lib/haptics";
import Toast from "react-native-toast-message";
import { trackEvent } from "@/lib/analytics";
import { usePortal, sendCoachRequest, fetchMyRequests } from "@/lib/portal";
import { useAuth } from "@/lib/session";
import type { CoachRequest } from "@/types/coachRequest";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";
const GUTTER = 20;

const GLASS = {
  backgroundColor: "rgba(18,18,20,0.65)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
};

const CATEGORIES = ["TODOS", "HIPERTROFIA", "PÉRDIDA DE GRASA", "CALISTENIA", "MUJERES / GLÚTEOS", "REHABILITACIÓN"];

const MOCK_COACHES = [
  {
    id: "1",
    name: "Alex Herrera",
    verified: true,
    specialty: "HIPERTROFIA",
    rating: 4.9,
    students: 18,
    price: "$49 USD / mes",
    image: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80",
    bio: "Especialista en ganancia muscular y recomposición corporal. Más de 5 años transformando físicos con base científica.",
    cases: [
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&q=80",
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80",
    ],
  },
  {
    id: "2",
    name: "Sofia Martínez",
    verified: true,
    specialty: "MUJERES / GLÚTEOS",
    rating: 4.8,
    students: 24,
    price: "$55 USD / mes",
    image: "https://images.unsplash.com/photo-1609899517235-cbf305621475?w=400&q=80",
    bio: "Enfocada en estética femenina y desarrollo de tren inferior. Entrenamiento inteligente para mujeres.",
    cases: [
      "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&q=80",
    ],
  },
  {
    id: "3",
    name: "David Silva",
    verified: true,
    specialty: "CALISTENIA",
    rating: 5.0,
    students: 12,
    price: "$40 USD / mes",
    image: "https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=400&q=80",
    bio: "Domina tu peso corporal. Progresiones de calistenia, front lever, muscle up y movilidad extrema.",
    cases: [],
  },
];

export default function CoachDirectory() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("TODOS");
  const [selectedCoach, setSelectedCoach] = useState<typeof MOCK_COACHES[0] | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);

  const filteredCoaches = MOCK_COACHES.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "TODOS" || c.specialty === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const { student } = usePortal();
  const { token } = useAuth();
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [isLoadingReq, setIsLoadingReq] = useState(false);

  useEffect(() => {
    if (token) {
      fetchMyRequests(token).then(setRequests);
    }
  }, [token]);

  const createCoachRequest = async (coachId: string) => {
    if (!token) return;
    setIsLoadingReq(true);
    const success = await sendCoachRequest(coachId, token, "Solicito vinculación");
    setIsLoadingReq(false);

    if (success) {
      triggerSuccess();
      trackEvent("COACH_REQUEST_SENT", { coachId });
      
      // Optimistic UI update
      setRequests(prev => [
        ...prev, 
        { 
          id: `tmp-${Date.now()}`, 
          studentId: student?.id ?? "", 
          studentName: student?.name ?? "",
          coachId, 
          goal: "", 
          status: "PENDING", 
          createdAt: new Date().toISOString() 
        }
      ]);

      Toast.show({
        type: "success",
        text1: "Solicitud enviada al Coach",
        text2: "Te notificaremos cuando acepte tu perfil.",
        position: "bottom",
      });
      setSelectedCoach(null);
    } else {
      Toast.show({
        type: "error",
        text1: "Error al enviar",
        text2: "Ocurrió un error al contactar al coach.",
        position: "bottom",
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: GUTTER, paddingVertical: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, marginLeft: -8 }}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff", textTransform: "uppercase" }}>DIRECTORIO PRO</Text>
          <TouchableOpacity onPress={() => setShowCodeModal(true)} style={{ padding: 8, marginRight: -8 }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: VOLT }}>+ CÓDIGO</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: GUTTER, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A1C", borderRadius: 12, paddingHorizontal: 12, height: 48 }}>
            <Search size={18} color={SILVER} />
            <TextInput
              placeholder="Buscar coach, especialidad o ciudad..."
              placeholderTextColor={SILVER}
              style={{ flex: 1, color: "#fff", marginLeft: 8, fontSize: 14, fontWeight: "600" }}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Categories */}
        <View style={{ paddingBottom: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8 }}>
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: active ? VOLT : "rgba(255,255,255,0.05)",
                    borderWidth: 1, borderColor: active ? VOLT : "rgba(255,255,255,0.1)",
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#000" : "#fff" }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* List */}
        <ScrollView 
          removeClippedSubviews={true}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40, gap: 16 }}
        >
          {filteredCoaches.map(coach => (
            <TouchableOpacity
              key={coach.id}
              activeOpacity={0.8}
              onPress={() => setSelectedCoach(coach)}
              style={{ ...GLASS, borderRadius: 16, padding: 16, flexDirection: "row", gap: 16 }}
            >
              <Image source={{ uri: coach.image }} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#1A1A1C" }} />
              <View style={{ flex: 1, justifyContent: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>{coach.name}</Text>
                  {coach.verified && <CheckCircle2 size={14} color={VOLT} />}
                </View>
                <Text style={{ fontSize: 11, fontWeight: "700", color: VOLT, marginTop: 2, marginBottom: 8 }}>{coach.specialty}</Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Star size={12} color="#fff" fill="#fff" />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>{coach.rating}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Users size={12} color={SILVER} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: SILVER }}>{coach.students} alumnos</Text>
                  </View>
                </View>
              </View>
              <View style={{ justifyContent: "center" }}>
                <ChevronRight size={20} color={SILVER} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Coach Profile Modal */}
      <Modal visible={!!selectedCoach} animationType="slide" transparent>
        {selectedCoach && (
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <Image source={{ uri: selectedCoach.image }} style={{ width: "100%", height: 350, opacity: 0.8 }} />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 100, backgroundColor: "rgba(0,0,0,0.5)" }}>
              <SafeAreaView edges={["top"]}>
                <TouchableOpacity onPress={() => setSelectedCoach(null)} style={{ padding: GUTTER, alignSelf: "flex-start" }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                    <X size={24} color="#fff" />
                  </View>
                </TouchableOpacity>
              </SafeAreaView>
            </View>

            <View style={{ flex: 1, backgroundColor: "#000", marginTop: -32, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: GUTTER }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: "#fff" }}>{selectedCoach.name}</Text>
                  {selectedCoach.verified && <CheckCircle2 size={20} color={VOLT} />}
                </View>
                <Text style={{ fontSize: 13, fontWeight: "800", color: VOLT, marginBottom: 16 }}>{selectedCoach.specialty}</Text>
                
                <Text style={{ fontSize: 14, color: SILVER, lineHeight: 22, marginBottom: 24 }}>
                  {selectedCoach.bio}
                </Text>

                {selectedCoach.cases.length > 0 && (
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff", marginBottom: 12 }}>CASOS DE ÉXITO</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                      {selectedCoach.cases.map((img, i) => (
                        <Image key={i} source={{ uri: img }} style={{ width: 140, height: 180, borderRadius: 16, backgroundColor: "#1A1A1C" }} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff", marginBottom: 12 }}>PLANES DISPONIBLES</Text>
                <View style={{ ...GLASS, borderRadius: 16, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Plan Mensual</Text>
                    <Text style={{ fontSize: 12, color: SILVER, marginTop: 4 }}>Rutina + Dieta + Revisiones</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "900", color: VOLT }}>{selectedCoach.price}</Text>
                </View>

              </ScrollView>

              <View style={{ paddingTop: 16, paddingBottom: 16 }}>
                {requests.some(r => r.coachId === selectedCoach.id && r.status === "PENDING") ? (
                  <View style={{ backgroundColor: "rgba(255,255,255,0.1)", paddingVertical: 16, borderRadius: 16, alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "900", color: SILVER }}>SOLICITUD PENDIENTE</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => createCoachRequest(selectedCoach.id)} disabled={isLoadingReq} style={{ backgroundColor: VOLT, paddingVertical: 16, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                    {isLoadingReq && <ActivityIndicator color="#000" />}
                    <Text style={{ fontSize: 14, fontWeight: "900", color: "#000" }}>SOLICITAR VINCULACIÓN</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </Modal>

      <EnterCoachCodeModal
        visible={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        onSuccess={() => setShowCodeModal(false)}
      />
    </View>
  );
}
