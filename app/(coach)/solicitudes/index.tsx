import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { Check, X, Inbox } from "lucide-react-native";
import type { CoachRequest } from "@/types/coachRequest";
import { fetchPendingRequests, respondToRequest, useCoach } from "@/lib/coach";
import { useAuth } from "@/lib/session";
import { triggerSuccess } from "@/lib/haptics";

const VOLT = "#CCFF00";
const SILVER = "#8e8e93";
const GUTTER = 20;

const GLASS = {
  backgroundColor: "rgba(18,18,20,0.65)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
};



export default function SolicitudesInbox() {
  const { token } = useAuth();
  const { refresh } = useCoach();
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchPendingRequests(token).then(reqs => {
        setRequests(reqs);
        setLoading(false);
      });
    }
  }, [token]);

  const handleAccept = async (id: string) => {
    if (!token) return;
    const success = await respondToRequest(id, "ACCEPTED", token);
    if (success) {
      triggerSuccess();
      setRequests(prev => prev.filter(r => r.id !== id));
      refresh(); // Refresh the student roster immediately!
    }
  };

  const handleReject = async (id: string) => {
    if (!token) return;
    const success = await respondToRequest(id, "REJECTED", token);
    if (success) {
      setRequests(prev => prev.filter(r => r.id !== id));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: GUTTER, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Inbox size={24} color={VOLT} />
          <Text style={{ fontSize: 20, fontWeight: "900", color: "#fff" }}>
            Solicitudes Pendientes ({requests.length})
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 16, paddingTop: 16, paddingBottom: 40 }}>
          {loading ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 }}>
              <ActivityIndicator color={VOLT} size="large" />
              <Text style={{ fontSize: 16, color: SILVER, fontWeight: "600" }}>Cargando solicitudes...</Text>
            </View>
          ) : requests.length === 0 ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 }}>
              <Inbox size={48} color={SILVER} />
              <Text style={{ fontSize: 16, color: SILVER, fontWeight: "600" }}>No hay solicitudes pendientes.</Text>
            </View>
          ) : (
            requests.map(req => (
              <View key={req.id} style={{ ...GLASS, borderRadius: 16, padding: 16, gap: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {req.studentAvatar ? (
                    <Image source={{ uri: req.studentAvatar }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.1)" }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>{req.studentName}</Text>
                    <Text style={{ fontSize: 12, color: SILVER, marginTop: 2 }}>Objetivo: <Text style={{ color: VOLT }}>{req.goal}</Text></Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => handleReject(req.id)}
                    style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                  >
                    <X size={16} color={SILVER} />
                    <Text style={{ fontSize: 12, fontWeight: "800", color: SILVER }}>RECHAZAR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAccept(req.id)}
                    style={{ flex: 1, backgroundColor: VOLT, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                  >
                    <Check size={16} color="#000" />
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#000" }}>ACEPTAR ALUMNO</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
