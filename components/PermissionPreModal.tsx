import { View, Text, TouchableOpacity, Modal } from "react-native";
import { ShieldAlert, X } from "lucide-react-native";
import { BlurView } from "expo-blur";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";

interface Props {
  visible: boolean;
  title: string;
  description: string;
  onGrant: () => void;
  onClose: () => void;
}

export function PermissionPreModal({ visible, title, description, onGrant, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: 20 }}>
        <BlurView intensity={100} tint="dark" style={{ position: "absolute", width: "150%", height: "150%" }} />
        
        <View style={{ backgroundColor: "#1C1C1E", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(204,255,0,0.1)", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <ShieldAlert size={32} color={VOLT} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "900", color: "#fff", textAlign: "center", marginBottom: 8 }}>
              {title}
            </Text>
            <Text style={{ fontSize: 14, color: SILVER, textAlign: "center", lineHeight: 22 }}>
              {description}
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={onGrant} style={{ backgroundColor: VOLT, paddingVertical: 16, borderRadius: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "900", color: "#000" }}>ENTENDIDO, CONTINUAR</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 16, borderRadius: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: SILVER }}>Quizás más tarde</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
