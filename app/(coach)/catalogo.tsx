import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform, Image, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import { router } from "expo-router";
import { ChevronLeft, Plus, Search, Trash2, Play, X } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import {
  fetchEjercicios, createEjercicio, deleteEjercicio, MUSCLE_GROUPS,
  type EjercicioDTO, type Equipment,
} from "@/lib/coach";

// Fondo negro absoluto, tarjetas #1C1C1E (paleta pedida para esta pantalla —
// distinta de COACH_CARD #0F0F10 usado en el resto del panel del coach),
// acento verde neón.
const BG      = "#000000";
const CARD_BG = "#1C1C1E";
const BORDER  = "#2C2C2E";
const VOLT    = "#CCFF00";
const MUTED   = "#8E8E93";
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const FIELD = {
  backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13,
} as const;

const EQUIPMENT_OPTIONS: Equipment[] = ["Barra", "Mancuerna", "Polea", "Peso corporal", "Máquina", "Banda"];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
        backgroundColor: active ? VOLT : CARD_BG, borderWidth: 1, borderColor: active ? VOLT : BORDER,
      }}
    >
      <Text className="font-bold" style={{ fontSize: 11, color: active ? "#000" : "#d4d4d8" }}>{label}</Text>
    </Pressable>
  );
}

function NewExerciseModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: (e: EjercicioDTO) => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = useState<Equipment>("Barra");
  const [bodyweight, setBodyweight] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName(""); setMuscleGroup(MUSCLE_GROUPS[0]); setEquipment("Barra");
    setBodyweight(false); setVideoUrl(""); setImageUrl(""); setError(null);
  }, []);

  const canSave = name.trim().length > 0;

  const save = useCallback(async () => {
    if (!canSave || !token) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createEjercicio(
        {
          name: name.trim(),
          muscleGroup,
          // El backend fuerza equipment a "Peso corporal" cuando bodyweight
          // es true (../mycouch/src/app/api/ejercicios/route.ts) — se
          // refleja aquí también para que la UI no muestre un valor que el
          // servidor va a pisar.
          equipment: bodyweight ? "Peso corporal" : equipment,
          bodyweight,
          videoUrl: videoUrl.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
        },
        token,
      );
      onCreated(created);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el ejercicio.");
    } finally {
      setSaving(false);
    }
  }, [canSave, token, name, muscleGroup, equipment, bodyweight, videoUrl, imageUrl, onCreated, onClose, reset]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>Nuevo ejercicio</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}><X size={20} color={MUTED} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                value={name} onChangeText={setName} placeholder="Nombre (ej. Press militar)" placeholderTextColor="#52525b"
                style={{ ...FIELD, marginBottom: 14 }}
              />

              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 8 }}>Grupo muscular</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {MUSCLE_GROUPS.map(g => (
                  <Chip key={g} label={g} active={muscleGroup === g} onPress={() => setMuscleGroup(g)} />
                ))}
              </View>

              <Pressable
                onPress={() => setBodyweight(b => !b)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
                  borderColor: bodyweight ? VOLT : BORDER, backgroundColor: bodyweight ? VOLT : "transparent",
                }} />
                <Text style={{ fontSize: 12, color: "#d4d4d8" }}>Es ejercicio de peso corporal</Text>
              </Pressable>

              {!bodyweight && (
                <>
                  <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 8 }}>Equipo</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    {EQUIPMENT_OPTIONS.map(eq => (
                      <Chip key={eq} label={eq} active={equipment === eq} onPress={() => setEquipment(eq)} />
                    ))}
                  </View>
                </>
              )}

              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 6 }}>URL del video demostrativo</Text>
              <TextInput
                value={videoUrl} onChangeText={setVideoUrl} placeholder="https://..." placeholderTextColor="#52525b"
                autoCapitalize="none" keyboardType="url"
                style={{ ...FIELD, marginBottom: 14 }}
              />

              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: MUTED, marginBottom: 6 }}>URL de foto técnica</Text>
              <TextInput
                value={imageUrl} onChangeText={setImageUrl} placeholder="https://..." placeholderTextColor="#52525b"
                autoCapitalize="none" keyboardType="url"
                style={{ ...FIELD, marginBottom: 10 }}
              />
              {!!imageUrl.trim() && (
                <Image
                  source={{ uri: imageUrl.trim() }}
                  style={{ width: "100%", height: 140, borderRadius: 12, backgroundColor: CARD_BG, marginBottom: 14 }}
                  resizeMode="cover"
                />
              )}

              {error && <Text style={{ color: "#f87171", fontSize: 11, marginBottom: 10, textAlign: "center" }}>{error}</Text>}

              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!canSave || saving}
                onPress={save}
                style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: VOLT, opacity: !canSave || saving ? 0.4 : 1 }}
              >
                {saving ? <ActivityIndicator color="#000" /> : <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>Guardar ejercicio</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ExerciseRow({ ej, onDelete }: { ej: EjercicioDTO; onDelete: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      {ej.imageUrl ? (
        <Image source={{ uri: ej.imageUrl }} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "#000" }} resizeMode="cover" />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16 }}>🏋️</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }} numberOfLines={1}>{ej.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text className="font-mono" style={{ fontSize: 10, color: MUTED }}>{ej.equipment}</Text>
          {!!ej.videoUrl && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Play size={9} color={VOLT} fill={VOLT} />
              <Text style={{ fontSize: 9, color: VOLT }}>video</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={10}>
        <Trash2 size={16} color="#f87171" />
      </TouchableOpacity>
    </View>
  );
}

export default function CatalogoScreen() {
  const { token } = useAuth();
  const [ejercicios, setEjercicios] = useState<EjercicioDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("Todos");
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetchEjercicios(token)
      .then(rows => setEjercicios(Array.isArray(rows) ? rows : []))
      .catch(() => setEjercicios([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ejercicios.filter(e =>
      (group === "Todos" || e.muscleGroup === group) &&
      (q === "" || e.name.toLowerCase().includes(q)),
    );
  }, [ejercicios, query, group]);

  // Agrupado por grupo muscular cuando el filtro es "Todos" — cada sección
  // solo aparece si tiene al menos un ejercicio que calce la búsqueda.
  const sections = useMemo(() => {
    if (group !== "Todos") return [{ title: group, rows: filtered }];
    return MUSCLE_GROUPS
      .map(g => ({ title: g, rows: filtered.filter(e => e.muscleGroup === g) }))
      .filter(s => s.rows.length > 0);
  }, [filtered, group]);

  const remove = useCallback((ej: EjercicioDTO) => {
    Alert.alert(
      "Eliminar ejercicio",
      `¿Seguro que quieres eliminar "${ej.name}" del catálogo? Las rutinas que ya lo tienen asignado conservan su nombre/multimedia, solo deja de estar disponible para nuevas asignaciones.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar", style: "destructive",
          onPress: async () => {
            if (!token) return;
            setEjercicios(prev => prev.filter(e => e.id !== ej.id));   // optimistic
            try {
              await deleteEjercicio(ej.id, token);
            } catch {
              load();   // rollback via refetch
            }
          },
        },
      ],
    );
  }, [token, load]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
        <Text style={{ ...athletic, fontSize: 16, color: "#fff" }}>Catálogo de ejercicios</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setFormOpen(true)}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: VOLT, alignItems: "center", justifyContent: "center" }}
        >
          <Plus size={16} color="#000" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, ...FIELD, paddingVertical: 8 }}>
          <Search size={14} color={MUTED} />
          <TextInput
            value={query} onChangeText={setQuery} placeholder="Buscar ejercicio..." placeholderTextColor="#52525b"
            style={{ flex: 1, color: "#fff", fontSize: 13 }}
          />
        </View>
      </View>

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 12 }}
        style={{ flexGrow: 0 }}
      >
        {["Todos", ...MUSCLE_GROUPS].map(g => (
          <Chip key={g} label={g} active={group === g} onPress={() => setGroup(g)} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
      ) : sections.length === 0 ? (
        <View style={{ paddingHorizontal: 20, marginTop: 30, alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: MUTED, textAlign: "center" }}>
            {ejercicios.length === 0 ? "Tu catálogo está vacío. Añade tu primer ejercicio." : "Sin resultados para este filtro."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {sections.map(section => (
            <View key={section.title} style={{ marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: MUTED, textTransform: "uppercase", marginBottom: 10 }}>
                {section.title} ({section.rows.length})
              </Text>
              {section.rows.map(ej => (
                <ExerciseRow key={ej.id} ej={ej} onDelete={() => remove(ej)} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <NewExerciseModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={created => setEjercicios(prev => [...prev, created])}
      />
    </SafeAreaView>
  );
}
