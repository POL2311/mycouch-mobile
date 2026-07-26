import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { useVideoPlayer, VideoView } from "expo-video";
import { Play, Pause, VideoOff, ExternalLink } from "lucide-react-native";
import { triggerImpact } from "@/lib/haptics";

interface ExerciseVideoPlayerProps {
  videoUrl: string | null;
  thumbnailUrl?: string | null; // For future usage or passing thumbnail
}

const VOLT = "#CCFF00";

import { extractYouTubeId, formatYouTubeUrl } from "@/lib/youtube";

// Fallback component for unrecognized URLs
function FallbackLinkPlayer({ url }: { url: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#1E1E1E", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <VideoOff size={32} color="rgba(255,255,255,0.4)" style={{ marginBottom: 16 }} />
      <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 20, fontWeight: "500" }}>
        Este video requiere reproducirse externamente.
      </Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          triggerImpact();
          Linking.openURL(url).catch(() => {});
        }}
        style={{
          width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
          backgroundColor: "#CCFF00", borderRadius: 16, paddingVertical: 14,
        }}
      >
        <Play size={18} color="#000" fill="#000" />
        <Text style={{ fontSize: 13, fontWeight: "800", color: "#000", letterSpacing: 0.5 }}>
          ▶️ Reproducir / Abrir en App de YouTube
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Player using expo-video for direct files
function DirectVideoPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);

  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });

  const togglePlay = useCallback(() => {
    triggerImpact();
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }, [player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.15)" }} />
      <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={togglePlay}
          style={{
            width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255, 255, 255, 0.15)",
            justifyContent: "center", alignItems: "center",
          }}
        >
          {playing
            ? <Pause size={24} color="#fff" fill="#fff" />
            : <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Player using WebView for YouTube
function YouTubePlayer({ videoId, originalUrl }: { videoId: string, originalUrl: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <View style={StyleSheet.absoluteFill}>
      {loading && (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#1E1E1E", zIndex: 1 }}>
          <ActivityIndicator color={VOLT} />
        </View>
      )}
      {error ? (
        <FallbackLinkPlayer url={originalUrl} />
      ) : (
        <WebView
          source={{ uri: formatYouTubeUrl(videoId) }}
          style={StyleSheet.absoluteFill}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={true}
          originWhitelist={['*']}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
          onLoadEnd={() => setLoading(false)}
          onError={() => setError(true)}
          onHttpError={() => setError(true)}
          javaScriptEnabled
          domStorageEnabled
        />
      )}
    </View>
  );
}

export function ExerciseVideoPlayer({ videoUrl }: ExerciseVideoPlayerProps) {
  if (!videoUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1E1E1E", alignItems: "center", justifyContent: "center" }}>
        <VideoOff size={26} color="rgba(255,255,255,0.3)" />
      </View>
    );
  }

  const ytId = extractYouTubeId(videoUrl);
  if (ytId) {
    return <YouTubePlayer videoId={ytId} originalUrl={videoUrl} />;
  }

  // Comprueba si parece un archivo de video directo
  const isDirectVideo = videoUrl.match(/\.(mp4|mov|m4v|webm)($|\?)/i);
  if (isDirectVideo) {
    return <DirectVideoPlayer url={videoUrl} />;
  }

  // Fallback si no sabemos qué es
  return <FallbackLinkPlayer url={videoUrl} />;
}
