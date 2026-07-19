import { View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MessageSquareOff, Trash2, Pin, Heart, Send, MessageCircle } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { triggerImpact, triggerSuccess } from "@/lib/haptics";
import { ChatThreadModal, type ChatMessage } from "@/components/social/ChatThreadModal";
import {
  useCoach, fetchCoachRoomProfile, updateCoachRoomProfile, fetchCoachNotices, deleteCoachNotice,
  postGroupMessage, unlinkStudent, fetchTeamTelemetry,
  type CoachRoomProfile, type CoachNotice, type TeamTelemetry,
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

const PINNED_NOTICES_KEY = "mc:coach_pinned_notices";
const NOTICE_LIKES_KEY   = "mc:coach_notice_likes";
const DM_THREAD_KEY_PREFIX = "mc:coach_dm_thread:";

type PanelTab = "FEED" | "MENSAJES";

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
  const { token, user } = useAuth();
  const { students, isLoading, refresh } = useCoach();

  const [tab, setTab] = useState<PanelTab>("FEED");
  const [telemetry, setTelemetry] = useState<TeamTelemetry | null>(null);
  const [profile, setProfile] = useState<CoachRoomProfile | null>(null);
  const [notices, setNotices] = useState<CoachNotice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [composerText, setComposerText] = useState("");
  const [posting, setPosting] = useState(false);

  // ── Fijado y likes — GroupMessage no tiene esos campos en el backend
  // (schema real: id/coachId/senderId/senderName/role/content/imageUrl/
  // createdAt), así que son estado local persistido en AsyncStorage, no un
  // "me gusta" real compartido entre dispositivos. Borrar sí es real
  // (DELETE /api/coach/notices/[id], ya existía). ─────────────────────────
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>({});

  const ownCoachId = students[0]?.coachId;

  useEffect(() => {
    if (!token) return;
    fetchTeamTelemetry(token).then(setTelemetry).catch(() => {});
    fetchCoachRoomProfile(token).then(setProfile).catch(() => {});
    setNoticesLoading(true);
    fetchCoachNotices(token).then(rows => setNotices(Array.isArray(rows) ? rows : [])).catch(() => setNotices([])).finally(() => setNoticesLoading(false));
  }, [token]);

  useEffect(() => {
    AsyncStorage.getItem(PINNED_NOTICES_KEY).then(raw => { if (raw) setPinnedIds(new Set(JSON.parse(raw))); }).catch(() => {});
    AsyncStorage.getItem(NOTICE_LIKES_KEY).then(raw => { if (raw) setLikes(JSON.parse(raw)); }).catch(() => {});
  }, []);

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

  const postAnnouncement = useCallback(async () => {
    if (!token || !ownCoachId || !composerText.trim()) return;
    triggerImpact();
    setPosting(true);
    try {
      const created = await postGroupMessage(ownCoachId, composerText.trim(), user?.name || "Coach", token);
      setNotices(prev => [{ id: created.id, senderName: user?.name || "Coach", content: composerText.trim(), createdAt: new Date().toISOString() }, ...prev]);
      setComposerText("");
      triggerSuccess();
    } catch (e) {
      console.error("[SalaScreen] postGroupMessage failed:", e);
      Alert.alert("No se pudo publicar", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setPosting(false);
    }
  }, [token, ownCoachId, composerText, user?.name]);

  const removeNotice = useCallback((id: string) => {
    Alert.alert("Borrar aviso", "¿Seguro que quieres borrar este comunicado de la sala?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar", style: "destructive",
        onPress: async () => {
          if (!token) return;
          setNotices(prev => prev.filter(n => n.id !== id));
          try { await deleteCoachNotice(id, token); } catch {}
        },
      },
    ]);
  }, [token]);

  const togglePin = useCallback((id: string) => {
    triggerImpact();
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      AsyncStorage.setItem(PINNED_NOTICES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const toggleLike = useCallback((id: string) => {
    triggerImpact();
    setLikes(prev => {
      const cur = prev[id] ?? { liked: false, count: 0 };
      const next = { ...prev, [id]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
      AsyncStorage.setItem(NOTICE_LIKES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

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

  // ── DMs HUB — sin modelo de Conversation/DirectMessage en el backend (ver
  // schema real: solo existe GroupMessage). Simulado con contactos reales
  // del roster (nombres/avatares reales) y un hilo local persistido por
  // alumno — nunca llega al otro dispositivo, es la vista local del coach. ─
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});

  const openThread = useCallback((studentId: string) => {
    triggerImpact();
    setActiveThreadId(studentId);
    if (threads[studentId]) return;
    AsyncStorage.getItem(DM_THREAD_KEY_PREFIX + studentId)
      .then(raw => { if (raw) setThreads(prev => ({ ...prev, [studentId]: JSON.parse(raw) })); })
      .catch(() => {});
  }, [threads]);

  const sendDM = useCallback((text: string) => {
    if (!activeThreadId) return;
    const msg: ChatMessage = { id: `${Date.now()}`, senderName: user?.name || "Coach", text, mine: true, createdAt: new Date().toISOString() };
    setThreads(prev => {
      const next = { ...prev, [activeThreadId]: [...(prev[activeThreadId] ?? []), msg] };
      AsyncStorage.setItem(DM_THREAD_KEY_PREFIX + activeThreadId, JSON.stringify(next[activeThreadId])).catch(() => {});
      return next;
    });
  }, [activeThreadId, user?.name]);

  const activeStudent = useMemo(() => students.find(s => s.id === activeThreadId), [students, activeThreadId]);

  const sortedNotices = useMemo(
    () => [...notices].sort((a, b) => (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0)),
    [notices, pinnedIds],
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <Text style={{ ...athletic, fontSize: 24, color: "#fff", paddingHorizontal: 20, paddingTop: 12, marginBottom: 12 }}>Sala</Text>

      {/* Selector FEED / MENSAJES */}
      <View style={{ flexDirection: "row", marginHorizontal: 20, backgroundColor: "#0F0F10", borderRadius: 12, padding: 3, marginBottom: 16, borderWidth: 1, borderColor: "#2C2C2E" }}>
        {(["FEED", "MENSAJES"] as const).map(t => (
          <Pressable
            key={t}
            onPress={() => { triggerImpact(); setTab(t); }}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: tab === t ? VOLT : "transparent" }}
          >
            <Text className="font-black" style={{ fontSize: 11, color: tab === t ? "#000" : SILVER }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
      ) : tab === "FEED" ? (
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

          {/* Composer — comunicado oficial real, POST /api/community/messages */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 14, marginBottom: 20 }}>
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder="Redacta un comunicado para tu equipo..."
              placeholderTextColor="#52525b"
              multiline
              style={{ color: "#fff", fontSize: 13, minHeight: 40, textAlignVertical: "top" }}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!composerText.trim() || posting || !ownCoachId}
              onPress={postAnnouncement}
              style={{
                marginTop: 10, alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: composerText.trim() ? VOLT : "rgba(255,255,255,0.08)",
                borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
              }}
            >
              {posting
                ? <ActivityIndicator size="small" color="#000" />
                : (
                  <>
                    <Send size={13} color={composerText.trim() ? "#000" : SILVER} />
                    <Text className="font-black" style={{ fontSize: 11, color: composerText.trim() ? "#000" : SILVER }}>PUBLICAR</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>

          {/* Tablón de avisos — fijados primero, con contorno neón */}
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
              {sortedNotices.map(n => {
                const pinned = pinnedIds.has(n.id);
                const like = likes[n.id] ?? { liked: false, count: 0 };
                return (
                  <View
                    key={n.id}
                    style={{
                      ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8,
                      borderColor: pinned ? "rgba(204,255,0,0.5)" : GLASS.borderColor,
                      borderWidth: pinned ? 1.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text className="font-bold" style={{ fontSize: 11, color: VOLT }}>{n.senderName}</Text>
                          {pinned && <Pin size={10} color={VOLT} fill={VOLT} />}
                        </View>
                        <Text style={{ fontSize: 12, color: "#d4d4d8", marginTop: 3, lineHeight: 16 }}>{n.content}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeNotice(n.id)} hitSlop={8}>
                        <Trash2 size={14} color="#f87171" />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 10 }}>
                      <Pressable onPress={() => toggleLike(n.id)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Heart size={13} color={like.liked ? VOLT : SILVER} fill={like.liked ? VOLT : "transparent"} />
                        <Text className="font-bold" style={{ fontSize: 10, color: like.liked ? VOLT : SILVER }}>{like.count}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => togglePin(n.id)}
                        hitSlop={8}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                      >
                        <Pin size={13} color={pinned ? VOLT : SILVER} fill={pinned ? VOLT : "transparent"} />
                        <Text className="font-bold" style={{ fontSize: 10, color: pinned ? VOLT : SILVER }}>
                          {pinned ? "Fijado" : "Fijar"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
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
      ) : (
        // ── MENSAJES — bandeja de DMs, ordenada por interacción reciente
        // (último mensaje local, o el orden del roster si nunca se abrió). ──
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {students.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 14, paddingVertical: 30, alignItems: "center" }}>
              <MessageCircle size={20} color={SILVER} strokeWidth={1.5} />
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: "#71717a", marginTop: 8 }}>
                Sin alumnos vinculados todavía
              </Text>
            </View>
          ) : (
            students.map(s => {
              const thread = threads[s.id] ?? [];
              const last = thread[thread.length - 1];
              const unread = thread.length > 0 && !last?.mine;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => openThread(s.id)}
                  style={{ ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: s.avatarColor || "#40E0D0", alignItems: "center", justifyContent: "center" }}>
                    <Text className="font-black" style={{ fontSize: 11, color: "#000" }}>
                      {s.avatarInitials || s.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="font-bold" style={{ fontSize: 12, color: "#fff" }} numberOfLines={1}>{s.name}</Text>
                    <Text className="font-mono" style={{ fontSize: 10, color: SILVER, marginTop: 1 }} numberOfLines={1}>
                      {last ? last.text : "Toca para iniciar la conversación"}
                    </Text>
                  </View>
                  {unread && (
                    <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: VOLT, shadowColor: VOLT, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} />
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      <ChatThreadModal
        visible={!!activeThreadId}
        onClose={() => setActiveThreadId(null)}
        title={activeStudent?.name ?? "Alumno"}
        subtitle="Mensaje directo · solo en este dispositivo"
        messages={activeThreadId ? threads[activeThreadId] ?? [] : []}
        onSend={sendDM}
        avatarColor={activeStudent?.avatarColor || VOLT}
      />
    </SafeAreaView>
  );
}
