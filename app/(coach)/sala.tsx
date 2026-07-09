import { View, Text, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback } from "react";
import { MessageSquareOff, Trash2 } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import {
  useCoach, fetchCoachRoomProfile, updateCoachRoomProfile, fetchCoachNotices, deleteCoachNotice, unlinkStudent,
  fetchTeamTelemetry, type CoachRoomProfile, type CoachNotice, type TeamTelemetry,
} from "@/lib/coach";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const AMBER  = "#f59e0b";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: on ? VOLT : "rgba(255, 255, 255, 0.06)", justifyContent: "center", padding: 2 }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? "#000" : "rgba(255,255,255,0.3)", marginLeft: on ? 20 : 0 }} />
    </Pressable>
  );
}

export default function SalaScreen() {
  const { token } = useAuth();
  const { students, isLoading, refresh } = useCoach();

  const [telemetry, setTelemetry] = useState<TeamTelemetry | null>(null);
  const [profile, setProfile] = useState<CoachRoomProfile | null>(null);
  const [notices, setNotices] = useState<CoachNotice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchTeamTelemetry(token).then(setTelemetry).catch(() => {});
    fetchCoachRoomProfile(token).then(setProfile).catch(() => {});
    setNoticesLoading(true);
    fetchCoachNotices(token).then(rows => setNotices(Array.isArray(rows) ? rows : [])).catch(() => setNotices([])).finally(() => setNoticesLoading(false));
  }, [token]);

  const togglePublic = useCallback(async () => {
    if (!token || !profile) return;
    const next = !profile.isPublic;
    setProfile(p => p ? { ...p, isPublic: next } : p);   // optimistic
    try {
      const updated = await updateCoachRoomProfile({ isPublic: next }, token);
      setProfile(updated);
    } catch {
      setProfile(p => p ? { ...p, isPublic: !next } : p);   // rollback
    }
  }, [token, profile]);

  const removeNotice = useCallback(async (id: string) => {
    if (!token) return;
    setNotices(prev => prev.filter(n => n.id !== id));
    try { await deleteCoachNotice(id, token); } catch {}
  }, [token]);

  const confirmUnlink = useCallback((studentId: string, name: string) => {
    Alert.alert(
      "Desvincular alumno",
      `¿Seguro que quieres desvincular a ${name} de tu sala? El historial del alumno se conserva; solo se rompe el vínculo con tu roster.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desvincular", style: "destructive",
          onPress: async () => { if (!token) return; try { await unlinkStudent(studentId, token); refresh(); } catch {} },
        },
      ],
    );
  }, [token, refresh]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <Text style={{ ...athletic, fontSize: 24, color: "#fff", paddingHorizontal: 20, paddingTop: 12, marginBottom: 16 }}>Sala</Text>

      {isLoading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {/* Telemetry grid */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            {[
              ["ADHERENCIA HOY", telemetry ? `${telemetry.streakPct}%` : "—", AMBER],
              ["ACTIVOS HOY", telemetry ? String(telemetry.activeToday) : "—", "#fff"],
              ["TOTAL ALUMNOS", telemetry ? String(telemetry.totalStudents) : String(students.length), "#fff"],
            ].map(([label, value, color]) => (
              <View key={label} style={{ ...GLASS, flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
                <Text className="font-black" style={{ fontSize: 20, color }}>{value}</Text>
                <Text className="font-mono" style={{ fontSize: 7.5, letterSpacing: 0.5, color: SILVER, marginTop: 4, textAlign: "center" }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Token de acceso */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", marginBottom: 14 }}>Token de Acceso</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: "#d4d4d8", flex: 1, paddingRight: 10 }}>Sala pública (visible en directorio)</Text>
              {profile && <Toggle on={profile.isPublic} onToggle={togglePublic} />}
            </View>
            <View style={{ backgroundColor: "#1C1C1E", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 8 }}>
              <Text className="font-black" style={{ fontSize: 18, letterSpacing: 3, color: VOLT }}>
                {profile?.joinCode ?? "—"}
              </Text>
            </View>
            <Text className="font-mono" style={{ fontSize: 9, color: SILVER, textAlign: "center" }}>
              Código activo: {profile?.joinCode ?? "—"}
            </Text>
          </View>

          {/* Tablón de avisos */}
          <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", marginBottom: 10 }}>
            Tablón de Avisos · {notices.length}
          </Text>
          {noticesLoading ? (
            <ActivityIndicator color={VOLT} style={{ marginBottom: 20 }} />
          ) : notices.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 14, paddingVertical: 30, alignItems: "center", marginBottom: 20 }}>
              <MessageSquareOff size={20} color={SILVER} strokeWidth={1.5} />
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: "#71717a", marginTop: 8 }}>
                No hay avisos en la sala
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: 20 }}>
              {notices.map(n => (
                <View key={n.id} style={{ ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>{n.senderName}</Text>
                    <Text style={{ fontSize: 12, color: "#d4d4d8", marginTop: 3, lineHeight: 16 }}>{n.content}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeNotice(n.id)} hitSlop={8}>
                    <Trash2 size={14} color="#f87171" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Roster del equipo */}
          <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", marginBottom: 10 }}>
            Roster del Equipo · {students.length}
          </Text>
          {students.map(s => (
            <View key={s.id} style={{ ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: s.avatarColor || "#40E0D0", alignItems: "center", justifyContent: "center" }}>
                <Text className="font-black" style={{ fontSize: 10, color: "#000" }}>
                  {s.avatarInitials || s.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text className="font-bold" style={{ fontSize: 12, color: "#fff" }} numberOfLines={1}>{s.name}</Text>
                <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 1 }}>{s.completionRate}% adherencia</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => confirmUnlink(s.id, s.name)}
                style={{ backgroundColor: "rgba(239,68,68,0.05)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
              >
                <Text className="font-black uppercase" style={{ fontSize: 9, letterSpacing: 0.5, color: "#f87171" }}>Desvincular</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
