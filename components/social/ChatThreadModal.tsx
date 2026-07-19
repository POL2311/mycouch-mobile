import {
  View, Text, TextInput, TouchableOpacity, Pressable, FlatList, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useCallback } from "react";
import { Send, X, ChevronLeft } from "lucide-react-native";
import { triggerImpact } from "@/lib/haptics";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const CARD   = "#0F0F10";
const BORDER = "#2C2C2E";

export interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  mine: boolean;
  createdAt: string;
  // Módulo 5 "Compartición" — mensaje enriquecido con un post embebido
  // (deep-link local, no un servidor real de mensajería — ver README de
  // límites en salas/index.tsx). Ausente en mensajes de texto normales.
  sharedPost?: { authorHandle: string; exercise: string; badge: string; img: string | null };
}

// ── Hilo de chat reutilizable — un mismo componente sirve para el chat
// grupal, los DMs del alumno y los DMs del coach (Módulos 4/5). Ninguno de
// estos tiene persistencia real cross-device (ver notas en cada caller);
// esto solo renderiza la lista de burbujas + el input de envío. ────────────
export function ChatThreadModal({
  visible, onClose, title, subtitle, messages, onSend, avatarColor = VOLT,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  avatarColor?: string;
}) {
  const [draft, setDraft] = useState("");

  const send = useCallback(() => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  }, [draft, onSend]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "#000000" }}
      >
        <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <Pressable onPress={onClose} hitSlop={10}>
            <ChevronLeft size={22} color={SILVER} />
          </Pressable>
          <View
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: avatarColor, alignItems: "center", justifyContent: "center" }}
          >
            <Text className="font-black" style={{ fontSize: 13, color: "#000" }}>{title.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text className="font-black" style={{ fontSize: 14, color: "#fff" }} numberOfLines={1}>{title}</Text>
            {!!subtitle && <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 1 }}>{subtitle}</Text>}
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={20} color={SILVER} />
          </Pressable>
        </View>

        <FlatList
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1, justifyContent: messages.length === 0 ? "center" : "flex-start" }}
          // Listas potencialmente largas (Módulo 5) — windowing nativo de
          // FlatList en vez de un ScrollView.map, para no degradar los 60 FPS.
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <Text style={{ fontSize: 12, color: SILVER, textAlign: "center" }}>
              Sin mensajes todavía — escribe el primero.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={{ alignItems: item.mine ? "flex-end" : "flex-start" }}>
              {!item.mine && (
                <Text className="font-mono" style={{ fontSize: 9, color: VOLT, marginBottom: 2, marginLeft: 4 }}>
                  {item.senderName}
                </Text>
              )}
              <View
                style={{
                  maxWidth: "80%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9,
                  backgroundColor: item.mine ? VOLT : CARD,
                  borderWidth: item.mine ? 0 : 1, borderColor: BORDER,
                }}
              >
                {item.sharedPost && (
                  <View
                    style={{
                      borderRadius: 10, overflow: "hidden", marginBottom: 6,
                      backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", padding: 8,
                    }}
                  >
                    <Text className="font-black" style={{ fontSize: 10, color: item.mine ? "#000" : VOLT }}>
                      @{item.sharedPost.authorHandle} · {item.sharedPost.badge}
                    </Text>
                    <Text style={{ fontSize: 10, color: item.mine ? "#000" : "#d4d4d8", marginTop: 2 }}>
                      {item.sharedPost.exercise}
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: 13, color: item.mine ? "#000" : "#fff", lineHeight: 17 }}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: BORDER }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="#52525b"
            style={{ flex: 1, backgroundColor: CARD, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontSize: 13, borderWidth: 1, borderColor: BORDER }}
          />
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!draft.trim()}
            onPress={() => { triggerImpact(); send(); }}
            style={{
              width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
              backgroundColor: draft.trim() ? VOLT : "rgba(255,255,255,0.06)",
            }}
          >
            <Send size={16} color={draft.trim() ? "#000" : SILVER} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
