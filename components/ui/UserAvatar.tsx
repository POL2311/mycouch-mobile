import { useState } from "react";
import { View, Text, Image } from "react-native";

interface UserAvatarProps {
  image?: string | null;
  name?: string | null;
  size?: number;
  initials?: string;
  color?: string;
  isActive?: boolean;
}

export function UserAvatar({ image, name, size = 52, initials, color = "#CCFF00", isActive = true }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const fallbackInitials = initials || (name ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() : "23");
  
  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: !image || imgError ? "#1C1C1E" : color,
    ...(isActive
      ? { borderWidth: 2, borderColor: "#CCFF00", shadowColor: "#CCFF00", shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }
      : { opacity: 0.5 }),
  };

  if (image && !imgError) {
    return (
      <View style={containerStyle}>
        <Image 
          source={{ uri: image }} 
          style={{ width: "100%", height: "100%", borderRadius: size / 2 }} 
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={{ fontSize: size * 0.35, fontWeight: "900", color: "#CCFF00" }}>
        {fallbackInitials}
      </Text>
    </View>
  );
}
