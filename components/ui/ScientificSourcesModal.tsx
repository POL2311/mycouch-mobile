import React, { useState } from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { X, ExternalLink, ShieldAlert, Book } from "lucide-react-native";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";
const GUTTER = 20;

export function ScientificSourcesModal() {
  const [visible, setVisible] = useState(false);

  const openLink = (url: string) => {
    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  return (
    <>
      <TouchableOpacity 
        onPress={() => setVisible(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: "rgba(255,255,255,0.05)",
          paddingVertical: 14,
          borderRadius: 16,
          marginTop: 8,
          marginBottom: 32,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "800", color: SILVER }}>
          📖 Fuentes y Referencias Científicas (ISSN / PubMed)
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <BlurView intensity={70} tint="dark" style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }}>
          <SafeAreaView style={{ flex: 1, justifyContent: "flex-end" }} edges={["top", "bottom"]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setVisible(false)} activeOpacity={1} />
            <View style={{ backgroundColor: "#121214", borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: GUTTER, paddingBottom: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderBottomWidth: 0, maxHeight: "80%" }}>
              
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <ShieldAlert size={16} color={VOLT} />
                    <Text style={{ fontSize: 11, fontWeight: "900", color: VOLT, letterSpacing: 1 }}>MEDICAL DISCLAIMER</Text>
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: "#fff", textTransform: "uppercase" }}>
                    Aviso Legal y Fuentes Científicas
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <X size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <View style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
                  <Text style={{ fontSize: 14, color: "#fff", lineHeight: 22 }}>
                    MyCouch proporciona recomendaciones nutricionales basadas en literatura científica internacional. Las pautas son informativas y no sustituyen la consulta médica o nutricional personalizada.
                  </Text>
                </View>

                <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff", marginBottom: 16 }}>FUENTES BIBLIOGRÁFICAS</Text>
                
                <View style={{ gap: 12 }}>
                  <TouchableOpacity onPress={() => openLink("https://pubmed.ncbi.nlm.nih.gov/2305711/")} style={{ backgroundColor: "rgba(18,18,20,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Ecuación TDEE / Requerimiento Calórico (Mifflin-St Jeor)</Text>
                      <Text style={{ fontSize: 12, color: SILVER, marginTop: 4 }}>Cálculo de Tasa Metabólica Basal basado en la fórmula Mifflin-St Jeor.</Text>
                      <Text style={{ fontSize: 11, color: VOLT, marginTop: 4 }}>American Journal of Clinical Nutrition (AJCN)</Text>
                    </View>
                    <ExternalLink size={16} color={SILVER} />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => openLink("https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0174-y")} style={{ backgroundColor: "rgba(18,18,20,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Distribución de Macronutrientes para Deportistas</Text>
                      <Text style={{ fontSize: 12, color: SILVER, marginTop: 4 }}>Postura oficial sobre dietas, composición corporal y rendimiento deportivo.</Text>
                      <Text style={{ fontSize: 11, color: VOLT, marginTop: 4 }}>International Society of Sports Nutrition (ISSN)</Text>
                    </View>
                    <ExternalLink size={16} color={SILVER} />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => openLink("https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8")} style={{ backgroundColor: "rgba(18,18,20,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Requerimientos Proteicos Diarios</Text>
                      <Text style={{ fontSize: 12, color: SILVER, marginTop: 4 }}>Postura del ISSN sobre ingesta de proteínas y ejercicio.</Text>
                      <Text style={{ fontSize: 11, color: VOLT, marginTop: 4 }}>Journal of the International Society of Sports Nutrition</Text>
                    </View>
                    <ExternalLink size={16} color={SILVER} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </SafeAreaView>
        </BlurView>
      </Modal>
    </>
  );
}
