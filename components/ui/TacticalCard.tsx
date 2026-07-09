import { View, type ViewProps } from "react-native";

interface TacticalCardProps extends ViewProps {
  accent?: boolean; // volt border highlight
}

export function TacticalCard({ accent = false, style, ...props }: TacticalCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: "#0a0a0b",
          borderWidth: 1,
          borderColor: accent ? "rgba(204,255,0,0.3)" : "rgba(39,39,42,0.8)",
          borderRadius: 2,
          padding: 14,
        },
        style,
      ]}
      {...props}
    />
  );
}
