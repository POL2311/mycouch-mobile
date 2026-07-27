import React from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { X, CheckCircle2, Lock, Zap, ArrowRight, RefreshCcw } from "lucide-react-native";
import { triggerSuccess } from "@/lib/haptics";
import { trackEvent } from "@/lib/analytics";
import { getOfferings, purchasePackage, restorePurchases } from "@/lib/revenueCat";
import { PurchasesOfferings, PurchasesPackage } from "react-native-purchases";
import Toast from "react-native-toast-message";
import { ActivityIndicator } from "react-native";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";
const GUTTER = 20;

const GLASS = {
  backgroundColor: "rgba(18,18,20,0.65)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
};

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function PaywallModal({ visible, onClose, title = "ACTUALIZA A PRO", description = "Desbloquea el potencial completo de tu entrenamiento con nuestra versión PRO o vinculando a tu Coach." }: PaywallModalProps) {
  const [offerings, setOfferings] = React.useState<PurchasesOfferings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [purchasing, setPurchasing] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setLoading(true);
      getOfferings().then(offs => {
        setOfferings(offs);
        setLoading(false);
      });
    }
  }, [visible]);

  const packageToBuy: PurchasesPackage | undefined = offerings?.current?.availablePackages?.[0];

  const handleUpgrade = async () => {
    if (!packageToBuy) return;
    setPurchasing(true);
    trackEvent("PAYWALL_UPGRADE_CLICKED");
    
    const success = await purchasePackage(packageToBuy);
    setPurchasing(false);
    
    if (success) {
      triggerSuccess();
      Toast.show({ type: "success", text1: "¡Bienvenido a PRO!", text2: "Tu suscripción ha sido activada.", position: "bottom" });
      onClose();
    } else {
      Toast.show({ type: "error", text1: "Compra cancelada", text2: "No se procesó el pago.", position: "bottom" });
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    const success = await restorePurchases();
    setPurchasing(false);
    if (success) {
      triggerSuccess();
      Toast.show({ type: "success", text1: "Compras Restauradas", text2: "Tu suscripción PRO ha sido restablecida.", position: "bottom" });
      onClose();
    } else {
      Toast.show({ type: "error", text1: "Sin compras", text2: "No se encontró una suscripción activa.", position: "bottom" });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <BlurView intensity={70} tint="dark" style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }}>
        <SafeAreaView style={{ flex: 1, justifyContent: "flex-end" }} edges={["top", "bottom"]}>
          
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
          
          <View style={{ backgroundColor: "#000", borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: GUTTER, paddingBottom: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderBottomWidth: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Lock size={16} color={VOLT} />
                  <Text style={{ fontSize: 11, fontWeight: "900", color: VOLT, letterSpacing: 1 }}>FUNCIÓN BLOQUEADA</Text>
                </View>
                <Text style={{ fontSize: 24, fontWeight: "900", color: "#fff", textTransform: "uppercase" }}>
                  {title}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                <X size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, color: SILVER, lineHeight: 22, marginBottom: 32 }}>
              {description}
            </Text>

            <View style={{ gap: 16, marginBottom: 32 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <CheckCircle2 size={20} color={VOLT} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Plantillas Ilimitadas</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <CheckCircle2 size={20} color={VOLT} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Reportes Avanzados de Progreso</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <CheckCircle2 size={20} color={VOLT} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Exportación PDF y Excel</Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <TouchableOpacity 
                onPress={handleUpgrade} 
                disabled={loading || purchasing || !packageToBuy}
                style={{ backgroundColor: VOLT, paddingVertical: 18, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                {loading || purchasing ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Zap size={20} color="#000" fill="#000" />
                )}
                <Text style={{ fontSize: 15, fontWeight: "900", color: "#000" }}>
                  {packageToBuy ? `OBTENER PRO POR ${packageToBuy.product.priceString}/MES` : "CARGANDO..."}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={onClose} disabled={purchasing} style={{ backgroundColor: "#1A1A1C", paddingVertical: 18, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>EXPLORAR COACHES</Text>
                <ArrowRight size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleRestore} disabled={purchasing} style={{ marginTop: 24, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
              <RefreshCcw size={12} color="rgba(255,255,255,0.4)" />
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", textDecorationLine: "underline" }}>
                Restaurar Compras
              </Text>
            </TouchableOpacity>
            
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 16, paddingHorizontal: 20 }}>
              Si contratas a un Coach en el Directorio, todas las funciones PRO se desbloquean automáticamente.
            </Text>

          </View>
        </SafeAreaView>
      </BlurView>
    </Modal>
  );
}
