import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useHealthData } from "@/lib/healthKit";
import { Heart, Activity, Flame, RefreshCw } from "lucide-react-native";
import { PermissionPreModal } from "@/components/PermissionPreModal";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";

const BENTO = {
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.1)",
  borderRadius: 24,
  padding: 20,
  marginHorizontal: 20,
  marginTop: 16,
} as const;

export function BiometricsCard() {
  const { data, loading, error, sync } = useHealthData();
  const [showPreModal, setShowPreModal] = useState(false);

  const handleSyncPress = () => {
    // Show pre-modal if we assume permissions aren't granted.
    // In production, we'd check if AppleHealthKit.isAvailable first.
    setShowPreModal(true);
  };

  return (
    <View style={BENTO}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 2, color: SILVER, textTransform: "uppercase" }}>
            APPLE HEALTH / GOOGLE FIT
          </Text>
          <Text className="font-black uppercase" style={{ fontSize: 14, color: "#fff", letterSpacing: 0.5, marginTop: 2 }}>
            BIOMÉTRICOS DIARIOS
          </Text>
        </View>
        <TouchableOpacity onPress={handleSyncPress} style={{ padding: 4, opacity: loading ? 0.5 : 1 }}>
          <RefreshCw size={16} color={VOLT} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ height: 60, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={VOLT} />
        </View>
      ) : error ? (
        <View style={{ height: 60, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 11, color: SILVER, textAlign: "center", fontStyle: "italic" }}>
            {error}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12, alignItems: "center" }}>
            <Activity size={20} color={VOLT} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#fff" }}>{data.steps.toLocaleString()}</Text>
            <Text style={{ fontSize: 9, color: SILVER }}>PASOS</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12, alignItems: "center" }}>
            <Flame size={20} color="#f87171" style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#fff" }}>{data.activeCalories}</Text>
            <Text style={{ fontSize: 9, color: SILVER }}>KCAL</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12, alignItems: "center" }}>
            <Heart size={20} color="#ec4899" style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#fff" }}>{data.avgHeartRate}</Text>
            <Text style={{ fontSize: 9, color: SILVER }}>BPM</Text>
          </View>
        </View>
      )}

      <TouchableOpacity onPress={handleSyncPress} style={{ marginTop: 16, backgroundColor: "rgba(204,255,0,0.1)", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: VOLT }}>🔄 Sincronizar Apple Health</Text>
      </TouchableOpacity>

      <PermissionPreModal
        visible={showPreModal}
        title="Sincronizar Salud"
        description="Conéctate a Apple Health o Google Fit para mostrar tus pasos diarios, calorías quemadas y ritmo cardíaco en la app."
        onGrant={() => {
          setShowPreModal(false);
          sync();
        }}
        onClose={() => setShowPreModal(false)}
      />
    </View>
  );
}
