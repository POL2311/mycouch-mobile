import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, Pressable, Image, Alert } from "react-native";
import { Camera, X as XIcon, Trash2, Plus } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { COACH_CARD, COACH_BORDER, COACH_MUTED, COACH_GOLD, COACH_ACCENT, COACH_BG } from "@/app/(coach)/_layout";

const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };
const CARD = { backgroundColor: COACH_CARD, borderWidth: 1, borderColor: COACH_BORDER } as const;

type Angle = "FRENTE" | "PERFIL" | "ESPALDA";

interface Photo {
  id: string;
  url: string;
  date: string;
  weight: number;
  angle: Angle;
}

const MOCK_PHOTOS: Photo[] = [
  { id: "1", url: "https://i.pravatar.cc/300?u=1", date: "12 Ene 2024", weight: 75.5, angle: "FRENTE" },
  { id: "2", url: "https://i.pravatar.cc/300?u=2", date: "12 Ene 2024", weight: 75.5, angle: "PERFIL" },
  { id: "3", url: "https://i.pravatar.cc/300?u=3", date: "12 Ene 2024", weight: 75.5, angle: "ESPALDA" },
  { id: "4", url: "https://i.pravatar.cc/300?u=4", date: "15 Jun 2024", weight: 72.0, angle: "FRENTE" },
  { id: "5", url: "https://i.pravatar.cc/300?u=5", date: "15 Jun 2024", weight: 72.0, angle: "PERFIL" },
  { id: "6", url: "https://i.pravatar.cc/300?u=6", date: "15 Jun 2024", weight: 72.0, angle: "ESPALDA" },
];

export default function ProgressGallery() {
  const [angle, setAngle] = useState<Angle>("FRENTE");
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>(MOCK_PHOTOS);

  const filteredPhotos = photos.filter(p => p.angle === angle).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const initialPhoto = filteredPhotos[0];
  const currentPhoto = filteredPhotos[filteredPhotos.length - 1];

  const handleUploadPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso denegado", "Se requiere acceso a la galería para subir fotos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      Alert.alert(
        "Seleccionar Ángulo",
        "¿Qué ángulo representa esta foto?",
        [
          { text: "Frente", onPress: () => addPhoto(result.assets[0].uri, "FRENTE") },
          { text: "Perfil", onPress: () => addPhoto(result.assets[0].uri, "PERFIL") },
          { text: "Espalda", onPress: () => addPhoto(result.assets[0].uri, "ESPALDA") },
          { text: "Cancelar", style: "cancel" }
        ]
      );
    }
  };

  const addPhoto = (uri: string, selectedAngle: Angle) => {
    const newPhoto: Photo = {
      id: Math.random().toString(),
      url: uri,
      date: selectedMonth ? selectedMonth.split(" ")[0] + " 2024" : "15 Jun 2024",
      weight: 70.0, // Mocked weight
      angle: selectedAngle
    };
    setPhotos(prev => [...prev, newPhoto]);
  };

  const handleDeletePhoto = (id: string) => {
    Alert.alert("Eliminar foto", "¿Estás seguro de que deseas eliminar esta foto de progreso?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => setPhotos(prev => prev.filter(p => p.id !== id)) }
    ]);
  };

  return (
    <View style={{ gap: 24 }}>
      {/* Filters */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {(["FRENTE", "PERFIL", "ESPALDA"] as Angle[]).map(a => (
          <TouchableOpacity 
            key={a} 
            onPress={() => setAngle(a)}
            style={{ 
              backgroundColor: angle === a ? "rgba(204,255,0,0.15)" : "#1C1C1E",
              borderWidth: 1, borderColor: angle === a ? COACH_ACCENT : COACH_BORDER,
              paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: angle === a ? COACH_ACCENT : COACH_MUTED, letterSpacing: 0.5 }}>
              {angle === a ? `🔘 ${a}` : a}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Comparison Hero */}
      <View style={{ ...CARD, borderRadius: 16, padding: 16 }}>
        <Text style={{ fontSize: 13, color: "#fff", fontWeight: "600", marginBottom: 12 }}>Comparativa Actual</Text>
        <View style={{ flexDirection: "row", gap: 10, height: 240 }}>
          <View style={{ flex: 1, backgroundColor: "#0F0F10", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COACH_BORDER }}>
            {initialPhoto ? (
              <>
                <Image source={{ uri: initialPhoto.url }} style={{ width: "100%", height: "100%" }} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: "rgba(0,0,0,0.75)" }}>
                  <Text style={{ fontSize: 10, color: COACH_MUTED, fontWeight: "600" }}>INICIAL</Text>
                  <Text style={{ fontSize: 12, color: "#fff", fontWeight: "800" }}>{initialPhoto.date} · {initialPhoto.weight}kg</Text>
                </View>
              </>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={COACH_MUTED} style={{ opacity: 0.5 }} />
              </View>
            )}
          </View>
          <View style={{ flex: 1, backgroundColor: "#0F0F10", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COACH_ACCENT }}>
            {currentPhoto && currentPhoto !== initialPhoto ? (
              <>
                <Image source={{ uri: currentPhoto.url }} style={{ width: "100%", height: "100%" }} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: "rgba(0,0,0,0.75)" }}>
                  <Text style={{ fontSize: 10, color: COACH_ACCENT, fontWeight: "600" }}>ACTUAL</Text>
                  <Text style={{ fontSize: 12, color: "#fff", fontWeight: "800" }}>{currentPhoto.date} · {currentPhoto.weight}kg</Text>
                </View>
              </>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={COACH_MUTED} style={{ opacity: 0.5 }} />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* History by Month */}
      <View>
        <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff", marginBottom: 12, letterSpacing: 0.5 }}>HISTORIAL MENSUAL</Text>
        {["JUNIO 2024", "ENERO 2024"].map(month => {
          const monthPhotos = photos.filter(p => p.date.toUpperCase().includes(month.split(" ")[0]));
          if (!monthPhotos.length) return null;
          return (
            <View key={month} style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>📅 {month}</Text>
                <TouchableOpacity 
                  onPress={() => { setSelectedMonth(month); setManageModalOpen(true); }}
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>⚙️ GESTIONAR ({monthPhotos.length})</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {monthPhotos.map(p => (
                  <View key={p.id} style={{ width: 80, height: 80, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: COACH_BORDER }}>
                    <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} />
                  </View>
                ))}
              </ScrollView>
            </View>
          );
        })}
      </View>

      {/* Modal Manage Month */}
      <Modal visible={manageModalOpen} transparent animationType="slide" onRequestClose={() => setManageModalOpen(false)}>
        <BlurView intensity={60} tint="dark" style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setManageModalOpen(false)} />
          <View style={{ backgroundColor: COACH_BG, height: "80%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ ...athletic, fontSize: 24, color: "#fff" }}>{selectedMonth}</Text>
              <TouchableOpacity onPress={() => setManageModalOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                <XIcon size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleUploadPhoto} style={{ backgroundColor: COACH_ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginBottom: 24 }}>
              <Plus size={18} color="#000" strokeWidth={3} />
              <Text style={{ fontSize: 14, fontWeight: "900", color: "#000", letterSpacing: 0.5 }}>SUBIR NUEVA FOTO</Text>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                {photos.filter(p => selectedMonth && p.date.toUpperCase().includes(selectedMonth.split(" ")[0])).map(p => (
                  <View key={p.id} style={{ width: "48%", backgroundColor: "#1C1C1E", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COACH_BORDER }}>
                    <Image source={{ uri: p.url }} style={{ width: "100%", height: 160 }} />
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 11, color: COACH_MUTED, fontWeight: "800", marginBottom: 4 }}>{p.angle} · {p.weight}kg</Text>
                      <TouchableOpacity onPress={() => handleDeletePhoto(p.id)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                        <Trash2 size={12} color="#EF4444" />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#EF4444" }}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}
