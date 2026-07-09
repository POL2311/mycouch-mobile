import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/session";
import {
  useCoach, fetchCoachRoomProfile, updateCoachRoomProfile, setStudentPaymentStatus,
  paymentBucket, type CoachRoomProfile, type CoachStudent,
} from "@/lib/coach";
import { PulseButton } from "@/components/ui/PulseButton";

const VOLT   = "#CCFF00";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

function PaymentRow({ student, badge, badgeColor, action }: {
  student: CoachStudent; badge: string; badgeColor: string; action?: React.ReactNode;
}) {
  return (
    <View style={{ ...GLASS, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: student.avatarColor || "#40E0D0", alignItems: "center", justifyContent: "center" }}>
        <Text className="font-black" style={{ fontSize: 11, color: "#000" }}>
          {student.avatarInitials || student.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text className="font-bold" style={{ fontSize: 12, color: "#fff" }} numberOfLines={1}>{student.name}</Text>
        <Text className="font-mono" style={{ fontSize: 9, color: SILVER, marginTop: 1 }} numberOfLines={1}>{student.email}</Text>
      </View>
      {action}
      <View style={{ backgroundColor: `${badgeColor}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text className="font-black" style={{ fontSize: 10, color: badgeColor }}>{badge}</Text>
      </View>
    </View>
  );
}

export default function PagosScreen() {
  const { token } = useAuth();
  const { students, isLoading, refresh } = useCoach();

  const [profile, setProfile] = useState<CoachRoomProfile | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchCoachRoomProfile(token)
      .then(p => { setProfile(p); setPriceInput(String(p.monthlyPrice)); })
      .catch(() => {});
  }, [token]);

  const savePrice = useCallback(async () => {
    if (!token) return;
    const n = parseFloat(priceInput);
    if (!Number.isFinite(n) || n < 0) { setPriceError("Precio inválido"); return; }
    setSavingPrice(true);
    setPriceError(null);
    try {
      const updated = await updateCoachRoomProfile({ monthlyPrice: n }, token);
      setProfile(updated);
    } catch {
      setPriceError("No se pudo guardar el precio.");
    } finally {
      setSavingPrice(false);
    }
  }, [token, priceInput]);

  const markPaid = useCallback(async (studentId: string) => {
    if (!token) return;
    try { await setStudentPaymentStatus(studentId, "active", token); refresh(); } catch {}
  }, [token, refresh]);

  const groups = useMemo(() => {
    const accion    = students.filter(s => paymentBucket(s.paymentStatus) === "pendiente");
    const alDia     = students.filter(s => paymentBucket(s.paymentStatus) === "al_dia");
    const suspended = students.filter(s => paymentBucket(s.paymentStatus) === "suspendido");
    return { accion, alDia, suspended };
  }, [students]);

  const activeCount = students.filter(s => s.paymentStatus === "active").length;
  const mrr = profile ? activeCount * profile.monthlyPrice : 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <Text style={{ ...athletic, fontSize: 24, color: "#fff", paddingHorizontal: 20, paddingTop: 12, marginBottom: 16 }}>Pagos</Text>

      {isLoading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {/* TARIFA MENSUAL */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <Text className="font-black uppercase" style={{ fontSize: 11, color: SILVER, marginBottom: 10 }}>Tarifa Mensual</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#1C1C1E", borderRadius: 10, paddingHorizontal: 12 }}>
                <Text className="font-black" style={{ fontSize: 15, color: VOLT }}>$</Text>
                <TextInput
                  value={priceInput}
                  onChangeText={setPriceInput}
                  keyboardType="numeric"
                  style={{ flex: 1, color: "#fff", fontSize: 15, paddingVertical: 10, paddingLeft: 4 }}
                />
                <Text className="font-mono" style={{ fontSize: 10, color: SILVER }}>MXN/mes</Text>
              </View>
              <PulseButton
                glowColor={VOLT}
                disabled={savingPrice}
                onPress={savePrice}
                style={{ backgroundColor: VOLT, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, opacity: savingPrice ? 0.6 : 1 }}
              >
                {savingPrice ? <ActivityIndicator size="small" color="#000" /> : <Text className="font-black" style={{ fontSize: 12, color: "#000" }}>Guardar</Text>}
              </PulseButton>
            </View>
            {priceError && <Text style={{ color: "#f87171", fontSize: 11, marginTop: 8 }}>{priceError}</Text>}
            <Text style={{ fontSize: 11, color: SILVER, marginTop: 10, lineHeight: 15 }}>
              Este precio se mostrará a tus alumnos en la pantalla de suscripción.
            </Text>
          </View>

          {/* INGRESO MENSUAL RECURRENTES */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 20 }}>
            <Text className="font-black uppercase" style={{ fontSize: 10, letterSpacing: 1, color: SILVER, marginBottom: 8 }}>
              Ingreso Mensual Recurrente
            </Text>
            <Text className="font-black" style={{ fontSize: 38, color: "#fff" }}>
              ${mrr.toLocaleString("es-MX")} <Text style={{ fontSize: 15, color: SILVER }}>MXN</Text>
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: VOLT }} />
              <Text className="font-mono" style={{ fontSize: 10, color: VOLT }}>
                AutoCobro activo · ${profile?.monthlyPrice ?? 0}/alumno
              </Text>
            </View>
          </View>

          <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", marginBottom: 10 }}>
            Requieren Acción ({groups.accion.length})
          </Text>
          {groups.accion.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 12, color: SILVER }}>Nadie con pagos pendientes 🎉</Text>
            </View>
          ) : (
            <View style={{ marginBottom: 20 }}>
              {groups.accion.map(s => (
                <PaymentRow
                  key={s.id} student={s} badge="Pendiente" badgeColor="#f59e0b"
                  action={
                    <TouchableOpacity onPress={() => markPaid(s.id)} style={{ marginRight: 8 }}>
                      <Text className="font-bold" style={{ fontSize: 10, color: VOLT }}>Marcar al día</Text>
                    </TouchableOpacity>
                  }
                />
              ))}
            </View>
          )}

          <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", marginBottom: 10 }}>
            Al Día ({groups.alDia.length})
          </Text>
          <View style={{ marginBottom: 20 }}>
            {groups.alDia.map(s => <PaymentRow key={s.id} student={s} badge="Al día" badgeColor="#4ade80" />)}
          </View>

          <Text className="font-black uppercase" style={{ fontSize: 11, color: "#fff", marginBottom: 10 }}>
            Suspendidos ({groups.suspended.length})
          </Text>
          <View>
            {groups.suspended.map(s => <PaymentRow key={s.id} student={s} badge="Suspendido" badgeColor="#ef4444" />)}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
