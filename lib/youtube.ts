// Helper utility to parse and format YouTube URLs defensively.

/**
 * Extracts the video ID from a variety of YouTube URL formats.
 */
export function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2]!.length === 11 ? match[2] : null;
}

/**
 * Formats a clean, nocookie embed URL for the WebView.
 */
export function formatYouTubeUrl(videoId: string): string {
  // playsinline=1: Prevents iOS from forcing full-screen media player.
  // enablejsapi=1: Allows WebView to intercept player state if needed.
  // origin: Required by some copyright/embed restrictions (Error 150/153).
  // rel=0: Limits related videos to the same channel.
  return `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&enablejsapi=1&origin=https://www.youtube.com&rel=0&autoplay=0`;
}
