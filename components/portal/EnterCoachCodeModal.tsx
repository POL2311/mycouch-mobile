import React, { useState } from "react";
import { View, Text, Modal, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Search } from "lucide-react-native";
import { useAuth } from "@/lib/session";
import { joinCommunityRoom } from "@/lib/portal";
import { triggerImpact, triggerSuccess, triggerWarning } from "@/lib/haptics";

const VOLT = "#CCFF00";
const GLASS = { backgroundColor: "rgba(28, 28, 30, 0.4)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)" } as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

export function EnterCoachCodeModal({ visible, onClose, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (coachName: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleJoin = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 5) return;
    triggerImpact();
    setLoading(true);
    setErrorMsg("");

    const res = await joinCommunityRoom({ code: clean }, token);
    setLoading(false);

    if (res.ok) {
      triggerSuccess();
      onSuccess(res.coachName || "Coach");
    } else {
      triggerWarning();
      setErrorMsg(res.error === "NOT_FOUND" ? "CÓDIGO INVÁLIDO O EXPIRADO" : "ERROR DE CONEXIÓN");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(7,7,8,0.97)", justifyContent: "center", paddingHorizontal: 20 }}>
        <View style={{ position: "absolute", top: insets.top + 12, right: 20 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(204,255,0,0.08)", borderWidth: 1, borderColor: "rgba(204,255,0,0.25)" }}
          >
            <X size={12} color={VOLT} />
            <Text className="font-mono" style={{ fontSize: 8, letterSpacing: 1, color: VOLT }}>CERRAR</Text>
          </TouchableOpacity>
        </View>

        <View style={{ ...GLASS, borderRadius: 24, padding: 24, alignItems: "center" }}>
          <Search size={32} color={VOLT} style={{ marginBottom: 16 }} />
          <Text style={{ ...athletic, fontSize: 22, color: "#fff", textAlign: "center", marginBottom: 8 }}>
            VINCULAR CON COACH
          </Text>
          <Text style={{ fontSize: 13, color: "#8e8e93", textAlign: "center", marginBottom: 24, lineHeight: 18 }}>
            Ingresa el código de 6 dígitos que te proporcionó tu entrenador para sincronizar tu cuenta.
          </Text>

          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="EJ: A1B2C3"
            placeholderTextColor="rgba(255,255,255,0.2)"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={{
              width: "100%", height: 56, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)",
              borderWidth: 1, borderColor: errorMsg ? "#f87171" : "rgba(255,255,255,0.1)",
              color: VOLT, fontSize: 24, fontWeight: "900", letterSpacing: 4, textAlign: "center",
              marginBottom: 16,
            }}
          />

          {!!errorMsg && (
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#f87171", marginBottom: 16, letterSpacing: 0.5 }}>
              {errorMsg}
            </Text>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleJoin}
            disabled={loading || code.length < 5}
            style={{
              width: "100%", height: 52, borderRadius: 16, backgroundColor: VOLT,
              justifyContent: "center", alignItems: "center", opacity: (loading || code.length < 5) ? 0.6 : 1,
            }}
          >
            {loading ? <ActivityIndicator size="small" color="#000" /> : (
              <Text style={{ ...athletic, fontSize: 15, color: "#000" }}>VINCULAR CUENTA</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
