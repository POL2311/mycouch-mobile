import {
  View, Text, TextInput, TouchableOpacity, Pressable, FlatList, Modal, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync } from "expo-audio";
import {
  ChevronLeft, Send, Mic, Camera as CameraIcon, BarChart3, Zap, Play, Pause, Square, Award,
} from "lucide-react-native";
import { usePortal } from "@/lib/portal";
import { triggerImpact, triggerSuccess, triggerWarning } from "@/lib/haptics";
import { useGamification } from "@/lib/gamification";
import { tacticalSubHeader } from "@/lib/typography";
import { SALA_ROSTER, rosterBadgeStyle, AvatarRing, type RosterMember } from "./index";

// ── SALA CORE // CHAT GLOBAL (Módulo 2) — ahora una pantalla propia, nested
// bajo "salas" (ver salas/_layout.tsx) para poder ocultar el dock igual que
// exercise/[id]. Persistencia AsyncStorage bajo la MISMA clave que usaba el
// tab embebido anterior, para no perder el historial ya guardado en
// dispositivo. Sin backend de mensajería real (mycouch solo tiene
// GroupMessage coach-write-only) — client-simulated, mismo alcance que el
// resto de Salas. El XP que otorga SÍ es real (useGamification().addXP). ──
const VOLT   = "#CCFF00";
const CYAN   = "#00F0FF";
const OLED   = "#070708";
const SILVER = "#8e8e93";
const GLASS  = { backgroundColor: "rgba(28, 28, 30, 0.4)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)" } as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

const STORAGE_KEY = "mc:room_group_chat";

interface SharedStats { kind: "pr" | "rank"; label: string; value: string; sub: string }
interface Challenge { id: string; topic: string; accepted: boolean; opponentName: string | null }

interface ChatMsg {
  id: string;
  senderName: string;
  text: string;
  mine: boolean;
  createdAt: string;
  imageUri?: string;
  audioUri?: string;
  sharedStats?: SharedStats;
  challenge?: Challenge;
}

// Seed inicial (blueprint §1.8, mismo patrón de SALA_ACTIVITY_FEED) — solo
// para que el Challenge Engine sea demostrable de inmediato: un mensaje de
// texto y un reto activo de un rival ya seedeado en SALA_ROSTER.
function seedMessages(): ChatMsg[] {
  return [
    {
      id: "seed-1", senderName: "MARCUS_ELITE", mine: false, createdAt: new Date(Date.now() - 3600_000).toISOString(),
      text: "Equipo, hoy toca superar el volumen de la semana pasada. Vamos con todo 🔥",
    },
    {
      id: "seed-2", senderName: "COACH_FELLS", mine: false, createdAt: new Date(Date.now() - 1800_000).toISOString(),
      text: "Lancé un reto para hoy.",
      challenge: { id: "seed-challenge-1", topic: "¿Quién iguala mi set de Press Banca de hoy?", accepted: false, opponentName: "COACH_FELLS" },
    },
  ];
}

function findRosterMember(senderName: string): RosterMember | undefined {
  return SALA_ROSTER.find(m => m.name === senderName);
}

// Extrae el valor real relevante (PR) del alumno según el texto del reto —
// nunca inventa datos si el tema no matchea ninguna métrica conocida.
function myValueForTopic(topic: string, student: { prBench: number; prSquat: number; prDeadlift: number } | null): { label: string; value: string } {
  const t = topic.toLowerCase();
  if (t.includes("banca") || t.includes("bench")) return { label: "MI PRESS BANCA", value: `${student?.prBench ?? 0} KG` };
  if (t.includes("sentadilla") || t.includes("squat")) return { label: "MI SENTADILLA", value: `${student?.prSquat ?? 0} KG` };
  if (t.includes("peso muerto") || t.includes("deadlift")) return { label: "MI PESO MUERTO", value: `${student?.prDeadlift ?? 0} KG` };
  return { label: "MI ESTADO", value: "LISTO PARA COMPETIR" };
}
function opponentValueForTopic(topic: string, opponent: RosterMember | undefined): { label: string; value: string } {
  const t = topic.toLowerCase();
  if (!opponent) return { label: "RIVAL", value: "—" };
  if (t.includes("banca") || t.includes("bench")) return { label: `${opponent.name} · PRESS BANCA`, value: `${opponent.prs.benchPress} KG` };
  if (t.includes("sentadilla") || t.includes("squat")) return { label: `${opponent.name} · SENTADILLA`, value: `${opponent.prs.maxSquat} KG` };
  if (t.includes("peso muerto") || t.includes("deadlift")) return { label: `${opponent.name} · PESO MUERTO`, value: `${opponent.prs.maxDeadlift} KG` };
  return { label: `${opponent.name} · ESTADO`, value: "EN COMBATE" };
}

function SenderBadge({ senderName, mine, currentRank }: { senderName: string; mine: boolean; currentRank: string }) {
  const rankTitle = mine ? currentRank : (findRosterMember(senderName)?.rankBadgeTitle ?? "ATLETA");
  const style = rosterBadgeStyle(rankTitle);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: style.bg, borderWidth: 1, borderColor: style.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 }}>
      <Award size={9} color={style.color} />
      <Text className="font-mono" style={{ fontSize: 7, letterSpacing: 0.5, fontWeight: "900", color: style.color }}>{rankTitle}</Text>
    </View>
  );
}

function AudioBubbleChip({ uri, tint }: { uri: string; tint: string }) {
  const player = useAudioPlayer(uri);
  const [playing, setPlaying] = useState(false);
  const toggle = useCallback(async () => {
    try {
      if (playing) { player.pause(); setPlaying(false); }
      else { await player.seekTo(0); player.play(); setPlaying(true); }
    } catch (err) {
      console.warn("[AudioBubbleChip] playback failed:", err);
      setPlaying(false);
    }
  }, [playing, player]);
  return (
    <Pressable onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
      {playing ? <Pause size={14} color={tint} /> : <Play size={14} color={tint} />}
      <Text className="font-mono" style={{ fontSize: 10, color: tint }}>NOTA DE AUDIO</Text>
    </Pressable>
  );
}

function ChallengeBubble({ challenge, mine, myPrs, onAccept }: {
  challenge: Challenge; mine: boolean;
  myPrs: { prBench: number; prSquat: number; prDeadlift: number } | null;
  onAccept: () => void;
}) {
  return (
    <View style={{ borderRadius: 12, padding: 12, backgroundColor: "rgba(204,255,0,0.06)", borderWidth: 1, borderColor: "rgba(204,255,0,0.35)", minWidth: 220 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Zap size={13} color={VOLT} />
        <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: VOLT }}>RETO ACTIVO</Text>
      </View>
      <Text style={{ fontSize: 12, lineHeight: 16, color: "#fff" }}>{challenge.topic}</Text>
      {challenge.accepted ? (
        <View style={{ marginTop: 8, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: "#d4d4d8" }}>✓ RETO ACEPTADO</Text>
        </View>
      ) : mine ? (
        <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 8 }}>ESPERANDO QUE ALGUIEN ACEPTE...</Text>
      ) : (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAccept}
          style={{ marginTop: 10, backgroundColor: VOLT, borderRadius: 999, paddingVertical: 9, alignItems: "center" }}
        >
          <Text style={{ ...athletic, fontSize: 11, color: "#000" }}>ACEPTAR RETO ⚡</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SalasChatScreen() {
  const router = useRouter();
  const { student } = usePortal();
  const { addXP, currentRank } = useGamification();
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [showStatsPicker, setShowStatsPicker] = useState(false);
  const [showChallengeComposer, setShowChallengeComposer] = useState(false);
  const [challengeText, setChallengeText] = useState("¿Quién iguala mi set de Press Banca de hoy?");
  const [showRecorder, setShowRecorder] = useState(false);
  const [headToHead, setHeadToHead] = useState<{ topic: string; opponent: RosterMember | undefined } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      setMessages(raw ? JSON.parse(raw) : seedMessages());
    }).catch(() => setMessages(seedMessages()));
  }, []);

  const persist = useCallback((next: ChatMsg[]) => {
    setMessages(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const rewardXP = useCallback(() => { addXP(5); }, [addXP]);

  const pushMessage = useCallback((partial: Partial<ChatMsg> & { text: string }) => {
    const msg: ChatMsg = {
      id: `${Date.now()}`, senderName: student?.name?.split(" ")[0] || "Tú", mine: true, createdAt: new Date().toISOString(),
      ...partial,
    };
    persist([...messages, msg]);
    triggerImpact();
    rewardXP();
  }, [messages, persist, student?.name, rewardXP]);

  const sendText = useCallback(() => {
    if (!draft.trim()) return;
    pushMessage({ text: draft.trim() });
    setDraft("");
  }, [draft, pushMessage]);

  const shareStats = useCallback((kind: "pr" | "rank") => {
    setShowStatsPicker(false);
    if (kind === "pr") {
      const prs = [
        { label: "PRESS BANCA", v: student?.prBench ?? 0 },
        { label: "SENTADILLA",  v: student?.prSquat ?? 0 },
        { label: "PESO MUERTO", v: student?.prDeadlift ?? 0 },
      ].sort((a, b) => b.v - a.v)[0]!;
      pushMessage({ text: "Compartí mi mejor marca 💪", sharedStats: { kind: "pr", label: `MEJOR PR · ${prs.label}`, value: `${prs.v}`, sub: "KG" } });
    } else {
      const me = SALA_ROSTER.find(m => m.isMe);
      pushMessage({ text: "Compartí mi posición en el ranking 🏆", sharedStats: { kind: "rank", label: "POSICIÓN EN RANKING", value: `#${me?.rnk ?? "—"}`, sub: `${me?.pts.toLocaleString() ?? 0} PTS` } });
    }
  }, [student, pushMessage]);

  const launchChallenge = useCallback(() => {
    if (!challengeText.trim()) return;
    pushMessage({ text: "Lancé un reto para hoy.", challenge: { id: `${Date.now()}`, topic: challengeText.trim(), accepted: false, opponentName: null } });
    setShowChallengeComposer(false);
  }, [challengeText, pushMessage]);

  const acceptChallenge = useCallback((msg: ChatMsg) => {
    if (!msg.challenge) return;
    triggerSuccess();
    const opponent = findRosterMember(msg.senderName);
    persist(messages.map(m => m.id === msg.id ? { ...m, challenge: { ...m.challenge!, accepted: true, opponentName: msg.senderName } } : m));
    setHeadToHead({ topic: msg.challenge.topic, opponent });
  }, [messages, persist]);

  const attachImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { triggerWarning(); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    pushMessage({ text: "", imageUri: result.assets[0].uri });
  }, [pushMessage]);

  // Mismo bug/fix que AudioNoteCapture en salas/index.tsx: prepareToRecordAsync()
  // y stop() son promesas que nadie capturaba — cualquier rechazo (permiso
  // revocado, recorder ya detenido) subía como "Uncaught (in promise)".
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { triggerWarning(); return; }
      setShowRecorder(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.warn("[SalasChat] startRecording failed:", err);
      setShowRecorder(false);
      triggerWarning();
    }
  }, [recorder]);
  const stopAndSend = useCallback(async () => {
    if (!recorderState.isRecording) { setShowRecorder(false); return; }
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setShowRecorder(false);
      // Nunca adjuntar una URI nula/indefinida al mensaje.
      if (uri && uri.length > 0) pushMessage({ text: "", audioUri: uri });
      else triggerWarning();
    } catch (err) {
      console.warn("[SalasChat] stopAndSend failed:", err);
      setShowRecorder(false);
      triggerWarning();
    }
  }, [recorder, recorderState.isRecording, pushMessage]);

  const roomOpponentPrs = student ? { prBench: student.prBench, prSquat: student.prSquat, prDeadlift: student.prDeadlift } : null;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: OLED }}>
      {/* Header formal — Módulo 2 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => { triggerImpact(); router.back(); }}
          hitSlop={10}
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
        >
          <ChevronLeft size={17} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={{ ...athletic, fontSize: 15, color: "#fff", letterSpacing: 0.5 }}>SALA CORE // CHAT GLOBAL</Text>
          <Text style={tacticalSubHeader}>HIGH PERFORMANCE UNIT</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ padding: 20, gap: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => (
            <View style={{ alignItems: m.mine ? "flex-end" : "flex-start" }}>
              {!m.mine && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <Text className="font-black" style={{ fontSize: 10, color: VOLT }}>{m.senderName}</Text>
                  <SenderBadge senderName={m.senderName} mine={false} currentRank={currentRank} />
                </View>
              )}
              {m.mine && (
                <View style={{ marginBottom: 3 }}>
                  <SenderBadge senderName={m.senderName} mine currentRank={currentRank} />
                </View>
              )}

              {m.challenge ? (
                <ChallengeBubble challenge={m.challenge} mine={m.mine} myPrs={roomOpponentPrs} onAccept={() => acceptChallenge(m)} />
              ) : (
                <View style={{ maxWidth: "82%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: m.mine ? VOLT : "rgba(255,255,255,0.05)" }}>
                  {m.imageUri && <Image source={{ uri: m.imageUri }} style={{ width: 180, height: 180, borderRadius: 10, marginBottom: m.text ? 8 : 0 }} />}
                  {m.audioUri && <AudioBubbleChip uri={m.audioUri} tint={m.mine ? "#000" : VOLT} />}
                  {m.sharedStats && (
                    <View style={{ borderRadius: 10, padding: 10, backgroundColor: m.mine ? "rgba(0,0,0,0.1)" : "rgba(204,255,0,0.08)", marginBottom: m.text ? 8 : 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Award size={16} color={m.mine ? "#000" : VOLT} />
                      <View>
                        <Text className="font-mono" style={{ fontSize: 7, letterSpacing: 0.5, color: m.mine ? "rgba(0,0,0,0.6)" : SILVER }}>{m.sharedStats.label}</Text>
                        <Text className="font-black" style={{ fontSize: 14, color: m.mine ? "#000" : "#fff" }}>{m.sharedStats.value} <Text style={{ fontSize: 8, color: m.mine ? "rgba(0,0,0,0.6)" : VOLT }}>{m.sharedStats.sub}</Text></Text>
                      </View>
                    </View>
                  )}
                  {!!m.text && <Text style={{ fontSize: 12, color: m.mine ? "#000" : "#fff", lineHeight: 16 }}>{m.text}</Text>}
                </View>
              )}
            </View>
          )}
        />

        {/* Toolbar — compartir stats · lanzar reto · nota de audio · imagen */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 6 }}>
          <Pressable onPress={() => { triggerImpact(); setShowStatsPicker(true); }} hitSlop={8} style={{ padding: 8 }}>
            <BarChart3 size={18} color={VOLT} />
          </Pressable>
          <Pressable onPress={() => { triggerImpact(); setShowChallengeComposer(true); }} hitSlop={8} style={{ padding: 8 }}>
            <Zap size={18} color={VOLT} />
          </Pressable>
          <Pressable onPress={startRecording} hitSlop={8} style={{ padding: 8 }}>
            <Mic size={18} color={VOLT} />
          </Pressable>
          <Pressable onPress={attachImage} hitSlop={8} style={{ padding: 8 }}>
            <CameraIcon size={18} color={VOLT} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Escribe en el chat global..."
            placeholderTextColor="#52525b"
            style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontSize: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
          />
          <Pressable
            onPress={sendText}
            disabled={!draft.trim()}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: draft.trim() ? VOLT : "rgba(255,255,255,0.06)" }}
          >
            <Send size={16} color={draft.trim() ? "#000" : SILVER} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Compartir stats picker */}
      <Modal visible={showStatsPicker} transparent animationType="fade" onRequestClose={() => setShowStatsPicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.85)", justifyContent: "flex-end" }} onPress={() => setShowStatsPicker(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#131315", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}>
            <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", marginBottom: 14 }}>Compartir tarjeta de stats</Text>
            <TouchableOpacity activeOpacity={0.75} onPress={() => shareStats("pr")} style={{ ...GLASS, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Award size={18} color={VOLT} />
              <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }}>Mi mejor entreno (PR más alto)</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75} onPress={() => shareStats("rank")} style={{ ...GLASS, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <BarChart3 size={18} color={CYAN} />
              <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }}>Mi posición exacta en el ranking</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Composer de reto */}
      <Modal visible={showChallengeComposer} transparent animationType="fade" onRequestClose={() => setShowChallengeComposer(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.85)", justifyContent: "center", padding: 24 }} onPress={() => setShowChallengeComposer(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#131315", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 18 }}>
            <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", letterSpacing: 0.8, marginBottom: 12 }}>⚡ Lanzar Active Challenge Card</Text>
            <TextInput
              value={challengeText}
              onChangeText={setChallengeText}
              multiline
              placeholderTextColor="#52525b"
              style={{ minHeight: 60, borderRadius: 12, padding: 12, fontSize: 12, color: "#fff", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", textAlignVertical: "top" }}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!challengeText.trim()}
              onPress={launchChallenge}
              style={{ backgroundColor: VOLT, borderRadius: 999, paddingVertical: 13, marginTop: 14, alignItems: "center", opacity: challengeText.trim() ? 1 : 0.35 }}
            >
              <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>LANZAR RETO</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Grabadora de nota de audio */}
      <Modal visible={showRecorder} transparent animationType="fade" onRequestClose={() => setShowRecorder(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <MotiView
            from={{ opacity: 0.4, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1.05 }}
            transition={{ type: "timing", duration: 500, loop: true, repeatReverse: true }}
            style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 2, borderColor: "#ef4444", alignItems: "center", justifyContent: "center" }}
          >
            <Mic size={34} color="#ef4444" />
          </MotiView>
          <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: "#fff", marginTop: 20 }}>
            GRABANDO · {Math.round(recorderState.durationMillis / 1000)}s
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={stopAndSend}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: VOLT, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 14, marginTop: 28 }}
          >
            <Square size={14} color="#000" fill="#000" />
            <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>DETENER Y ENVIAR</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Head-to-head — se abre al aceptar el reto de otro miembro */}
      <Modal visible={!!headToHead} transparent animationType="slide" onRequestClose={() => setHeadToHead(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.96)", padding: 24, paddingTop: 70 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER }}>PAREO TÁCTICO 1V1</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setHeadToHead(null)} style={{ borderWidth: 1, borderColor: VOLT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Text className="font-black" style={{ fontSize: 10, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
          {headToHead && (() => {
            const mine = myValueForTopic(headToHead.topic, student ? { prBench: student.prBench, prSquat: student.prSquat, prDeadlift: student.prDeadlift } : null);
            const theirs = opponentValueForTopic(headToHead.topic, headToHead.opponent);
            return (
              <>
                <Text style={{ ...athletic, fontSize: 18, color: "#fff", marginBottom: 20 }}>{headToHead.topic}</Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1, ...GLASS, borderColor: "rgba(204,255,0,0.4)", borderWidth: 1.5, borderRadius: 16, padding: 16, alignItems: "center" }}>
                    <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>{mine.label}</Text>
                    <Text className="font-black" style={{ fontSize: 22, color: "#fff", marginTop: 8 }}>{mine.value}</Text>
                  </View>
                  {headToHead.opponent && (
                    <View style={{ alignItems: "center" }}>
                      <AvatarRing member={headToHead.opponent} size={44} />
                    </View>
                  )}
                  <View style={{ flex: 1, ...GLASS, borderRadius: 16, padding: 16, alignItems: "center" }}>
                    <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>{theirs.label}</Text>
                    <Text className="font-black" style={{ fontSize: 22, color: "#fff", marginTop: 8 }}>{theirs.value}</Text>
                  </View>
                </View>
              </>
            );
          })()}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
