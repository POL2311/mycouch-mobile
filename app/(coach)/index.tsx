import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Info } from "lucide-react-native";
import Svg, { Path, Line, Circle } from "react-native-svg";
import { useCoach, STAGE_COLORS, paymentBucket, type CoachStudent } from "@/lib/coach";

const VOLT   = "#CCFF00";
const CYAN   = "#40E0D0";
const SILVER = "#8e8e93";
const GLASS  = {
  backgroundColor: "rgba(28, 28, 30, 0.4)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.06)",
} as const;
const athletic = { fontWeight: "900" as const, fontStyle: "italic" as const, textTransform: "uppercase" as const };

// ── Adherence curve — every student's completionRate, sorted descending.
// Standard (non-inverted) orientation: higher adherence plots higher. ───────
const CW = 320, CH = 90, CP = 10;
function AdherenceCurve({ students }: { students: CoachStudent[] }) {
  const rates = [...students].map(s => s.completionRate).sort((a, b) => b - a);
  const mean = rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;

  if (rates.length < 2) {
    return (
      <View style={{ height: CH, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-mono" style={{ fontSize: 10, color: SILVER }}>
          [ SISTEMA // DATOS INSUFICIENTES PARA GRAFICAR ]
        </Text>
      </View>
    );
  }

  const toX = (i: number) => CP + (i / (rates.length - 1)) * (CW - 2 * CP);
  const toY = (v: number) => CP + (1 - v / 100) * (CH - 2 * CP);
  const path = `M ${rates.map((r, i) => `${toX(i).toFixed(1)},${toY(r).toFixed(1)}`).join(" L ")}`;

  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ justifyContent: "space-between", height: CH, paddingRight: 8, paddingVertical: 2 }}>
        <Text className="font-mono" style={{ fontSize: 7, color: SILVER }}>100%</Text>
        <Text className="font-mono" style={{ fontSize: 7, color: SILVER }}>Prom.</Text>
        <Text className="font-mono" style={{ fontSize: 7, color: SILVER }}>0%</Text>
      </View>
      <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{ flex: 1 }}>
        <Line x1={CP} x2={CW - CP} y1={toY(mean)} y2={toY(mean)} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4,3" />
        <Path d={path} stroke={VOLT} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {rates.map((r, i) => <Circle key={i} cx={toX(i)} cy={toY(r)} r={2.5} fill={VOLT} />)}
      </Svg>
    </View>
  );
}

function AvatarCircle({ student }: { student: CoachStudent }) {
  const initials = student.avatarInitials || student.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const color = student.avatarColor || CYAN;
  return (
    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text className="font-black" style={{ fontSize: 12, color: "#000" }}>{initials}</Text>
    </View>
  );
}

export default function CoachResumen() {
  const { students, isLoading } = useCoach();

  const activeCount = students.filter(s => s.paymentStatus === "active").length;
  const graceCount  = students.filter(s => s.paymentStatus === "grace_period").length;
  const inactiveCount = students.filter(s => s.paymentStatus === "inactive").length;
  // MRR = active×1200 + grace×600 MXN — verbatim coach-dashboard formula
  // (MYCOACH_GLOBAL_MASTER_SPEC.md §3.3.1).
  const mrr = activeCount * 1200 + graceCount * 600;
  const adherencia = students.length > 0
    ? Math.round(students.reduce((s, st) => s + st.completionRate, 0) / students.length)
    : 0;
  const totalActivos = students.filter(s => s.isActive).length;
  const alertas = graceCount + inactiveCount;

  const kpis = [
    { label: "MRR", value: `$${mrr.toLocaleString("es-MX")}`, unit: "MXN", color: "#fff" },
    { label: "ADHERENCIA", value: `${adherencia}%`, unit: null, color: CYAN },
    { label: "ACTIVOS", value: `${totalActivos} DE ${students.length}`, unit: null, color: "#fff" },
    { label: "ALERTAS", value: String(alertas), unit: null, color: alertas > 0 ? "#ef4444" : "#fff" },
  ];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#070708" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 12, marginBottom: 4 }}>
        <Text style={{ ...athletic, fontSize: 26, color: "#fff" }}>Resumen</Text>
        <Info size={16} color={SILVER} />
      </View>
      <Text className="font-mono" style={{ fontSize: 10, letterSpacing: 0.5, color: SILVER, paddingHorizontal: 20, marginBottom: 16 }}>
        Estado de tu negocio: ingresos, adherencia y alertas.
      </Text>

      {isLoading ? (
        <ActivityIndicator color={VOLT} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {/* 2×2 KPI bento grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            {kpis.map(kpi => (
              <View key={kpi.label} style={{ ...GLASS, width: "48%", borderRadius: 16, padding: 14 }}>
                <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: SILVER }}>{kpi.label}</Text>
                <Text className="font-black" style={{ fontSize: 24, color: kpi.color, marginTop: 4 }}>
                  {kpi.value}
                  {kpi.unit && <Text style={{ fontSize: 11, color: SILVER }}> {kpi.unit}</Text>}
                </Text>
              </View>
            ))}
          </View>

          {/* Adherence curve */}
          <View style={{ ...GLASS, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text className="font-black uppercase" style={{ fontSize: 10, letterSpacing: 1, color: SILVER, marginBottom: 12 }}>
              Curva de Adherencia
            </Text>
            <AdherenceCurve students={students} />
          </View>

          {/* Quick roster preview */}
          <Text className="font-black uppercase" style={{ fontSize: 12, color: "#fff", marginBottom: 10 }}>
            Alumnos · {students.length}
          </Text>
          {students.length === 0 ? (
            <View style={{ ...GLASS, borderRadius: 14, paddingVertical: 30, alignItems: "center" }}>
              <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1, color: "#71717a" }}>[ SIN ALUMNOS REGISTRADOS ]</Text>
            </View>
          ) : (
            students.slice(0, 4).map(s => {
              const bucket = paymentBucket(s.paymentStatus);
              const complianceColor = bucket === "al_dia" ? "#4ade80" : bucket === "pendiente" ? "#f59e0b" : "#ef4444";
              const complianceLabel = bucket === "al_dia" ? "Al día" : bucket === "pendiente" ? "Pendiente" : "Suspendido";
              const stageColor = STAGE_COLORS[s.stage] ?? SILVER;
              return (
                <View key={s.id} style={{ ...GLASS, borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <AvatarCircle student={s} />
                  <View style={{ flex: 1 }}>
                    <Text className="font-bold" style={{ fontSize: 13, color: "#fff" }} numberOfLines={1}>{s.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <View style={{ backgroundColor: `${stageColor}22`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, color: stageColor, fontWeight: "700" }}>{s.stage}</Text>
                      </View>
                      <Text className="font-mono" style={{ fontSize: 9, color: SILVER }}>{s.currentWeight} kg</Text>
                    </View>
                  </View>
                  <Text className="font-black" style={{ fontSize: 11, color: complianceColor, textAlign: "right" }}>
                    {s.completionRate}%{"\n"}{complianceLabel}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
