import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, Pressable, Image, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Camera, X as XIcon, Trash2, Plus, UploadCloud } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { COACH_CARD, COACH_BORDER, COACH_MUTED, COACH_ACCENT, COACH_BG } from "@/app/(coach)/_layout";

const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };
const CARD = { backgroundColor: COACH_CARD, borderWidth: 1, borderColor: COACH_BORDER } as const;

export type Angle = "FRENTE" | "PERFIL" | "ESPALDA";

export interface GalleryPhoto {
  id: string;
  url: string;
  label: string;
  weight: number | null;
  createdAt: string; // ISO date string
}

interface ProgressGalleryProps {
  photos?: GalleryPhoto[];
  onUploadPhoto?: (uri: string, angle: string, weight: number) => Promise<void>;
  onEditPhoto?: (id: string, updates: { label?: string; weight?: number; createdAt?: string }) => Promise<void>;
  onDeletePhoto?: (id: string) => Promise<void>;
  isLoading?: boolean;
}

function formatMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" }).toUpperCase();
}

function formatDate(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProgressGallery({
  photos = [],
  onUploadPhoto,
  onEditPhoto,
  onDeletePhoto,
  isLoading = false
}: ProgressGalleryProps) {
  const [localPhotos, setLocalPhotos] = useState<GalleryPhoto[]>(photos);
  const [angle, setAngle] = useState<Angle>("FRENTE");
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Upload State inside the modal
  const [uploadUri, setUploadUri] = useState<string | null>(null);
  const [uploadAngle, setUploadAngle] = useState<Angle>("FRENTE");
  const [uploadWeight, setUploadWeight] = useState<string>("");

  // Edit State
  const [editingPhoto, setEditingPhoto] = useState<GalleryPhoto | null>(null);
  const [editAngle, setEditAngle] = useState<Angle>("FRENTE");
  const [editWeight, setEditWeight] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");

  useEffect(() => {
    setLocalPhotos(photos);
  }, [photos]);

  const filteredPhotos = localPhotos
    .filter(p => p.label.toUpperCase() === angle)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  const initialPhoto = filteredPhotos[0];
  const currentPhoto = filteredPhotos[filteredPhotos.length - 1];

  const byMonth = new Map<string, GalleryPhoto[]>();
  for (const p of localPhotos) {
    const key = p.createdAt.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(p);
  }
  const monthKeys = [...byMonth.keys()].sort().reverse();

  const handlePickPhoto = async () => {
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
      setUploadUri(result.assets[0].uri);
      setUploadAngle("FRENTE");
      setUploadWeight("");
    }
  };

  const submitUpload = async () => {
    if (!onUploadPhoto) return;
    const w = parseFloat(uploadWeight);
    if (isNaN(w) || w <= 0) {
      Alert.alert("Peso inválido", "Por favor ingresa un peso válido en kg.");
      return;
    }
    await onUploadPhoto(uploadUri!, uploadAngle, w);
    setUploadUri(null);
  };

  const handleDeletePhoto = (id: string) => {
    Alert.alert("Eliminar foto", "¿Estás seguro de que deseas eliminar esta foto de progreso?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          if (!onDeletePhoto) return;
          setLocalPhotos(prev => prev.filter(p => p.id !== id));
          try {
            await onDeletePhoto(id);
          } catch {
            setLocalPhotos(photos); // rollback
          }
          setEditingPhoto(null);
      } }
    ]);
  };

  const handleOpenEdit = (p: GalleryPhoto) => {
    setEditingPhoto(p);
    setEditAngle(p.label.toUpperCase() as Angle);
    setEditWeight(p.weight !== null ? String(p.weight) : "");
    // Just keeping the original date string for simple string edit (could be a date picker)
    setEditDate(p.createdAt.split("T")[0] || p.createdAt);
  };

  const submitEdit = async () => {
    if (!onEditPhoto || !editingPhoto) return;
    const w = editWeight ? parseFloat(editWeight) : undefined;
    if (w !== undefined && (isNaN(w) || w <= 0)) {
      Alert.alert("Peso inválido", "Por favor ingresa un peso válido en kg.");
      return;
    }
    await onEditPhoto(editingPhoto.id, {
      label: editAngle,
      weight: w,
      createdAt: editDate ? new Date(editDate).toISOString() : undefined,
    });
    setEditingPhoto(null);
  };

  const selectedMonthPhotos = selectedMonthKey ? (byMonth.get(selectedMonthKey) || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

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
                  <Text style={{ fontSize: 12, color: "#fff", fontWeight: "800" }}>{formatDate(initialPhoto.createdAt)} · {initialPhoto.weight}kg</Text>
                </View>
              </>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={COACH_MUTED} style={{ opacity: 0.5 }} />
                <Text style={{ fontSize: 10, color: COACH_MUTED, marginTop: 8 }}>Sube tu 1ra foto</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, backgroundColor: "#0F0F10", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COACH_ACCENT }}>
            {currentPhoto && currentPhoto !== initialPhoto ? (
              <>
                <Image source={{ uri: currentPhoto.url }} style={{ width: "100%", height: "100%" }} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: "rgba(0,0,0,0.75)" }}>
                  <Text style={{ fontSize: 10, color: COACH_ACCENT, fontWeight: "600" }}>ACTUAL</Text>
                  <Text style={{ fontSize: 12, color: "#fff", fontWeight: "800" }}>{formatDate(currentPhoto.createdAt)} · {currentPhoto.weight}kg</Text>
                </View>
              </>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={COACH_MUTED} style={{ opacity: 0.5 }} />
                <Text style={{ fontSize: 10, color: COACH_MUTED, marginTop: 8 }}>Sube una nueva foto</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* History by Month */}
      <View>
        <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff", marginBottom: 12, letterSpacing: 0.5 }}>HISTORIAL MENSUAL</Text>
        {monthKeys.length === 0 ? (
          <View style={{ ...CARD, borderRadius: 16, padding: 24, alignItems: "center" }}>
             <Text style={{ fontSize: 13, color: COACH_MUTED }}>No hay fotos registradas aún.</Text>
          </View>
        ) : (
          monthKeys.map(key => {
            const mPhotos = byMonth.get(key)!;
            const label = formatMonthKey(key);
            return (
              <View key={key} style={{ ...CARD, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>📅 {label}</Text>
                  <TouchableOpacity 
                    onPress={() => { setSelectedMonthKey(key); setManageModalOpen(true); }}
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>⚙️ GESTIONAR ({mPhotos.length})</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {mPhotos.map(p => (
                    <View key={p.id} style={{ width: 80, height: 80, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: COACH_BORDER }}>
                      <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} />
                      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.6)", paddingVertical: 2 }}>
                        <Text style={{ fontSize: 8, color: "#fff", textAlign: "center", fontWeight: "700" }}>{p.label}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            );
          })
        )}
      </View>

      {/* Modal Manage Month */}
      <Modal visible={manageModalOpen} transparent animationType="slide" onRequestClose={() => setManageModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <BlurView intensity={60} tint="dark" style={{ flex: 1, justifyContent: "flex-end" }}>
            <Pressable style={{ flex: 1 }} onPress={() => setManageModalOpen(false)} />
            <View style={{ backgroundColor: COACH_BG, height: "85%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
              
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ ...athletic, fontSize: 24, color: "#fff" }}>
                  {editingPhoto ? "EDITAR FOTO" : uploadUri ? "NUEVA FOTO" : (selectedMonthKey ? formatMonthKey(selectedMonthKey) : "")}
                </Text>
                <TouchableOpacity onPress={() => { setManageModalOpen(false); setUploadUri(null); setEditingPhoto(null); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <XIcon size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              {uploadUri ? (
                // Upload Form
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: "#fff", fontWeight: "600", marginBottom: 16 }}>Detalles de la nueva foto</Text>
                  
                  <View style={{ alignItems: "center", marginBottom: 24 }}>
                    <Image source={{ uri: uploadUri }} style={{ width: 140, height: 140, borderRadius: 16, borderWidth: 2, borderColor: COACH_ACCENT }} />
                  </View>

                  <Text style={{ fontSize: 12, color: COACH_MUTED, fontWeight: "700", marginBottom: 8, marginLeft: 4 }}>ÁNGULO</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
                    {(["FRENTE", "PERFIL", "ESPALDA"] as Angle[]).map(a => (
                      <TouchableOpacity 
                        key={a} 
                        onPress={() => setUploadAngle(a)}
                        style={{ 
                          flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12,
                          backgroundColor: uploadAngle === a ? "rgba(204,255,0,0.15)" : "#1C1C1E",
                          borderWidth: 1, borderColor: uploadAngle === a ? COACH_ACCENT : COACH_BORDER,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: uploadAngle === a ? COACH_ACCENT : COACH_MUTED, letterSpacing: 0.5 }}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={{ fontSize: 12, color: COACH_MUTED, fontWeight: "700", marginBottom: 8, marginLeft: 4 }}>PESO ACTUAL (KG)</Text>
                  <TextInput
                    value={uploadWeight}
                    onChangeText={setUploadWeight}
                    keyboardType="numeric"
                    placeholder="Ej. 75.5"
                    placeholderTextColor="#555"
                    style={{ backgroundColor: "#1C1C1E", color: "#fff", fontSize: 18, fontWeight: "800", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COACH_BORDER, marginBottom: 32 }}
                  />

                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <TouchableOpacity onPress={() => setUploadUri(null)} style={{ flex: 1, padding: 16, borderRadius: 16, backgroundColor: "#1C1C1E", alignItems: "center", borderWidth: 1, borderColor: COACH_BORDER }}>
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>CANCELAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={submitUpload} disabled={isLoading} style={{ flex: 2, padding: 16, borderRadius: 16, backgroundColor: COACH_ACCENT, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                      {isLoading ? <ActivityIndicator color="#000" /> : (
                        <>
                          <UploadCloud size={20} color="#000" />
                          <Text style={{ color: "#000", fontWeight: "900", fontSize: 14 }}>GUARDAR FOTO</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : !editingPhoto ? (
                // Grid View
                <>
                  {onUploadPhoto && (
                    <TouchableOpacity onPress={handlePickPhoto} style={{ backgroundColor: COACH_ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginBottom: 24 }}>
                      <Plus size={18} color="#000" strokeWidth={3} />
                      <Text style={{ fontSize: 14, fontWeight: "900", color: "#000", letterSpacing: 0.5 }}>SUBIR FOTO A ESTE MES</Text>
                    </TouchableOpacity>
                  )}

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                      {selectedMonthPhotos.map(p => (
                        <View key={p.id} style={{ width: "48%", backgroundColor: "#1C1C1E", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COACH_BORDER }}>
                          <Image source={{ uri: p.url }} style={{ width: "100%", height: 160 }} />
                          <View style={{ padding: 10 }}>
                            <Text style={{ fontSize: 11, color: COACH_MUTED, fontWeight: "800", marginBottom: 4 }}>{p.label} · {p.weight ?? "--"}kg</Text>
                            <Text style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>{formatDate(p.createdAt)}</Text>
                            
                            <TouchableOpacity onPress={() => handleOpenEdit(p)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: "800", color: COACH_ACCENT }}>✏️ Editar Datos</Text>
                            </TouchableOpacity>
                            {onDeletePhoto && (
                              <TouchableOpacity onPress={() => handleDeletePhoto(p.id)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Trash2 size={12} color="#EF4444" />
                                <Text style={{ fontSize: 11, fontWeight: "600", color: "#EF4444" }}>Eliminar</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                    <View style={{ height: 40 }} />
                  </ScrollView>
                </>
              ) : (
                // Edit Form
                <View style={{ flex: 1 }}>
                  <View style={{ alignItems: "center", marginBottom: 24 }}>
                    <Image source={{ uri: editingPhoto.url }} style={{ width: 140, height: 140, borderRadius: 16, borderWidth: 1, borderColor: COACH_BORDER }} />
                  </View>

                  <Text style={{ fontSize: 12, color: COACH_MUTED, fontWeight: "700", marginBottom: 8, marginLeft: 4 }}>ÁNGULO</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                    {(["FRENTE", "PERFIL", "ESPALDA"] as Angle[]).map(a => (
                      <TouchableOpacity 
                        key={a} 
                        onPress={() => setEditAngle(a)}
                        style={{ 
                          flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12,
                          backgroundColor: editAngle === a ? "rgba(204,255,0,0.15)" : "#1C1C1E",
                          borderWidth: 1, borderColor: editAngle === a ? COACH_ACCENT : COACH_BORDER,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: editAngle === a ? COACH_ACCENT : COACH_MUTED, letterSpacing: 0.5 }}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: COACH_MUTED, fontWeight: "700", marginBottom: 8, marginLeft: 4 }}>PESO (KG)</Text>
                      <TextInput
                        value={editWeight}
                        onChangeText={setEditWeight}
                        keyboardType="numeric"
                        placeholder="Ej. 75.5"
                        placeholderTextColor="#555"
                        style={{ backgroundColor: "#1C1C1E", color: "#fff", fontSize: 16, fontWeight: "800", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COACH_BORDER }}
                      />
                    </View>
                    <View style={{ flex: 1.5 }}>
                      <Text style={{ fontSize: 12, color: COACH_MUTED, fontWeight: "700", marginBottom: 8, marginLeft: 4 }}>FECHA (YYYY-MM-DD)</Text>
                      <TextInput
                        value={editDate}
                        onChangeText={setEditDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#555"
                        style={{ backgroundColor: "#1C1C1E", color: "#fff", fontSize: 16, fontWeight: "800", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COACH_BORDER }}
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                    <TouchableOpacity onPress={() => setEditingPhoto(null)} style={{ flex: 1, padding: 16, borderRadius: 16, backgroundColor: "#1C1C1E", alignItems: "center", borderWidth: 1, borderColor: COACH_BORDER }}>
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>CANCELAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={submitEdit} disabled={isLoading} style={{ flex: 2, padding: 16, borderRadius: 16, backgroundColor: COACH_ACCENT, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                      {isLoading ? <ActivityIndicator color="#000" /> : <Text style={{ color: "#000", fontWeight: "900", fontSize: 14 }}>GUARDAR CAMBIOS</Text>}
                    </TouchableOpacity>
                  </View>

                  {onDeletePhoto && (
                    <TouchableOpacity onPress={() => handleDeletePhoto(editingPhoto.id)} style={{ padding: 16, borderRadius: 16, backgroundColor: "rgba(239,68,68,0.1)", alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}>
                      <Text style={{ color: "#EF4444", fontWeight: "800", fontSize: 14 }}>🗑️ ELIMINAR FOTO</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
