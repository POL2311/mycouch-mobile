import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, ActivityIndicator,
  ImageBackground, Modal, StyleSheet, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { BlurView } from "expo-blur";
import { PulseButton } from "@/components/ui/PulseButton";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync } from "expo-audio";
import {
  LayoutGrid, Trophy, Zap, Users, Bell, Heart, MessageCircle, Activity, ChevronDown, ChevronLeft,
  Send, X as XIcon, MessagesSquare, Share2, Search, Plus, Mic, Images, Award, Play, Pause, Square,
} from "lucide-react-native";
import Svg, { Polygon, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/session";
import { usePortal, joinCommunityRoom } from "@/lib/portal";
import { api } from "@/lib/api";
import { triggerImpact, triggerSuccess, triggerWarning } from "@/lib/haptics";
import { useGamification } from "@/lib/gamification";
import { tacticalSubHeader } from "@/lib/typography";
import { ChatThreadModal, type ChatMessage } from "@/components/social/ChatThreadModal";
import { XPToast, useXPToast } from "@/components/social/XPToast";

// The lobby gate needs raw HTTP status codes for the blueprint's exact
// 403→AUTH / !ok→NET taxonomy, which the api() helper flattens into thrown
// Error messages — so those two calls mirror the web's plain fetch() verbatim.
const BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// ── Salas ecosystem tokens ───────────────────────────────────────────────────
const VOLT   = "#CCFF00";
const CYAN   = "#00F0FF";
const OLED   = "#070708";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;

const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// Offline-first snapshot for the public-rooms lobby — bad gym Wi-Fi
// shouldn't mean a blank/crashed SALAS tab, just a stale-but-usable list.
const ROOMS_CACHE_KEY = "mc:salas_rooms_snapshot";
interface RoomsSnapshot { rooms: PublicRoom[]; currentRoom: CurrentRoom }

// ══════════════════════════════════════════════════════════════════════════════
//  TYPES — mirrored verbatim from MYCOACH_SALAS_WEB_BLUEPRINT.md §3.1
// ══════════════════════════════════════════════════════════════════════════════
type RoomTabId = "FEED" | "RANKING" | "RETOS" | "ROSTER" | "AVISOS" | "CHAT" | "DMS";

interface PublicRoom  { id: string; name: string; memberCount: number }
type CurrentRoom = { id: string; name: string } | null;
interface ServerNotice { id: string; senderName: string; role: string; content: string; createdAt: string }

export interface RosterMember {
  id: number;
  name: string;
  avatarInitials: string;
  avatarBgColor: string;        // full CSS gradient string (web heritage) — first hex is used natively
  rankBadgeTitle: string;
  rnk: number;
  rachaActiveDays: number;
  isOnline: boolean;
  isMe: boolean;
  pts: number;
  kcal: number;
  sets: number;
  prs: { maxDeadlift: number; maxSquat: number; benchPress: number; kcalRecord: number };
}

interface LiveStake {
  id: number;
  opponent: string;
  opponentColor: string;
  modality: string;
  pool: number;
  myScore: number;
  rivalScore: number;
  myMax: number;
  rivalMax: number;
  status: "PENDIENTE" | "EN COMBATE TÁCTICO";
}

interface FeedComment { id: number; handle: string; text: string }

interface TelemetryCard { label: string; value: string; sub: string }

interface FeedPost {
  id: number; handle: string; time: string; exercise: string; badge: string;
  img: string | null; likes: number; comment: string;
  commentsList: FeedComment[];
  // Módulo 1 (FAB de creación) — adjuntos reales opcionales: fotos de galería
  // nativa (expo-image-picker), nota de audio grabada (expo-audio) y una
  // tarjeta de telemetría embebida generada desde datos reales del perfil
  // (PRs / rango) — nunca simulados.
  extraImages?: string[];
  audioUri?: string | null;
  telemetry?: TelemetryCard | null;
}

const CHALLENGE_MODALITIES = [
  { id: "DEADLIFT",    label: "MAX DEADLIFT",  sub: "1RM MÁXIMO KG", emoji: "🏋️" },
  { id: "CONSISTENCY", label: "CONSISTENCIA",  sub: "% SESIONES",    emoji: "📊" },
  { id: "KCAL",        label: "KCAL GOAL",     sub: "CAL TOTALES",   emoji: "🔥" },
] as const;

const ROOM_TABS: { id: RoomTabId; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "FEED",    label: "FEED",    Icon: LayoutGrid },
  { id: "RANKING", label: "RANKING", Icon: Trophy     },
  { id: "RETOS",   label: "RETOS",   Icon: Zap        },
  { id: "CHAT",    label: "CHAT",    Icon: MessageCircle },
  { id: "DMS",     label: "DMS",     Icon: MessagesSquare },
  { id: "ROSTER",  label: "ROSTER",  Icon: Users      },
  { id: "AVISOS",  label: "AVISOS",  Icon: Bell       },
];

// ══════════════════════════════════════════════════════════════════════════════
//  SEED DATASETS — verbatim values from blueprint §3.3 (client-simulated
//  modules; §1.8: no server endpoints exist for feed/ranking/roster/challenges)
// ══════════════════════════════════════════════════════════════════════════════
export const SALA_ROSTER: RosterMember[] = [
  { id: 1, name: "MARCUS_ELITE",  avatarInitials: "ME", avatarBgColor: "linear-gradient(135deg,#CCFF00,#00F0FF)", rankBadgeTitle: "BESTIA ELITE", rnk: 1, rachaActiveDays: 42, isOnline: true,  isMe: false, pts: 4820, kcal: 4210, sets: 52, prs: { maxDeadlift: 220, maxSquat: 185, benchPress: 150, kcalRecord: 6200 } },
  { id: 2, name: "COACH_FELLS",   avatarInitials: "CF", avatarBgColor: "linear-gradient(135deg,#CCFF00,#a3e635)", rankBadgeTitle: "COMANDANTE",   rnk: 2, rachaActiveDays: 38, isOnline: true,  isMe: false, pts: 4650, kcal: 3980, sets: 48, prs: { maxDeadlift: 210, maxSquat: 175, benchPress: 140, kcalRecord: 5900 } },
  { id: 3, name: "ANA_BERSERKER", avatarInitials: "AB", avatarBgColor: "linear-gradient(135deg,#f472b6,#a78bfa)", rankBadgeTitle: "PREDADORA",    rnk: 3, rachaActiveDays: 31, isOnline: false, isMe: false, pts: 4100, kcal: 3650, sets: 44, prs: { maxDeadlift: 165, maxSquat: 140, benchPress: 95,  kcalRecord: 4800 } },
  { id: 4, name: "ALBERTO_Z",     avatarInitials: "AZ", avatarBgColor: "linear-gradient(135deg,#60a5fa,#a78bfa)", rankBadgeTitle: "TITÁN",        rnk: 4, rachaActiveDays: 28, isOnline: true,  isMe: true,  pts: 3105, kcal: 3105, sets: 38, prs: { maxDeadlift: 180, maxSquat: 155, benchPress: 120, kcalRecord: 5840 } },
  { id: 5, name: "DIANA_FORCE",   avatarInitials: "DF", avatarBgColor: "linear-gradient(135deg,#f87171,#fbbf24)", rankBadgeTitle: "GUERRERA PRO", rnk: 5, rachaActiveDays: 21, isOnline: false, isMe: false, pts: 2890, kcal: 2780, sets: 32, prs: { maxDeadlift: 145, maxSquat: 125, benchPress: 85,  kcalRecord: 4200 } },
  { id: 6, name: "CARLOS_POWER",  avatarInitials: "CP", avatarBgColor: "linear-gradient(135deg,#34d399,#06b6d4)", rankBadgeTitle: "ATLETA INIT",  rnk: 6, rachaActiveDays: 14, isOnline: true,  isMe: false, pts: 2540, kcal: 2410, sets: 28, prs: { maxDeadlift: 130, maxSquat: 110, benchPress: 80,  kcalRecord: 3900 } },
  { id: 7, name: "JORGE_REX",     avatarInitials: "JR", avatarBgColor: "linear-gradient(135deg,#fb923c,#f43f5e)", rankBadgeTitle: "GUERRERO PRO", rnk: 7, rachaActiveDays: 19, isOnline: false, isMe: false, pts: 2200, kcal: 2100, sets: 24, prs: { maxDeadlift: 155, maxSquat: 130, benchPress: 100, kcalRecord: 4100 } },
  { id: 8, name: "SARA_APEX",     avatarInitials: "SA", avatarBgColor: "linear-gradient(135deg,#c084fc,#60a5fa)", rankBadgeTitle: "BESTIA INIT",  rnk: 8, rachaActiveDays: 11, isOnline: true,  isMe: false, pts: 1980, kcal: 1850, sets: 20, prs: { maxDeadlift: 120, maxSquat: 100, benchPress: 72,  kcalRecord: 3600 } },
];

// SALA_LEADERBOARD = first six roster identities, isMe on rank 4 (blueprint §3.3)
const SALA_LEADERBOARD = SALA_ROSTER.slice(0, 6);

const SALA_ACTIVITY_FEED: FeedPost[] = [
  {
    id: 101, handle: "MARCUS_ELITE", time: "Hace 12 min", exercise: "Deadlift PR", badge: "240KG",
    img: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=60", likes: 24,
    comment: "Por fin superando los 240kg. La programación de Fells Team está dando frutos. ¡Vamos equipo!",
    commentsList: [
      { id: 1, handle: "ANA_BERSERKER", text: "Bestial 🔥" },
      { id: 2, handle: "COACH_FELLS",   text: "Ese es el nivel que buscamos. Excelente ejecución." },
    ],
  },
  {
    id: 102, handle: "ANA_BERSERKER", time: "Hace 35 min", exercise: "Sentadilla 5×5", badge: "120KG",
    img: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=60", likes: 17,
    comment: "Semana 8 del programa. PR en sentadilla. La constancia está marcando la diferencia.",
    commentsList: [
      { id: 1, handle: "MARCUS_ELITE", text: "Vamos ANA 💪" },
    ],
  },
  {
    id: 103, handle: "COACH_FELLS", time: "Hace 1h", exercise: "Press Banca", badge: "180KG",
    img: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=60", likes: 41,
    comment: "El equipo está en otro nivel este mes. Números récord en 6 de 8 ejercicios clave. Sigan así.",
    commentsList: [],
  },
];

const SALA_METRICS = [
  { label: "MIEMBROS ACTIVOS", value: "42",  sub: "+3 ESTA SEMANA", accent: VOLT },
  { label: "STREAK GRUPAL",    value: "18",  sub: "DÍAS",           accent: VOLT },
  { label: "ESFUERZO PROM.",   value: "92%", sub: "INTENSIDAD",     accent: CYAN },
];

const PINNED_AVISO = {
  sender: "COACH LUIS YÁÑEZ",
  time: "HACE 2 HORAS",
  content: "¡ALERTA DE DESAFÍO! Mañana iniciamos el protocolo de superación de fuerza en Sentadilla. Aseguren sus macronutrientes esta noche. No hay espacio para debilidad.",
  fire: 128,
  arm: 94,
};

const SEED_STAKES: LiveStake[] = [
  { id: 1, opponent: "MARCUS_ELITE",  opponentColor: "linear-gradient(135deg,#CCFF00,#00F0FF)", modality: "KCAL GOAL",   pool: 1000, myScore: 0, rivalScore: 4210, myMax: 5000, rivalMax: 5000, status: "EN COMBATE TÁCTICO" },
  { id: 2, opponent: "ANA_BERSERKER", opponentColor: "linear-gradient(135deg,#f472b6,#a78bfa)", modality: "CONSISTENCY", pool: 200,  myScore: 0, rivalScore: 31,   myMax: 7,    rivalMax: 7,    status: "PENDIENTE" },
];

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════
// Web seeds carry CSS gradient strings; natively we render the leading hex.
export function gradFirst(gradient: string): string {
  return gradient.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#27272a";
}

function initialsOf(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function noticeDate(createdAt: string): string {
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase();
  } catch { return ""; }
}

function pct(score: number, max: number): number {
  return max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
}

// Metallic tier badge registry — blueprint §3.5 keyword matching, RN colors.
export function rosterBadgeStyle(rankTitle: string): { bg: string; border: string; color: string } {
  const r = rankTitle.toUpperCase();
  if (r.includes("BESTIA"))     return { bg: "rgba(26,46,5,0.5)",   border: "#a3e635",               color: "#a3e635" };
  if (r.includes("COMANDANTE")) return { bg: "rgba(66,32,6,0.4)",   border: "rgba(234,179,8,0.4)",   color: "#eab308" };
  if (r.includes("PREDADOR"))   return { bg: "#18181b",             border: "rgba(82,82,91,0.5)",    color: "#e4e4e7" };
  if (r.includes("TIT"))        return { bg: "#0f172a",             border: "rgba(148,163,184,0.4)", color: "#e2e8f0" };
  if (r.includes("GUERRER"))    return { bg: "#18181b",             border: "rgba(63,63,70,0.5)",    color: "#d4d4d8" };
  return                               { bg: "rgba(120,53,15,0.3)", border: "rgba(146,64,14,0.4)",   color: "#f59e0b" };
}

// Bottom dark mask for feed imagery.
function FeedShade() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="feedShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={OLED} stopOpacity="0" />
          <Stop offset="1" stopColor={OLED} stopOpacity="0.9" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#feedShade)" />
    </Svg>
  );
}

// Circular initials avatar (solid derivation of the web gradient seed).
export function AvatarRing({ member, size, ringColor, glowColor }: {
  member: Pick<RosterMember, "avatarInitials" | "avatarBgColor" | "isOnline">;
  size: number; ringColor?: string; glowColor?: string;
}) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: gradFirst(member.avatarBgColor),
        alignItems: "center", justifyContent: "center",
        borderWidth: ringColor ? 2.5 : 0, borderColor: ringColor,
        ...(glowColor ? { shadowColor: glowColor, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8 } : null),
      }}
    >
      <Text className="font-black" style={{ fontSize: size * 0.3, color: "#000" }}>
        {member.avatarInitials}
      </Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOBBY — currentView === "LOBBY"  (RADAR DE SALAS gate, real endpoints)
// ══════════════════════════════════════════════════════════════════════════════
function SalasLobby({
  profileInitials,
  profileImage,
  profileName,
  rooms, loading, fetchErr, isOffline, codeInput, onChangeCode,
  codeError, codeSuccess, isJoining, joinError, onInject, onJoinRoom, onBack,
}: {
  profileInitials: string;
  profileImage?: string | null;
  profileName?: string | null;
  onBack: () => void;
  rooms: PublicRoom[];
  loading: boolean;
  fetchErr: "AUTH" | "NET" | null;
  isOffline: boolean;
  codeInput: string;
  onChangeCode: (t: string) => void;
  codeError: boolean;
  codeSuccess: boolean;
  isJoining: boolean;
  joinError: string | null;
  onInject: () => void;
  onJoinRoom: (roomId: string) => void;
}) {
  // Border/text trichotomy — blueprint §2.2: success volt / error red / idle hairline.
  const codeBorder = codeSuccess ? VOLT : codeError ? "#f87171" : "rgba(255,255,255,0.1)";
  const locked = isJoining || codeSuccess;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
      {/* Branded header — custom back button (dock is hidden strictly while
          on Salas — see app/(portal)/_layout.tsx) + vector diamond-F +
          volt-ringed profile badge */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginTop: 12, height: 48 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          hitSlop={10}
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 8,
            backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
          }}
        >
          <ChevronLeft size={18} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Svg width={40} height={40} viewBox="0 0 62 62" style={StyleSheet.absoluteFill}>
              <Polygon points="31,3 59,31 31,59 3,31" stroke={VOLT} strokeWidth={3} fill="none" />
            </Svg>
            <Text style={{ ...athletic, fontSize: 16, color: VOLT }}>F</Text>
          </View>
          <Text className="font-bold uppercase" style={{ color: "#fff", fontSize: 14, letterSpacing: 3 }}>
            MYCOACH
          </Text>
        </View>
        <View style={{ position: "absolute", right: 20 }}>
          <UserAvatar 
            image={profileImage}
            name={profileName}
            size={44}
            initials={profileName ? undefined : profileInitials}
          />
        </View>
      </View>

      {/* Semantics header */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 2, color: VOLT, textTransform: "uppercase" }}>
          COMUNIDAD · ACCESO TÁCTICO
        </Text>
        <Text style={{ ...athletic, fontSize: 32, lineHeight: 34, letterSpacing: -1, color: "#fff", marginTop: 4 }}>
          RADAR DE SALAS
        </Text>
      </View>

      {/* API error banner — surfaces the real 422 semantics (blueprint sharp edge #1) */}
      {joinError && (
        <View
          style={{
            marginHorizontal: 20, marginTop: 16, borderRadius: 12, padding: 12,
            backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)",
          }}
        >
          <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.5, color: "#f87171" }}>
            ⚠️ [ ERROR // {joinError} ]
          </Text>
        </View>
      )}

      {/* ── SALAS PÚBLICAS directory (GET /api/community/public-rooms) ── */}
      <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, textTransform: "uppercase", paddingHorizontal: 20, marginTop: 24, marginBottom: 10 }}>
        SALAS PÚBLICAS
      </Text>

      {/* Offline fallback indicator — only shown when a live fetch failed
          and this list is a cached snapshot, not fresh data. */}
      {isOffline && !loading && (
        <View
          style={{
            marginHorizontal: 20, marginBottom: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
            backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
            flexDirection: "row", alignItems: "center", gap: 8,
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SILVER }} />
          <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.5, color: SILVER }}>
            MODO SIN CONEXIÓN — MOSTRANDO ÚLTIMA VERSIÓN GUARDADA
          </Text>
        </View>
      )}

      {loading ? (
        <View style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator size="small" color={VOLT} />
          <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: SILVER }}>ESCANEANDO RED...</Text>
        </View>
      ) : fetchErr === "AUTH" ? (
        <View style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, padding: 20, alignItems: "center" }}>
          <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 0.5, color: "#f87171" }}>
            [ AUTH ERROR // SESIÓN NO VERIFICADA — RECARGA LA PÁGINA ]
          </Text>
        </View>
      ) : fetchErr === "NET" ? (
        <View style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, padding: 20, alignItems: "center" }}>
          <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 0.5, color: "#f87171" }}>
            [ SERVER ERROR // ERROR AL CARGAR SALAS — INTÉNTALO DE NUEVO ]
          </Text>
        </View>
      ) : rooms.length === 0 ? (
        <View style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, padding: 24, alignItems: "center", gap: 10 }}>
          <Activity size={22} color={SILVER} strokeWidth={1.5} />
          <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 0.5, color: SILVER }}>
            [ SISTEMA // TODAVÍA NO HAY SALAS PÚBLICAS DISPONIBLES ]
          </Text>
        </View>
      ) : (
        rooms.map(room => (
          <View key={room.id} style={{ ...GLASS, borderRadius: 16, marginHorizontal: 20, marginBottom: 10, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5 }}>
                  {room.name}
                </Text>
                <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginTop: 2 }}>
                  {room.memberCount} ACTIVOS
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                disabled={locked}
                onPress={() => onJoinRoom(room.id)}
                style={{
                  borderWidth: 1, borderColor: VOLT, borderRadius: 999,
                  paddingHorizontal: 14, paddingVertical: 9, opacity: locked ? 0.4 : 1,
                }}
              >
                <Text className="font-black" style={{ fontSize: 10, letterSpacing: 0.5, color: VOLT }}>
                  ⚡ DESTRABAR ACCESO PÚBLICO
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* ── CÓDIGO PRIVADO divider ── */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, marginVertical: 24 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255, 255, 255, 0.06)" }} />
        <Text style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: "bold", color: SILVER }}>CÓDIGO PRIVADO</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255, 255, 255, 0.06)" }} />
      </View>

      {/* Tactical code field — glass container, centered uppercase tracking */}
      <View
        style={{
          ...GLASS, borderColor: codeBorder, borderRadius: 16, height: 56,
          marginHorizontal: 20, justifyContent: "center",
        }}
      >
        <TextInput
          value={codeInput}
          onChangeText={t => onChangeCode(t.toUpperCase().replace(/^\s+/, ""))}
          editable={!locked}
          maxLength={24}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="CÓDIGO TÁCTICO"
          placeholderTextColor="#52525b"
          onSubmitEditing={onInject}
          selectionColor={VOLT}
          className="font-black"
          style={{
            height: 56, textAlign: "center", fontSize: 16, letterSpacing: 4,
            color: codeSuccess ? VOLT : codeError ? "#f87171" : "#fff",
          }}
        />
      </View>

      {codeError && !joinError && (
        <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 1, color: "#f87171", marginTop: 8 }}>
          ✕ INGRESA UN CÓDIGO VÁLIDO
        </Text>
      )}
      {codeSuccess && (
        <Text className="font-mono text-center" style={{ fontSize: 10, letterSpacing: 1, color: VOLT, marginTop: 8 }}>
          ⚡ VERIFICADO · ACCESO CONCEDIDO
        </Text>
      )}

      {/* The trigger key */}
      <PulseButton
        glowColor={VOLT}
        disabled={locked}
        onPress={onInject}
        style={{
          backgroundColor: VOLT, borderRadius: 999, paddingVertical: 16,
          marginHorizontal: 20, marginTop: 16, alignItems: "center", justifyContent: "center",
          flexDirection: "row", gap: 8, opacity: isJoining ? 0.7 : 1,
        }}
      >
        {isJoining && <ActivityIndicator size="small" color="#000" />}
        <Text style={{ ...athletic, fontSize: 14, letterSpacing: 0.5, color: "#000" }}>
          {codeSuccess ? "⚡ ACCESO CONCEDIDO" : isJoining ? "VERIFICANDO..." : "🔑 INYECTAR CÓDIGO PRIVADO"}
        </Text>
      </PulseButton>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  TAB BODIES — currentView === "ROOM_ACTIVE"
// ══════════════════════════════════════════════════════════════════════════════

// ── A · FEED ──────────────────────────────────────────────────────────────────
// ── FAB de creación (Módulo 1) — reemplaza por completo al PostComposer
// inline. Tres modos reales, no simulados: grabación de audio (expo-audio),
// selector nativo de galería (expo-image-picker), y una tercera pestaña que
// solo puede inyectar datos REALES del atleta (PRs, rango) — nunca valores
// inventados. ──────────────────────────────────────────────────────────────
type CreatorMode = "NONE" | "AUDIO" | "IMAGES" | "TELEMETRY";

// Barras de frecuencia animadas — opacidades sobre #1C1C1E (.cursorrules),
// impulsadas por el nivel real de metering cuando el hardware lo reporta;
// si el dispositivo no expone metering, caen a un pulso uniforme atado igual
// a isRecording real (nunca se anima una grabación que no está ocurriendo).
function AudioWaveform({ isRecording, metering }: { isRecording: boolean; metering?: number }) {
  const bars = 24;
  // metering típicamente en dBFS (~-160 silencio, 0 pico) — normalizado a 0..1.
  const level = metering != null ? Math.min(1, Math.max(0, (metering + 60) / 60)) : 0.5;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, height: 56 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const base = 0.15 + ((Math.sin(i * 1.7) + 1) / 2) * 0.5;
        const h = isRecording ? Math.max(6, base * level * 56) : 6;
        return (
          <MotiView
            key={i}
            animate={{ height: h, opacity: isRecording ? 0.5 + level * 0.5 : 0.25 }}
            transition={{ type: "timing", duration: 180 }}
            style={{ width: 4, borderRadius: 2, backgroundColor: "#1C1C1E", borderWidth: 1, borderColor: isRecording ? VOLT : "rgba(255,255,255,0.1)" }}
          />
        );
      })}
    </View>
  );
}

function AudioNoteCapture({ audioUri, onChangeAudioUri }: { audioUri: string | null; onChangeAudioUri: (uri: string | null) => void }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(audioUri ?? undefined);
  const [playing, setPlaying] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  // Corrección de bug: startRecording/stopRecording/togglePlayback lanzaban
  // "Uncaught (in promise)" cuando prepareToRecordAsync()/stop()/seekTo()
  // rechazaban (permiso revocado a mitad de grabación, grabador ya detenido
  // por una segunda pulsación rápida, reproductor sin fuente cargada) — nada
  // capturaba esas promesas. Ahora cada flujo async está en su propio
  // try/catch defensivo, valida el estado del recorder antes de operar sobre
  // él, y nunca adjunta una URI nula/indefinida al payload del post.
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { setPermDenied(true); triggerWarning(); return; }
      setPermDenied(false);
      onChangeAudioUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
      triggerImpact();
    } catch (err) {
      console.warn("[AudioNoteCapture] startRecording failed:", err);
      triggerWarning();
    }
  }, [recorder, onChangeAudioUri]);

  const stopRecording = useCallback(async () => {
    // Solo detener si el recorder realmente está grabando — una segunda
    // pulsación tras un stop ya en curso golpeaba recorder.stop() dos veces
    // y la segunda llamada rechazaba porque ya no había nada que detener.
    if (!recorderState.isRecording) return;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      // Nunca adjuntar una URI nula/indefinida al post — sin archivo real,
      // no hay nota de audio que ofrecer.
      onChangeAudioUri(uri && uri.length > 0 ? uri : null);
      if (uri) triggerSuccess(); else triggerWarning();
    } catch (err) {
      console.warn("[AudioNoteCapture] stopRecording failed:", err);
      onChangeAudioUri(null);
      triggerWarning();
    }
  }, [recorder, recorderState.isRecording, onChangeAudioUri]);

  const togglePlayback = useCallback(async () => {
    if (!audioUri) return;
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        await player.seekTo(0);
        player.play();
        setPlaying(true);
      }
    } catch (err) {
      console.warn("[AudioNoteCapture] togglePlayback failed:", err);
      setPlaying(false);
    }
  }, [playing, player, audioUri]);

  const seconds = Math.round(recorderState.durationMillis / 1000);

  return (
    <View style={{ alignItems: "center", paddingVertical: 8 }}>
      <AudioWaveform isRecording={recorderState.isRecording} metering={recorderState.metering} />
      <Text className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: recorderState.isRecording ? VOLT : SILVER, marginTop: 8 }}>
        {recorderState.isRecording ? `GRABANDO · ${seconds}s` : audioUri ? "NOTA DE AUDIO LISTA" : "TOCA PARA GRABAR"}
      </Text>
      {permDenied && (
        <Text className="font-mono text-center" style={{ fontSize: 9, color: "#f87171", marginTop: 6 }}>
          Permiso de micrófono denegado — actívalo en Ajustes.
        </Text>
      )}

      {!audioUri ? (
        <Pressable
          onPress={recorderState.isRecording ? stopRecording : startRecording}
          style={{
            width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginTop: 16,
            backgroundColor: recorderState.isRecording ? "#ef4444" : VOLT,
            shadowColor: recorderState.isRecording ? "#ef4444" : VOLT, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8,
          }}
        >
          {recorderState.isRecording ? <Square size={22} color="#000" fill="#000" /> : <Mic size={26} color="#000" />}
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 }}>
          <Pressable
            onPress={togglePlayback}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: VOLT, alignItems: "center", justifyContent: "center" }}
          >
            {playing ? <Pause size={20} color="#000" /> : <Play size={20} color="#000" />}
          </Pressable>
          <Pressable onPress={() => { onChangeAudioUri(null); setPlaying(false); }} hitSlop={8}>
            <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: "#f87171" }}>DESCARTAR · REGRABAR</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ImageGridCapture({ images, onChangeImages }: { images: string[]; onChangeImages: (uris: string[]) => void }) {
  const pick = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { triggerWarning(); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 6,
    });
    if (result.canceled) return;
    triggerSuccess();
    onChangeImages([...images, ...result.assets.map(a => a.uri)].slice(0, 6));
  }, [images, onChangeImages]);

  return (
    <View style={{ paddingVertical: 8 }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={pick}
        style={{
          height: 96, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(204,255,0,0.4)",
          alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(204,255,0,0.04)",
        }}
      >
        <Images size={22} color={VOLT} />
        <Text className="font-black" style={{ fontSize: 11, letterSpacing: 0.5, color: VOLT }}>SELECCIONAR DE GALERÍA</Text>
      </TouchableOpacity>
      {images.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {images.map((uri, i) => (
            <View key={uri + i} style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden" }}>
              <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
              <Pressable
                onPress={() => onChangeImages(images.filter((_, idx) => idx !== i))}
                hitSlop={6}
                style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon size={11} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Carrusel de telemetría — solo datos reales del alumno (PRs / rango activo /
// racha), nunca inventados. Seleccionar una tarjeta la embebe en el post.
function TelemetryCapture({ cards, selected, onSelect }: { cards: TelemetryCard[]; selected: TelemetryCard | null; onSelect: (c: TelemetryCard | null) => void }) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
        {cards.map(c => {
          const sel = selected?.label === c.label;
          return (
            <Pressable
              key={c.label}
              onPress={() => onSelect(sel ? null : c)}
              style={{
                width: 120, borderRadius: 14, padding: 12, backgroundColor: sel ? "rgba(204,255,0,0.08)" : "rgba(255,255,255,0.04)",
                borderWidth: sel ? 1.5 : 1, borderColor: sel ? VOLT : "rgba(255,255,255,0.1)",
              }}
            >
              <Award size={16} color={sel ? VOLT : SILVER} />
              <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.8, color: SILVER, marginTop: 8 }}>{c.label}</Text>
              <Text className="font-black" style={{ fontSize: 16, color: "#fff", marginTop: 2 }}>{c.value}</Text>
              <Text className="font-mono" style={{ fontSize: 7, color: sel ? VOLT : "#71717a", marginTop: 2 }}>{c.sub}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PostCreatorModal({ visible, onClose, onSubmit, telemetryCards }: {
  visible: boolean; onClose: () => void;
  onSubmit: (text: string, images: string[], audioUri: string | null, telemetry: TelemetryCard | null) => void;
  telemetryCards: TelemetryCard[];
}) {
  const [mode, setMode] = useState<CreatorMode>("NONE");
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryCard | null>(null);

  const reset = useCallback(() => {
    setMode("NONE"); setText(""); setImages([]); setAudioUri(null); setTelemetry(null);
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const canPublish = text.trim().length > 0 || images.length > 0 || !!audioUri || !!telemetry;

  const publish = useCallback(() => {
    if (!canPublish) return;
    triggerSuccess();
    onSubmit(text.trim(), images, audioUri, telemetry);
    reset();
    onClose();
  }, [canPublish, text, images, audioUri, telemetry, onSubmit, reset, onClose]);

  const MODES: { id: CreatorMode; label: string; Icon: typeof Mic }[] = [
    { id: "AUDIO",      label: "🎙️ Nota de Audio",            Icon: Mic },
    { id: "IMAGES",     label: "📸 Captura Multimedia",         Icon: Images },
    { id: "TELEMETRY",  label: "⚡ Inyectar Telemetría/Logros", Icon: Award },
  ];

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={close}>
      {/* Responsive fix: KeyboardAvoidingView + insets explícitos (en vez de
          confiar solo en SafeAreaView, que dentro de un <Modal> no siempre
          resuelve los insets de forma consistente en Android) — el botón
          CERRAR y PUBLICAR ya no quedan inalcanzables al abrir el teclado ni
          en pantallas angostas. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        <View style={{ flex: 1, backgroundColor: "#000000", paddingTop: insets.top + 12, paddingBottom: insets.bottom }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
            <Text style={{ ...athletic, fontSize: 18, color: "#fff" }}>NUEVA PUBLICACIÓN</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={close}
              hitSlop={10}
              style={{
                flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)",
              }}
            >
              <XIcon size={12} color={VOLT} />
              <Text style={{ ...tacticalSubHeader, fontSize: 8, letterSpacing: 1 }}>CERRAR</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="¿Qué lograste hoy?"
              placeholderTextColor="#52525b"
              multiline
              style={{ ...GLASS, borderRadius: 16, padding: 14, color: "#fff", fontSize: 14, minHeight: 70, textAlignVertical: "top" }}
            />

            {/* Mode selector — tactical typography, tres opciones exclusivas */}
            <View style={{ gap: 8, marginTop: 16 }}>
              {MODES.map(({ id, label, Icon }) => {
                const active = mode === id;
                return (
                  <TouchableOpacity
                    key={id}
                    activeOpacity={0.75}
                    onPress={() => { triggerImpact(); setMode(active ? "NONE" : id); }}
                    style={{
                      ...GLASS, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
                      borderColor: active ? VOLT : "rgba(255,255,255,0.06)", borderWidth: active ? 1.5 : 1,
                      backgroundColor: active ? "rgba(204,255,0,0.06)" : "rgba(28,28,30,0.4)",
                    }}
                  >
                    <Icon size={18} color={active ? VOLT : "#fff"} />
                    <Text style={tacticalSubHeader}>{label}</Text>
                    <View style={{ marginLeft: "auto" }}>
                      {id === "AUDIO"     && audioUri && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: VOLT }} />}
                      {id === "IMAGES"    && images.length > 0 && <Text className="font-black" style={{ fontSize: 10, color: VOLT }}>{images.length}</Text>}
                      {id === "TELEMETRY" && telemetry && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: VOLT }} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === "AUDIO"     && <AudioNoteCapture audioUri={audioUri} onChangeAudioUri={setAudioUri} />}
            {mode === "IMAGES"    && <ImageGridCapture images={images} onChangeImages={setImages} />}
            {mode === "TELEMETRY" && <TelemetryCapture cards={telemetryCards} selected={telemetry} onSelect={setTelemetry} />}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!canPublish}
              onPress={publish}
              style={{
                backgroundColor: canPublish ? VOLT : "rgba(255,255,255,0.08)", borderRadius: 999, paddingVertical: 16, alignItems: "center",
                shadowColor: VOLT, shadowOpacity: canPublish ? 0.35 : 0, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
              }}
            >
              <Text style={{ ...athletic, fontSize: 13, color: canPublish ? "#000" : SILVER }}>PUBLICAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Comentarios expandibles — lista real + input para añadir uno nuevo ──────
function PostCommentsSection({ post, onAddComment }: {
  post: FeedPost; onAddComment: (postId: number, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const send = useCallback(() => {
    if (!draft.trim()) return;
    onAddComment(post.id, draft.trim());
    setDraft("");
  }, [draft, post.id, onAddComment]);

  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10, gap: 8 }}>
      {post.commentsList.length === 0 ? (
        <Text style={{ fontSize: 11, color: SILVER }}>Sé el primero en comentar.</Text>
      ) : (
        post.commentsList.map(c => (
          <View key={c.id} style={{ flexDirection: "row", gap: 6 }}>
            <Text className="font-black" style={{ fontSize: 11, color: VOLT }}>@{c.handle}</Text>
            <Text style={{ fontSize: 11, color: "#d4d4d8", flex: 1 }}>{c.text}</Text>
          </View>
        ))
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe un comentario..."
          placeholderTextColor="#52525b"
          style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: "#fff", fontSize: 11 }}
        />
        <Pressable onPress={send} disabled={!draft.trim()} hitSlop={8}>
          <Send size={16} color={draft.trim() ? VOLT : SILVER} />
        </Pressable>
      </View>
    </View>
  );
}

function FeedPostAudioChip({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const [playing, setPlaying] = useState(false);
  const toggle = useCallback(async () => {
    try {
      if (playing) { player.pause(); setPlaying(false); }
      else { await player.seekTo(0); player.play(); setPlaying(true); }
    } catch (err) {
      console.warn("[FeedPostAudioChip] playback failed:", err);
      setPlaying(false);
    }
  }, [playing, player]);
  return (
    <Pressable
      onPress={toggle}
      style={{
        flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
        backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.3)",
        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 10,
      }}
    >
      {playing ? <Pause size={13} color={VOLT} /> : <Play size={13} color={VOLT} />}
      <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.5, color: VOLT }}>NOTA DE AUDIO</Text>
    </Pressable>
  );
}

function FeedTab({
  posts, liked, onToggleLike, expandedComments, onToggleComments, onAddComment, onSharePost,
}: {
  posts: FeedPost[]; liked: Set<number>; onToggleLike: (id: number) => void;
  expandedComments: Set<number>; onToggleComments: (id: number) => void;
  onAddComment: (postId: number, text: string) => void;
  onSharePost: (post: FeedPost) => void;
}) {
  return (
    <View>
      {/* Triple-card status grid */}
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16 }}>
        {SALA_METRICS.map(m => (
          <View key={m.label} style={{ ...GLASS, flex: 1, borderRadius: 16, padding: 12, minHeight: 84, justifyContent: "space-between" }}>
            <Text style={{ fontSize: 8, letterSpacing: 1, fontWeight: "bold", color: SILVER, textTransform: "uppercase" }}>
              {m.label}
            </Text>
            <Text className="font-black" style={{ fontSize: 24, color: "#fff" }}>{m.value}</Text>
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 0.5, color: m.accent }}>{m.sub}</Text>
          </View>
        ))}
      </View>

      {/* Stream header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 24, marginBottom: 12 }}>
        <View>
          <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5 }}>
            STREAM DE ACTIVIDAD
          </Text>
          <Text style={{ fontSize: 9, color: SILVER, marginTop: 1 }}>
            Real-time performance telemetry from the field
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <MotiView
            from={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 700, loop: true, repeatReverse: true }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#ef4444" }} />
          </MotiView>
          <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: "#ef4444" }}>LIVE</Text>
        </View>
      </View>

      {/* Post stream — glassmorphic items with masked photography */}
      {posts.map(post => {
        const isLiked = liked.has(post.id);
        const commentsOpen = expandedComments.has(post.id);
        return (
          <View
            key={post.id}
            style={{
              backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
              borderRadius: 16, marginHorizontal: 20, marginBottom: 14, overflow: "hidden",
            }}
          >
            {post.img && (
              <ImageBackground source={{ uri: post.img }} resizeMode="cover" style={{ height: 150, justifyContent: "flex-end" }}>
                <FeedShade />
                <View
                  style={{
                    position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)",
                    borderWidth: 1, borderColor: "rgba(204,255,0,0.4)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  }}
                >
                  <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: VOLT }}>{post.badge}</Text>
                </View>
                <View style={{ padding: 12 }}>
                  <Text className="font-black uppercase" style={{ fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>
                    {post.exercise}
                  </Text>
                </View>
              </ImageBackground>
            )}
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text className="font-black" style={{ fontSize: 11, color: VOLT, letterSpacing: 0.5 }}>@{post.handle}</Text>
                <Text style={{ fontSize: 9, color: SILVER }}>{post.time}</Text>
              </View>
              <Text style={{ fontSize: 12, lineHeight: 17, color: "#d4d4d8" }}>{post.comment}</Text>

              {post.extraImages && post.extraImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
                  {post.extraImages.map((uri, i) => (
                    <Image key={uri + i} source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                  ))}
                </ScrollView>
              )}

              {post.audioUri && <FeedPostAudioChip uri={post.audioUri} />}

              {post.telemetry && (
                <View
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, padding: 12, borderRadius: 12,
                    backgroundColor: "rgba(204,255,0,0.06)", borderWidth: 1, borderColor: "rgba(204,255,0,0.3)",
                  }}
                >
                  <Award size={18} color={VOLT} />
                  <View>
                    <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: SILVER }}>{post.telemetry.label}</Text>
                    <Text className="font-black" style={{ fontSize: 15, color: "#fff" }}>{post.telemetry.value} <Text style={{ fontSize: 9, color: VOLT }}>{post.telemetry.sub}</Text></Text>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 18, marginTop: 12 }}>
                <Pressable onPress={() => onToggleLike(post.id)} style={{ flexDirection: "row", alignItems: "center", gap: 5 }} hitSlop={8}>
                  <Heart size={14} color={isLiked ? VOLT : SILVER} fill={isLiked ? VOLT : "transparent"} />
                  <Text className="font-bold" style={{ fontSize: 11, color: isLiked ? VOLT : SILVER }}>{post.likes}</Text>
                </Pressable>
                <Pressable onPress={() => onToggleComments(post.id)} style={{ flexDirection: "row", alignItems: "center", gap: 5 }} hitSlop={8}>
                  <MessageCircle size={14} color={commentsOpen ? VOLT : SILVER} />
                  <Text className="font-bold" style={{ fontSize: 11, color: commentsOpen ? VOLT : SILVER }}>{post.commentsList.length}</Text>
                </Pressable>
                <Pressable onPress={() => onSharePost(post)} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" }} hitSlop={8}>
                  <Share2 size={14} color={SILVER} />
                </Pressable>
              </View>
              {commentsOpen && <PostCommentsSection post={post} onAddComment={onAddComment} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Z2 · DMS — bandeja de mensajes directos entre "amigos" del ecosistema.
// Contactos = SALA_ROSTER (los mismos perfiles ya seedeados para RANKING/
// ROSTER), con buscador por nombre. Abrir un contacto lanza ChatThreadModal
// (virtualizado — ese sí puede crecer largo con el tiempo). ─────────────────
function DMsTab({ threads, search, onSearch, onOpenContact }: {
  threads: Record<number, ChatMessage[]>; search: string; onSearch: (q: string) => void;
  onOpenContact: (contactId: number) => void;
}) {
  const contacts = SALA_ROSTER.filter(m => !m.isMe && m.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 12, height: 42, marginBottom: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
        <Search size={14} color={SILVER} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Buscar amigos..."
          placeholderTextColor="#52525b"
          style={{ flex: 1, color: "#fff", fontSize: 13 }}
        />
      </View>
      {contacts.length === 0 ? (
        <Text style={{ fontSize: 12, color: SILVER, textAlign: "center", marginTop: 20 }}>Sin resultados.</Text>
      ) : (
        contacts.map(c => {
          const thread = threads[c.id] ?? [];
          const last = thread[thread.length - 1];
          const unread = thread.length > 0 && !last?.mine;
          return (
            <Pressable
              key={c.id}
              onPress={() => onOpenContact(c.id)}
              style={{ ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <AvatarRing member={c} size={40} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }} numberOfLines={1}>{c.name}</Text>
                  {c.isOnline && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" }} />}
                </View>
                <Text className="font-mono" style={{ fontSize: 10, color: SILVER, marginTop: 2 }} numberOfLines={1}>
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
    </View>
  );
}

// ── Z3 · Compartir — BottomSheet interno con amigos recientes + grupos. ─────
function ShareBottomSheet({ visible, onClose, onSelect }: {
  visible: boolean; onClose: () => void; onSelect: (contactId: number) => void;
}) {
  const contacts = SALA_ROSTER.filter(m => !m.isMe);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.75)" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ backgroundColor: "#0F0F10", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "60%" }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 }} />
          <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", marginBottom: 14 }}>Compartir con</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {contacts.map(c => (
              <Pressable
                key={c.id}
                onPress={() => onSelect(c.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
              >
                <AvatarRing member={c} size={40} />
                <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── B · RANKING ───────────────────────────────────────────────────────────────
function PodiumCard({ member, height, center }: { member: RosterMember; height: number; center?: boolean }) {
  const rankColor = member.rnk === 1 ? VOLT : member.rnk === 2 ? CYAN : "#808080";
  return (
    <View
      style={{
        flex: 1, height, borderRadius: 16, alignItems: "center", justifyContent: "flex-end",
        paddingBottom: 12, paddingTop: 12,
        backgroundColor: center ? "rgba(204,255,0,0.04)" : "rgba(255,255,255,0.03)",
        borderWidth: 1, borderColor: center ? "rgba(204,255,0,0.25)" : "rgba(255, 255, 255, 0.06)",
        // #1 gets the external cyan neon halo; siblings stay matte.
        ...(center ? { shadowColor: CYAN, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 10 } : null),
      }}
    >
      <AvatarRing member={member} size={center ? 56 : 44} ringColor={center ? VOLT : undefined} glowColor={center ? CYAN : undefined} />
      <Text className="font-black" style={{ fontSize: 22, color: rankColor, marginTop: 8 }}>#{member.rnk}</Text>
      <Text className="font-black uppercase text-center" style={{ fontSize: 9, color: "#fff", letterSpacing: 0.3, paddingHorizontal: 4 }} numberOfLines={1}>
        {member.name}
      </Text>
      <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 2 }}>
        {member.pts.toLocaleString()} PTS
      </Text>
    </View>
  );
}

function RankingTab() {
  const [first, second, third, ...rest] = SALA_LEADERBOARD;
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ marginTop: 16 }}>
        <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5 }}>
          RANKING DE SINDICATO
        </Text>
        <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginTop: 1 }}>
          SALA: TITANS_ELITE_04
        </Text>
      </View>

      {/* Podium — 2nd · 1st (elevated) · 3rd */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 20 }}>
        <PodiumCard member={second!} height={138} />
        <PodiumCard member={first!} height={176} center />
        <PodiumCard member={third!} height={116} />
      </View>

      {/* Ranks 4+ — the isMe row carries the TU POSICIÓN rail */}
      <View style={{ marginTop: 24, gap: 10 }}>
        {rest.map(m => m.isMe ? (
          <View
            key={m.id}
            style={{
              ...GLASS, borderWidth: 1.5, borderColor: VOLT, borderRadius: 16, padding: 14, paddingTop: 18,
            }}
          >
            <View
              style={{
                position: "absolute", top: -9, left: 14, backgroundColor: VOLT,
                borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2,
              }}
            >
              <Text className="font-black" style={{ fontSize: 8, letterSpacing: 1, color: "#000" }}>TU POSICIÓN</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text className="font-black" style={{ fontSize: 18, color: VOLT }}>#{m.rnk}</Text>
              <AvatarRing member={m} size={40} />
              <View style={{ flex: 1 }}>
                <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff" }}>{m.name}</Text>
                <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 1 }}>
                  {m.kcal.toLocaleString()} KCAL · {m.sets} SETS
                </Text>
              </View>
            </View>
            {/* Segmented weekly performance bar — [1,1,1,1,0] */}
            <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
              {[1, 1, 1, 1, 0].map((on, i) => (
                <View key={i} style={{ flex: 1, height: 5, borderRadius: 2.5, backgroundColor: on ? VOLT : "#2C2C2E" }} />
              ))}
            </View>
          </View>
        ) : (
          <View key={m.id} style={{ ...GLASS, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text className="font-black" style={{ fontSize: 16, color: SILVER }}>#{m.rnk}</Text>
            <AvatarRing member={m} size={36} />
            <View style={{ flex: 1 }}>
              <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff" }}>{m.name}</Text>
            </View>
            <Text className="font-mono" style={{ fontSize: 10, color: SILVER }}>{m.pts.toLocaleString()} PTS</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── C · RETOS ─────────────────────────────────────────────────────────────────
function RetosTab({
  selectedAthlete, onSelectAthlete, modality, onSetModality, stake, onSetStake,
  walletBalance, liveStakes, onLaunch,
}: {
  selectedAthlete: string;
  onSelectAthlete: (name: string) => void;
  modality: string;
  onSetModality: (m: string) => void;
  stake: number;
  onSetStake: (n: number) => void;
  walletBalance: number;
  liveStakes: LiveStake[];
  onLaunch: () => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  const rivals   = SALA_ROSTER.filter(m => !m.isMe);
  const preset   = CHALLENGE_MODALITIES.find(m => m.id === modality);
  const modalityLabel = preset ? `${preset.emoji} ${preset.label}` : modality ? `🎯 ${modality}` : "⚡ SELECCIONAR MODALIDAD";
  const canLaunch = selectedAthlete !== "" && modality !== "" && stake <= walletBalance;
  const gateHint  = !selectedAthlete ? "Selecciona un rival"
    : !modality ? "Define la modalidad del reto"
    : "Saldo insuficiente — ajusta el monto";

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5 }}>
            ⚡ RETOS TÁCTICOS
          </Text>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginTop: 1 }}>
            ARENA 1V1 · APUESTA TÁCTICA
          </Text>
        </View>
        <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.5, color: VOLT }}>
          SALDO: $ {walletBalance.toLocaleString()}
        </Text>
      </View>

      {/* ── Builder card ── */}
      <View style={{ ...GLASS, borderRadius: 20, padding: 16, marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
          <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", letterSpacing: 0.8 }}>
            ⚡ CONFIGURAR DESAFÍO
          </Text>
          <Text className="font-mono" style={{ fontSize: 9, color: SILVER }}>TÁCTICA 1v1</Text>
        </View>

        {/* 01 — rival carousel */}
        <Text style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, marginBottom: 8 }}>
          01 · SELECCIONAR RIVAL
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
          {rivals.map(m => {
            const sel = selectedAthlete === m.name;
            return (
              <Pressable key={m.id} onPress={() => onSelectAthlete(sel ? "" : m.name)} style={{ alignItems: "center", width: 62 }}>
                <AvatarRing member={m} size={52} ringColor={sel ? VOLT : undefined} glowColor={sel ? VOLT : undefined} />
                <Text className="font-bold" style={{ fontSize: 7, letterSpacing: 0.3, color: sel ? VOLT : SILVER, marginTop: 5 }} numberOfLines={1}>
                  {m.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 02 — combat modality picker trigger */}
        <Text style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, marginTop: 16, marginBottom: 8 }}>
          02 · MODALIDAD DE COMBATE
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => { setCustomMode(false); setShowPicker(true); }}
          style={{
            height: 46, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1, borderColor: modality ? "rgba(204,255,0,0.4)" : "rgba(255,255,255,0.1)",
            flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14,
          }}
        >
          <Text className="font-black" style={{ fontSize: 11, letterSpacing: 0.5, color: modality ? VOLT : SILVER }}>
            {modalityLabel}
          </Text>
          <ChevronDown size={16} color={SILVER} />
        </TouchableOpacity>

        {/* 03 — stake amount */}
        <Text style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, marginTop: 16, marginBottom: 4 }}>
          03 · MONTO DE APUESTA
        </Text>
        <Text className="text-center" style={{ ...athletic, fontSize: 44, color: VOLT, marginVertical: 4 }}>
          $ {stake.toFixed(2)} USD
        </Text>
        <Text className="font-mono text-center" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginBottom: 12 }}>
          POOL TOTAL: $ {(stake * 2).toFixed(2)} USD
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["+10", () => onSetStake(Math.min(1000, stake + 10))],
             ["+50", () => onSetStake(Math.min(1000, stake + 50))],
             ["MAX", () => onSetStake(1000)],
             ["✕",   () => onSetStake(0)]] as [string, () => void][]).map(([label, fn]) => (
            <TouchableOpacity
              key={label}
              activeOpacity={0.6}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); fn(); }}
              style={{
                flex: 1, height: 38, borderRadius: 10, backgroundColor: "#252528",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Text className="font-black" style={{ fontSize: 12, color: VOLT }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Launch gate */}
        {!canLaunch && (
          <Text className="text-center" style={{ fontSize: 10, color: "#f59e0b", marginTop: 12 }}>
            ⚠ {gateHint}
          </Text>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!canLaunch}
          onPress={onLaunch}
          style={{
            backgroundColor: VOLT, borderRadius: 999, paddingVertical: 14, marginTop: 12,
            alignItems: "center", opacity: canLaunch ? 1 : 0.35,
            shadowColor: VOLT, shadowOpacity: canLaunch ? 0.35 : 0, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Text style={{ ...athletic, fontSize: 13, letterSpacing: 0.5, color: "#000" }}>
            LANZAR RETO [ ⚡ ]
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Combat monitor ── */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 }}>
        <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", letterSpacing: 0.5 }}>
          ⚔️ MONITOR DE COMBATE
        </Text>
        <Text className="font-mono" style={{ fontSize: 9, color: VOLT }}>{liveStakes.length} RETOS ACTIVOS</Text>
      </View>

      {liveStakes.length === 0 ? (
        <View style={{ ...GLASS, borderRadius: 16, padding: 20, alignItems: "center", gap: 6 }}>
          <Text className="font-mono text-center" style={{ fontSize: 10, color: SILVER }}>
            ⚔️ [ SYSTEM INTEL // ARENA VACÍA ]
          </Text>
          <Text className="font-mono text-center" style={{ fontSize: 10, color: VOLT }}>
            [ INICIAR DESAFÍO EN ROSTER → ]
          </Text>
        </View>
      ) : (
        liveStakes.map(s => {
          const inCombat = s.status === "EN COMBATE TÁCTICO";
          const myPct    = pct(s.myScore, s.myMax);
          const rivalPct = pct(s.rivalScore, s.rivalMax);
          return (
            <View key={s.id} style={{ ...GLASS, borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff" }}>
                  VS {s.opponent}
                </Text>
                <View
                  style={{
                    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
                    backgroundColor: inCombat ? "rgba(204,255,0,0.12)" : "rgba(245,158,11,0.12)",
                    borderWidth: 1, borderColor: inCombat ? "rgba(204,255,0,0.4)" : "rgba(245,158,11,0.4)",
                  }}
                >
                  <Text className="font-black" style={{ fontSize: 8, letterSpacing: 0.8, color: inCombat ? VOLT : "#f59e0b" }}>
                    {inCombat ? "EN COMBATE" : "⏳ AGUARDANDO"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text className="font-mono" style={{ fontSize: 9, color: SILVER }}>{s.modality}</Text>
                <Text className="font-mono" style={{ fontSize: 9, color: VOLT }}>$ {s.pool.toFixed(2)} USD</Text>
              </View>
              <Text style={{ fontSize: 8, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 3 }}>MI MARCA · {myPct}% completado</Text>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "#2C2C2E", marginBottom: 8 }}>
                <View style={{ width: `${myPct}%`, minWidth: myPct > 0 ? 4 : 0, height: "100%", borderRadius: 4, backgroundColor: VOLT }} />
              </View>
              <Text style={{ fontSize: 8, letterSpacing: 1, fontWeight: "bold", color: SILVER, marginBottom: 3 }}>RIVAL · {rivalPct}% completado</Text>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "#2C2C2E" }}>
                <View style={{ width: `${rivalPct}%`, minWidth: rivalPct > 0 ? 4 : 0, height: "100%", borderRadius: 4, backgroundColor: CYAN }} />
              </View>
            </View>
          );
        })
      )}

      {/* ── Modality picker modal ── */}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.85)", justifyContent: "center", padding: 24 }}
          onPress={() => setShowPicker(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: "#131315", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 18 }}
          >
            {!customMode ? (
              <>
                <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", letterSpacing: 0.8, marginBottom: 14 }}>
                  ⚡ MODALIDAD DE COMBATE
                </Text>
                {CHALLENGE_MODALITIES.map(m => {
                  const sel = modality === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      activeOpacity={0.7}
                      onPress={() => { onSetModality(m.id); setShowPicker(false); }}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, marginBottom: 8,
                        backgroundColor: sel ? "rgba(204,255,0,0.06)" : "rgba(255,255,255,0.03)",
                        borderWidth: 1, borderColor: sel ? VOLT : "rgba(255, 255, 255, 0.06)",
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{m.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text className="font-black" style={{ fontSize: 12, color: sel ? VOLT : "#fff" }}>{m.label}</Text>
                        <Text className="font-mono" style={{ fontSize: 8, color: SILVER, marginTop: 1 }}>{m.sub}</Text>
                      </View>
                      {sel && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: VOLT }} />}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setCustomMode(true)}
                  style={{
                    padding: 12, borderRadius: 12, alignItems: "center",
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed",
                  }}
                >
                  <Text className="font-black" style={{ fontSize: 11, letterSpacing: 0.5, color: SILVER }}>
                    CREAR RETO PERSONALIZADO
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Pressable onPress={() => setCustomMode(false)} hitSlop={8}>
                  <Text className="font-mono" style={{ fontSize: 10, color: SILVER, marginBottom: 12 }}>← VOLVER</Text>
                </Pressable>
                <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", letterSpacing: 0.8, marginBottom: 10 }}>
                  🎯 DEFINE TU MÉTRICA
                </Text>
                <TextInput
                  value={customText}
                  onChangeText={t => setCustomText(t.toUpperCase())}
                  placeholder="EJ: MÁXIMAS DOMINADAS, INGESTA AGUA..."
                  placeholderTextColor="#52525b"
                  autoFocus
                  autoCapitalize="characters"
                  className="font-black"
                  style={{
                    height: 46, borderRadius: 12, paddingHorizontal: 14, fontSize: 12, color: "#fff",
                    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                  }}
                />
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={customText.trim().length === 0}
                  onPress={() => { onSetModality(customText.trim().toUpperCase()); setCustomText(""); setCustomMode(false); setShowPicker(false); }}
                  style={{
                    backgroundColor: VOLT, borderRadius: 999, paddingVertical: 13, marginTop: 14, alignItems: "center",
                    opacity: customText.trim().length === 0 ? 0.35 : 1,
                  }}
                >
                  <Text style={{ ...athletic, fontSize: 12, color: "#000" }}>CONFIRMAR RETO PERSONALIZADO</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── D · ROSTER ────────────────────────────────────────────────────────────────
function RosterTab({ onSendChallenge }: { onSendChallenge: (name: string) => void }) {
  const [profile, setProfile] = useState<RosterMember | null>(null);
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ marginTop: 16, marginBottom: 14 }}>
        <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5 }}>
          ROSTER DE ATLETAS
        </Text>
        <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER, marginTop: 1 }}>
          {SALA_ROSTER.length} REGISTRADOS
        </Text>
      </View>

      {/* Dual-column repeating grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {SALA_ROSTER.map(m => {
          const badge = rosterBadgeStyle(m.rankBadgeTitle);
          return (
            <View
              key={m.id}
              style={{
                width: "48.2%", ...GLASS, borderRadius: 16, marginBottom: 12,
                paddingTop: 34, paddingBottom: 0, alignItems: "center", overflow: "hidden",
              }}
            >
              {/* Tier badge */}
              <View
                style={{
                  position: "absolute", top: 10, left: 10, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
                  backgroundColor: badge.bg, borderWidth: 1, borderColor: badge.border,
                }}
              >
                <Text className="font-mono" style={{ fontSize: 7, letterSpacing: 1, fontWeight: "900", color: badge.color }}>
                  {m.rankBadgeTitle}
                </Text>
              </View>

              {/* Avatar ring + online LED at perimeter base */}
              <View>
                <AvatarRing member={m} size={64} />
                <View
                  style={{
                    position: "absolute", bottom: 0, right: 2, width: 12, height: 12, borderRadius: 6,
                    backgroundColor: m.isOnline ? "#30D158" : "#52525b",
                    borderWidth: 2, borderColor: "#131315",
                    ...(m.isOnline ? { shadowColor: "#30D158", shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null),
                  }}
                />
              </View>

              <Text className="font-black uppercase text-center" style={{ fontSize: 11, color: "#fff", marginTop: 10 }} numberOfLines={1}>
                {m.name.replace(/_/g, " ")}
              </Text>
              <Text className="font-mono" style={{ fontSize: 7.5, letterSpacing: 0.5, color: SILVER, marginTop: 2 }}>
                {m.rankBadgeTitle.split(" ")[0]} · RNK #{String(m.rnk).padStart(2, "0")}
              </Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 12 }}>
                <Text className="font-mono" style={{ fontSize: 8, color: "#d4d4d8" }}>RACHA {m.rachaActiveDays}D</Text>
                <Text className="font-mono" style={{ fontSize: 8, color: "#d4d4d8" }}>{m.pts.toLocaleString()} PTS</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setProfile(m)}
                style={{
                  width: "100%", paddingVertical: 10, alignItems: "center",
                  borderTopWidth: 1, borderTopColor: "rgba(255, 255, 255, 0.06)",
                }}
              >
                <Text className="font-black" style={{ fontSize: 9, letterSpacing: 1, color: VOLT }}>VER PERFIL ⚡</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* ── Elite athlete profile overlay ── */}
      <Modal visible={profile !== null} transparent animationType="slide" onRequestClose={() => setProfile(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.95)", padding: 24, paddingTop: insets.top + 24 }}>
          {profile && (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: SILVER }}>
                  PERFIL DE ATLETA DE ÉLITE
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setProfile(null)}
                  style={{ borderWidth: 1, borderColor: VOLT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}
                >
                  <Text className="font-black" style={{ fontSize: 10, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
                </TouchableOpacity>
              </View>

              <View style={{ alignItems: "center", marginBottom: 24 }}>
                <AvatarRing member={profile} size={96} ringColor="rgba(204,255,0,0.3)" />
                <Text className="font-black uppercase" style={{ fontSize: 20, color: "#fff", marginTop: 12 }}>
                  {profile.name.replace(/_/g, " ")}
                </Text>
                <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: VOLT, marginTop: 4 }}>
                  {profile.rankBadgeTitle} · RNK #{String(profile.rnk).padStart(2, "0")}
                </Text>
              </View>

              {/* 2×2 telemetry tiles */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                {[
                  ["RACHA ACTIVA", `${profile.rachaActiveDays} DÍAS`],
                  ["ESTADO", profile.isOnline ? "EN LÍNEA" : "OFFLINE"],
                  ["PTS TOTALES", profile.pts.toLocaleString()],
                  ["KCAL ACUMULADAS", profile.kcal.toLocaleString()],
                ].map(([label, value]) => (
                  <View key={label} style={{ width: "48.2%", ...GLASS, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <Text style={{ fontSize: 8, letterSpacing: 1, fontWeight: "bold", color: SILVER }}>{label}</Text>
                    <Text className="font-black" style={{ fontSize: 16, color: "#fff", marginTop: 4 }}>{value}</Text>
                  </View>
                ))}
              </View>

              {/* PRs */}
              <View style={{ ...GLASS, borderRadius: 12, padding: 14, marginTop: 4 }}>
                <Text className="font-black" style={{ fontSize: 10, letterSpacing: 1, color: "#fff", marginBottom: 10 }}>
                  🏆 PRs REGISTRADOS
                </Text>
                {[
                  ["MAX DEADLIFT", `${profile.prs.maxDeadlift} KG`],
                  ["MAX SQUAT", `${profile.prs.maxSquat} KG`],
                  ["BENCH PRESS", `${profile.prs.benchPress} KG`],
                  ["KCAL RECORD", `${profile.prs.kcalRecord.toLocaleString()} KCAL`],
                ].map(([label, value]) => (
                  <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
                    <Text className="font-mono" style={{ fontSize: 9, color: SILVER }}>{label}</Text>
                    <Text className="font-black" style={{ fontSize: 10, color: VOLT }}>{value}</Text>
                  </View>
                ))}
              </View>

              {/* Cross-view transition: preload the Retos builder with this rival */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { const name = profile.name; setProfile(null); onSendChallenge(name); }}
                style={{
                  backgroundColor: VOLT, borderRadius: 999, paddingVertical: 15, marginTop: 20, alignItems: "center",
                  shadowColor: VOLT, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
                }}
              >
                <Text style={{ ...athletic, fontSize: 13, color: "#000" }}>ENVIAR RETO</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── E · AVISOS ────────────────────────────────────────────────────────────────
function AvisosTab({ notices }: { notices: ServerNotice[] }) {
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <View>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1.5, color: SILVER }}>CANAL DE INSTRUCCIÓN</Text>
          <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5, marginTop: 1 }}>AVISOS</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <MotiView
            from={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 700, loop: true, repeatReverse: true }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#ef4444" }} />
          </MotiView>
          <Text className="font-black" style={{ fontSize: 8, letterSpacing: 0.8, color: "#ef4444" }}>
            EN DIRECTO • {SALA_ROSTER.length} ACTIVOS
          </Text>
        </View>
      </View>

      {/* Pinned coach directive — hardcoded per blueprint (SALA_AVISOS id 1) */}
      <View
        style={{
          backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.35)",
          borderRadius: 16, padding: 16,
          shadowColor: "#ef4444", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}>
              <Text className="font-black" style={{ fontSize: 12, color: "#fff" }}>CL</Text>
            </View>
            <View>
              <Text className="font-black" style={{ fontSize: 11, color: "#fff", letterSpacing: 0.5 }}>{PINNED_AVISO.sender}</Text>
              <Text className="font-mono" style={{ fontSize: 8, color: SILVER, marginTop: 1 }}>{PINNED_AVISO.time}</Text>
            </View>
          </View>
          <View style={{ backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text className="font-black" style={{ fontSize: 8, letterSpacing: 1, color: "#f87171" }}>FIJADO</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: "#e4e4e7", fontWeight: "600" }}>
          {PINNED_AVISO.content}
        </Text>
        <View
          style={{
            flexDirection: "row", gap: 14, marginTop: 12, alignSelf: "flex-start",
            backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 10, color: "#d4d4d8" }}>🔥 {PINNED_AVISO.fire}</Text>
          <Text style={{ fontSize: 10, color: "#d4d4d8" }}>💪 {PINNED_AVISO.arm}</Text>
        </View>
      </View>

      {/* Real notice history — GET /api/mobile/community/notices */}
      <Text style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: "bold", color: SILVER, marginTop: 20, marginBottom: 10 }}>
        HISTORIAL DE INSTRUCCIONES
      </Text>
      {notices.length === 0 ? (
        <Text className="font-mono" style={{ fontSize: 10, color: SILVER }}>
          {"// SIN INSTRUCCIONES DEL COACH"}
        </Text>
      ) : (
        notices.map(n => (
          <View key={n.id} style={{ ...GLASS, borderRadius: 16, padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: CYAN, alignItems: "center", justifyContent: "center" }}>
                  <Text className="font-black" style={{ fontSize: 10, color: "#000" }}>{initialsOf(n.senderName)}</Text>
                </View>
                <Text className="font-black" style={{ fontSize: 10, color: "#fff", letterSpacing: 0.5 }}>
                  {n.senderName.toUpperCase()}
                </Text>
              </View>
              <Text className="font-mono" style={{ fontSize: 8, color: SILVER }}>{noticeDate(n.createdAt)}</Text>
            </View>
            <Text style={{ fontSize: 12, lineHeight: 17, color: "#d4d4d8" }}>{n.content}</Text>
          </View>
        ))
      )}

      {/* Performance micro-grid (hardcoded per blueprint) */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1, ...GLASS, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 8, letterSpacing: 1, fontWeight: "bold", color: SILVER }}>RENDIMIENTO</Text>
          <Text className="font-black" style={{ fontSize: 18, color: VOLT, marginTop: 2 }}>+12%</Text>
        </View>
        <View style={{ flex: 1, ...GLASS, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 8, letterSpacing: 1, fontWeight: "bold", color: SILVER }}>CONSISTENCIA</Text>
          <Text className="font-black" style={{ fontSize: 18, color: CYAN, marginTop: 2 }}>98%</Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SYNDICATE DASHBOARD SHELL — banner + horizontal sub-tab strip
// ══════════════════════════════════════════════════════════════════════════════
function SyndicateDashboard({ roomName, activeTab, onTab, onLeave, isLeaving, onBack, children }: {
  roomName: string;
  activeTab: RoomTabId;
  onTab: (t: RoomTabId) => void;
  onLeave: () => void;
  isLeaving: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* Room banner — custom back button replaces the hidden LuxuryDock as
          the only exit from Salas (app/(portal)/_layout.tsx hides the dock
          strictly for this whole tab, index + chat). */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onBack}
            hitSlop={10}
            style={{
              width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            <ChevronLeft size={16} color="#fff" />
          </TouchableOpacity>
          <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}>
            <Svg width={34} height={34} viewBox="0 0 62 62" style={StyleSheet.absoluteFill}>
              <Polygon points="31,3 59,31 31,59 3,31" stroke={VOLT} strokeWidth={3} fill="none" />
            </Svg>
            <Text style={{ ...athletic, fontSize: 13, color: VOLT }}>F</Text>
          </View>
          <View>
            <Text className="font-black uppercase" style={{ fontSize: 13, color: "#fff", letterSpacing: 0.5 }} numberOfLines={1}>
              {roomName}
            </Text>
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1.5, color: VOLT }}>
              HIGH PERFORMANCE UNIT
            </Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onLeave}
          disabled={isLeaving}
          style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text className="font-bold" style={{ fontSize: 10, letterSpacing: 0.8, color: "#a1a1aa" }}>
            {isLeaving ? "..." : "SALIR ✕"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal sub-tab strip — white active label over a volt indicator line */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 22 }}>
          {ROOM_TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <Pressable
                key={id}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); onTab(id); }}
                style={{ alignItems: "center", paddingTop: 8 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingBottom: 9 }}>
                  <Icon size={13} color={active ? "#fff" : "#71717a"} />
                  <Text className="font-black" style={{ fontSize: 11, letterSpacing: 1, color: active ? "#fff" : "#71717a" }}>
                    {label}
                  </Text>
                </View>
                <View style={{ height: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: active ? VOLT : "transparent" }} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        {children}
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCREEN — the LOBBY ⇄ ROOM_ACTIVE view exchanger
// ══════════════════════════════════════════════════════════════════════════════
export default function SalasScreen() {
  const { token } = useAuth();
  const { student } = usePortal();
  const router = useRouter();
  const goBack = useCallback(() => { triggerImpact(); router.replace("/"); }, [router]);

  // ── Rigid top-level state machine ─────────────────────────────────────────
  const [currentView, setCurrentView] = useState<"LOBBY" | "ROOM_ACTIVE">("LOBBY");
  const [activeTab,   setActiveTab]   = useState<RoomTabId>("FEED");

  // ── Lobby gate state (blueprint §2.2) ─────────────────────────────────────
  const [publicRooms,   setPublicRooms]   = useState<PublicRoom[]>([]);
  const [currentRoom,   setCurrentRoom]   = useState<CurrentRoom>(null);
  const [roomsLoading,  setRoomsLoading]  = useState(true);
  const [roomsFetchErr, setRoomsFetchErr] = useState<"AUTH" | "NET" | null>(null);
  // True only when NET failure was recovered from a cached snapshot instead
  // of a live response — AUTH failures and the empty-cache NET case still
  // show the existing full-screen error state, not silently masked.
  const [isOffline, setIsOffline] = useState(false);
  const [codeInput,   setCodeInput]   = useState("");
  const [codeError,   setCodeError]   = useState(false);
  const [codeSuccess, setCodeSuccess] = useState(false);
  const [isJoining,   setIsJoining]   = useState(false);
  const [joinError,   setJoinError]   = useState<string | null>(null);
  const [isLeaving,   setIsLeaving]   = useState(false);

  // ── Room modules state ────────────────────────────────────────────────────
  const [serverNotices, setServerNotices] = useState<ServerNotice[]>([]);
  const [likedActivity, setLikedActivity] = useState<Set<number>>(new Set());
  const [activityFeed,  setActivityFeed]  = useState<FeedPost[]>(SALA_ACTIVITY_FEED);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [selectedAthlete,   setSelectedAthlete]   = useState("");
  const [challengeModality, setChallengeModality] = useState("");
  const [stakeAmount,       setStakeAmount]       = useState(50);
  const [liveStakes,        setLiveStakes]        = useState<LiveStake[]>(SEED_STAKES);
  const [walletBalance,     setWalletBalance]     = useState(0);

  // ── Módulo 5: chat grupal, DMs y compartición — sin backend de mensajería
  // real (schema de mycouch solo tiene GroupMessage, coach-only-write, sin
  // modelo de Conversation/DirectMessage), así que todo esto es client-
  // simulated y persistido localmente (AsyncStorage), igual que el resto de
  // este módulo (blueprint §1.8). El XP que otorga SÍ es real
  // (useGamification().addXP), solo el "envío" del mensaje es local. ────────
  const { addXP, totalXP, currentRank } = useGamification();
  const { xpToastAmount, showXPToast } = useXPToast();
  const [dmThreads, setDmThreads] = useState<Record<number, ChatMessage[]>>({});
  const [activeDmContactId, setActiveDmContactId] = useState<number | null>(null);
  const [dmSearch, setDmSearch] = useState("");
  const [shareSheetPost, setShareSheetPost] = useState<FeedPost | null>(null);
  const [showCreator, setShowCreator] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("mc:room_dm_threads").then(raw => { if (raw) setDmThreads(JSON.parse(raw)); }).catch(() => {});
  }, []);

  const rewardMessageXP = useCallback(() => {
    addXP(5);
    showXPToast(5);
  }, [addXP, showXPToast]);

  const sendDirectMessage = useCallback((contactId: number, text: string) => {
    const msg: ChatMessage = { id: `${Date.now()}`, senderName: student?.name?.split(" ")[0] || "Tú", text, mine: true, createdAt: new Date().toISOString() };
    setDmThreads(prev => {
      const next = { ...prev, [contactId]: [...(prev[contactId] ?? []), msg] };
      AsyncStorage.setItem("mc:room_dm_threads", JSON.stringify(next)).catch(() => {});
      return next;
    });
    triggerImpact();
    rewardMessageXP();
  }, [student?.name, rewardMessageXP]);

  // ── Toast rail ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, ms = 2600) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Compartición — inyecta una tarjeta enriquecida del post (deep-link local
  // por post.id) directamente en el hilo del DM elegido. Mismo mecanismo de
  // envío que un mensaje de texto normal (misma recompensa de XP, coherente
  // con "cada mensaje enviado con éxito" del engagement engine).
  const shareToContact = useCallback((contactId: number) => {
    if (!shareSheetPost) return;
    const post = shareSheetPost;
    const msg: ChatMessage = {
      id: `${Date.now()}`, senderName: student?.name?.split(" ")[0] || "Tú", mine: true, createdAt: new Date().toISOString(),
      text: "Mira esto 👀",
      sharedPost: { authorHandle: post.handle, exercise: post.exercise, badge: post.badge, img: post.img },
    };
    setDmThreads(prev => {
      const next = { ...prev, [contactId]: [...(prev[contactId] ?? []), msg] };
      AsyncStorage.setItem("mc:room_dm_threads", JSON.stringify(next)).catch(() => {});
      return next;
    });
    setShareSheetPost(null);
    triggerSuccess();
    showToast("Publicación compartida");
  }, [shareSheetPost, student?.name, showToast]);

  // Last resort when a live fetch fails outright: hydrate from whatever
  // snapshot was cached on the last successful load, rather than a blank or
  // crashed lobby. Returns whether a usable snapshot was found.
  const loadRoomsFromCache = useCallback(async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(ROOMS_CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw) as RoomsSnapshot;
      setPublicRooms(Array.isArray(cached.rooms) ? cached.rooms : []);
      setCurrentRoom(cached.currentRoom ?? null);
      setIsOffline(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Public rooms directory — fires while the gate shows ──────────────────
  const fetchRooms = useCallback(() => {
    if (!token) { setRoomsLoading(false); return; }
    setRoomsLoading(true);
    setRoomsFetchErr(null);
    setIsOffline(false);
    fetch(`${BASE_URL}/api/community/public-rooms`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (r.status === 403 || r.status === 401) { setRoomsFetchErr("AUTH"); return null; }
        if (!r.ok) {
          // Non-auth failure (bad gym Wi-Fi, 5xx, timeout-ish) — try the
          // cache before surfacing the full-screen NET error state.
          if (!(await loadRoomsFromCache())) setRoomsFetchErr("NET");
          return null;
        }
        return r.json() as Promise<{ rooms: PublicRoom[]; currentRoom: CurrentRoom }>;
      })
      .then(d => {
        if (!d) return;
        const rooms = Array.isArray(d.rooms) ? d.rooms : [];
        const room  = d.currentRoom ?? null;
        setPublicRooms(rooms);
        setCurrentRoom(room);
        if (room) setCurrentView("ROOM_ACTIVE");   // already linked → skip the gate
        // Snapshot this success for the next offline fallback.
        AsyncStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify({ rooms, currentRoom: room })).catch(() => {});
      })
      .catch(async () => {
        if (!(await loadRoomsFromCache())) setRoomsFetchErr("NET");
      })
      .finally(() => setRoomsLoading(false));
  }, [token, loadRoomsFromCache]);

  useEffect(() => { if (currentView === "LOBBY") fetchRooms(); }, [currentView, fetchRooms]);

  // Wallet hydration — walletBalance is not in the mobile portal payload,
  // so this tries the web /api/me contract (Bearer-accepted) and degrades to 0.
  useEffect(() => {
    if (!token) return;
    api<{ student?: { walletBalance?: number } }>("/api/me", { token })
      .then(d => setWalletBalance(d.student?.walletBalance ?? 0))
      .catch(() => {});
  }, [token]);

  // ── executeJoin — blueprint §2.2 transition script ────────────────────────
  const executeJoin = useCallback(async (payload: { code?: string; roomId?: string }) => {
    setIsJoining(true);
    setJoinError(null);
    setCodeError(false);
    setCodeSuccess(false);
    const result = await joinCommunityRoom(payload, token);
    setIsJoining(false);

    if (result.ok) {
      setServerNotices((result.notices ?? []).filter(n => n.role === "COACH"));
      if (result.coachName) setCurrentRoom({ id: "", name: result.coachName });
      setCodeSuccess(true);
      setCodeInput("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // 800 ms so "⚡ VERIFICADO · ACCESO CONCEDIDO" is visible before the swap.
      setTimeout(() => { setCurrentView("ROOM_ACTIVE"); setActiveTab("FEED"); setCodeSuccess(false); }, 800);
    } else {
      setJoinError(result.error ?? "ERROR_DESCONOCIDO");
      setCodeError(true);
      showToast(result.error ?? "ERROR_DESCONOCIDO");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [token, showToast]);

  const injectCode = useCallback(() => {
    const code = codeInput.trim();
    if (!code) { setCodeError(true); setJoinError(null); return; }   // local validation, no network
    void executeJoin({ code });
  }, [codeInput, executeJoin]);

  const handleLeave = useCallback(async () => {
    setIsLeaving(true);
    try { await api("/api/student/leave-room", { method: "POST", token: token ?? undefined }); }
    catch { /* history preserved server-side; the gate refetch reconciles */ }
    setIsLeaving(false);
    setCurrentRoom(null);
    setCodeSuccess(false);
    setCurrentView("LOBBY");
  }, [token]);

  // ── AVISOS hydration when the tab opens ──────────────────────────────────
  useEffect(() => {
    if (currentView !== "ROOM_ACTIVE" || activeTab !== "AVISOS" || !token) return;
    api<ServerNotice[]>("/api/mobile/community/notices", { token })
      .then(msgs => { if (Array.isArray(msgs)) setServerNotices(msgs.filter(m => m.role === "COACH")); })
      .catch(() => {});
  }, [currentView, activeTab, token]);

  // ── FEED like toggle ──────────────────────────────────────────────────────
  const toggleLike = useCallback((id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const liked = likedActivity.has(id);
    setLikedActivity(prev => {
      const next = new Set(prev);
      if (liked) next.delete(id); else next.add(id);
      return next;
    });
    setActivityFeed(feed => feed.map(p => p.id === id ? { ...p, likes: p.likes + (liked ? -1 : 1) } : p));
  }, [likedActivity]);

  // ── FEED composer/comentarios — client-simulated, mismo alcance que el
  // resto del módulo Salas (blueprint §1.8: sin endpoints reales de feed/
  // roster/challenges en el backend). Prepend, no append: un post nuevo debe
  // verse de inmediato arriba del stream, no perdido al fondo. ────────────
  const myHandle = (student?.name ?? "ATLETA").split(" ")[0]!.toUpperCase();

  const createPost = useCallback((text: string, images: string[], audioUri: string | null, telemetry: TelemetryCard | null) => {
    const newPost: FeedPost = {
      id: Date.now(), handle: myHandle, time: "Ahora", exercise: telemetry ? telemetry.label : "Publicación",
      badge: telemetry ? telemetry.value : "NUEVO",
      img: images[0] ?? null, extraImages: images.length > 1 ? images.slice(1) : undefined,
      audioUri, telemetry,
      likes: 0, comment: text, commentsList: [],
    };
    setActivityFeed(feed => [newPost, ...feed]);
    triggerSuccess();
  }, [myHandle]);

  // Carrusel de telemetría del FAB — 100% datos reales del alumno (PRs +
  // rango activo), nunca simulados.
  const telemetryCards: TelemetryCard[] = [
    { label: "PR DEADLIFT", value: `${student?.prDeadlift ?? 0}`, sub: "KG" },
    { label: "PR SQUAT",    value: `${student?.prSquat ?? 0}`,    sub: "KG" },
    { label: "PR BENCH",    value: `${student?.prBench ?? 0}`,    sub: "KG" },
    { label: "RANGO ACTUAL", value: currentRank, sub: `${totalXP} XP` },
    { label: "RACHA ACTIVA", value: `${student?.streak ?? 0}`, sub: "DÍAS" },
  ];

  const toggleComments = useCallback((postId: number) => {
    triggerImpact();
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  }, []);

  const addComment = useCallback((postId: number, text: string) => {
    triggerImpact();
    setActivityFeed(feed => feed.map(p => p.id === postId
      ? { ...p, commentsList: [...p.commentsList, { id: Date.now(), handle: myHandle, text }] }
      : p));
  }, [myHandle]);

  // ── RETOS: real wallet debit + local stake prepend + acceptance simulator ─
  const launchDebit = useCallback(async (amount: number): Promise<boolean> => {
    if (amount > walletBalance) return false;                 // client solvency pre-check
    if (amount === 0) return true;                            // $0 friendly duel — nothing to escrow
    setWalletBalance(prev => prev - amount);                  // optimistic debit
    try {
      const d = await api<{ walletBalance: number }>("/api/me/wallet", { method: "PATCH", token: token ?? undefined, body: { delta: -amount } });
      setWalletBalance(d.walletBalance);                      // server value wins
      return true;
    } catch (e) {
      setWalletBalance(prev => prev + amount);                // refund
      showToast(e instanceof TypeError ? "⚠️ Sin conexión — apuesta no debitada." : "⚠️ Saldo insuficiente — desafío no lanzado.");
      return false;
    }
  }, [walletBalance, token, showToast]);

  const launchChallenge = useCallback(async () => {
    const ok = await launchDebit(stakeAmount);
    if (!ok) return;
    const rival = SALA_ROSTER.find(m => m.name === selectedAthlete);
    setLiveStakes(prev => [{
      id: Date.now(),
      opponent: selectedAthlete,
      opponentColor: rival?.avatarBgColor ?? "",
      modality: CHALLENGE_MODALITIES.find(m => m.id === challengeModality)?.label ?? challengeModality,
      pool: stakeAmount * 2,
      myScore: 0, rivalScore: 0,
      myMax: stakeAmount * 2, rivalMax: stakeAmount * 2,
      status: "PENDIENTE",
    }, ...prev]);
    setSelectedAthlete("");
    setChallengeModality("");
    setStakeAmount(50);
    showToast("DESAFÍO TÁCTICO LANZADO • ESPERANDO APROBACIÓN", 2200);
  }, [launchDebit, stakeAmount, selectedAthlete, challengeModality, showToast]);

  // Rival acceptance simulator — one 3500 ms timer per PENDIENTE stake.
  const acceptTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    liveStakes.filter(s => s.status === "PENDIENTE").forEach(s => {
      if (acceptTimers.current[s.id]) return;
      acceptTimers.current[s.id] = setTimeout(() => {
        setLiveStakes(prev => prev.map(x => x.id === s.id ? { ...x, status: "EN COMBATE TÁCTICO" } : x));
        showToast("⚔️ ¡EL RIVAL ACEPTÓ TU DESAFÍO — COMBATE INICIADO!", 3000);
        delete acceptTimers.current[s.id];
      }, 3500);
    });
  }, [liveStakes, showToast]);
  useEffect(() => {
    const timers = acceptTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  // ROSTER "ENVIAR RETO" — cross-view transition into the preloaded builder.
  const sendChallengeTo = useCallback((name: string) => {
    setSelectedAthlete(name);
    setActiveTab("RETOS");
  }, []);

  // CHAT dejó de ser un tab embebido (Módulo 2) — ahora es una pantalla
  // propia (app/(portal)/salas/chat.tsx), nested bajo "salas" para poder
  // ocultar el dock igual que exercise/[id]. Tocar el tab CHAT navega en vez
  // de intercambiar contenido inline.
  const handleTabPress = useCallback((t: RoomTabId) => {
    if (t === "CHAT") { triggerImpact(); router.push("/salas/chat"); return; }
    setActiveTab(t);
  }, [router]);

  const profileInitials = student?.name ? initialsOf(student.name) : "23";
  const roomName = (currentRoom?.name ?? "FELLS TEAM PRO").toUpperCase();

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: OLED }}>
      {currentView === "LOBBY" ? (
        <SalasLobby
          profileInitials={profileInitials}
          profileImage={student?.avatarUrl || null}
          profileName={student?.name || null}
          onBack={goBack}
          rooms={publicRooms}
          loading={roomsLoading}
          fetchErr={roomsFetchErr}
          isOffline={isOffline}
          codeInput={codeInput}
          onChangeCode={t => { setCodeInput(t); setCodeError(false); setCodeSuccess(false); setJoinError(null); }}
          codeError={codeError}
          codeSuccess={codeSuccess}
          isJoining={isJoining}
          joinError={joinError}
          onInject={injectCode}
          onJoinRoom={roomId => void executeJoin({ roomId })}
        />
      ) : (
        <SyndicateDashboard
          roomName={roomName}
          activeTab={activeTab}
          onTab={handleTabPress}
          onLeave={handleLeave}
          isLeaving={isLeaving}
          onBack={goBack}
        >
          {activeTab === "FEED"    && (
            <FeedTab
              posts={activityFeed} liked={likedActivity} onToggleLike={toggleLike}
              expandedComments={expandedComments} onToggleComments={toggleComments} onAddComment={addComment}
              onSharePost={setShareSheetPost}
            />
          )}
          {activeTab === "RANKING" && <RankingTab />}
          {activeTab === "DMS"     && (
            <DMsTab threads={dmThreads} search={dmSearch} onSearch={setDmSearch} onOpenContact={id => { triggerImpact(); setActiveDmContactId(id); }} />
          )}
          {activeTab === "RETOS"   && (
            // Pre-release lock: RETOS debits real wallet balance via a live
            // PATCH /api/me/wallet call, so this isn't ready to ship yet.
            // pointerEvents="none" on the whole subtree is a hard guarantee
            // against any tap reaching RetosTab's buttons — safer than
            // hand-disabling each control and risking missing one.
            <View style={{ flex: 1 }}>
              <View pointerEvents="none" style={{ opacity: 0.5 }}>
                <RetosTab
                  selectedAthlete={selectedAthlete}
                  onSelectAthlete={setSelectedAthlete}
                  modality={challengeModality}
                  onSetModality={setChallengeModality}
                  stake={stakeAmount}
                  onSetStake={setStakeAmount}
                  walletBalance={walletBalance}
                  liveStakes={liveStakes}
                  onLaunch={launchChallenge}
                />
              </View>
              <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <BlurView
                  intensity={25}
                  tint="dark"
                  style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
                >
                  <View
                    style={{
                      ...GLASS, borderRadius: 24, padding: 24, alignItems: "center", gap: 10, maxWidth: 320,
                      borderColor: "rgba(204,255,0,0.25)",
                    }}
                  >
                    <Zap size={22} color={VOLT} strokeWidth={1.5} />
                    <Text style={{ ...athletic, fontSize: 16, color: "#fff", textAlign: "center" }}>
                      PRÓXIMAMENTE
                    </Text>
                    <Text className="font-mono text-center" style={{ fontSize: 11, letterSpacing: 0.3, color: SILVER, lineHeight: 16 }}>
                      Próximamente podrás retar a tu comunidad
                    </Text>
                  </View>
                </BlurView>
              </View>
            </View>
          )}
          {activeTab === "ROSTER"  && <RosterTab onSendChallenge={sendChallengeTo} />}
          {activeTab === "AVISOS"  && <AvisosTab notices={serverNotices} />}
        </SyndicateDashboard>
      )}

      {/* Toast rail */}
      {toast && (
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 220 }}
          style={{
            position: "absolute", top: 64, left: 20, right: 20,
            backgroundColor: "rgba(19,19,21,0.96)", borderWidth: 1, borderColor: "rgba(0,240,255,0.35)",
            borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
            shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10,
          }}
        >
          <Text className="font-black text-center" style={{ fontSize: 11, letterSpacing: 0.5, color: "#fff" }}>
            {toast}
          </Text>
        </MotiView>
      )}

      {/* Micro-toast de XP — Módulo 5 "Sistema de Gamificación por Mensaje" */}
      <XPToast amount={xpToastAmount} topOffset={64} />

      {/* FAB de creación (Módulo 1) — círculo neón fijo, sobrevive al scroll
          porque vive fuera del ScrollView del RoomShell, como hermano
          absoluto dentro del SafeAreaView. Solo visible en el FEED de una
          sala activa — es ahí donde tiene sentido publicar. */}
      {currentView === "ROOM_ACTIVE" && activeTab === "FEED" && (
        <Pressable
          onPress={() => { triggerImpact(); setShowCreator(true); }}
          style={{
            position: "absolute", bottom: 30, right: 20, zIndex: 999,
            width: 60, height: 60, borderRadius: 30, backgroundColor: VOLT,
            alignItems: "center", justifyContent: "center",
            shadowColor: VOLT, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 12,
          }}
        >
          <Plus size={28} color="#000" strokeWidth={2.5} />
        </Pressable>
      )}

      <PostCreatorModal
        visible={showCreator}
        onClose={() => setShowCreator(false)}
        onSubmit={createPost}
        telemetryCards={telemetryCards}
      />

      <ChatThreadModal
        visible={activeDmContactId !== null}
        onClose={() => setActiveDmContactId(null)}
        title={SALA_ROSTER.find(m => m.id === activeDmContactId)?.name ?? "Chat"}
        subtitle="Mensaje directo · solo en este dispositivo"
        messages={activeDmContactId !== null ? dmThreads[activeDmContactId] ?? [] : []}
        onSend={text => { if (activeDmContactId !== null) sendDirectMessage(activeDmContactId, text); }}
        avatarColor={gradFirst(SALA_ROSTER.find(m => m.id === activeDmContactId)?.avatarBgColor ?? VOLT)}
      />

      <ShareBottomSheet
        visible={!!shareSheetPost}
        onClose={() => setShareSheetPost(null)}
        onSelect={shareToContact}
      />
    </SafeAreaView>
  );
}
