import Toast from "react-native-toast-message";
import { triggerSuccess } from "@/lib/haptics";

const QUOTES = [
  "El dolor de hoy es la victoria de mañana.",
  "Un día más, un paso más cerca. Excelente sesión.",
  "Disciplina mata talento. Sigue empujando.",
  "Misión cumplida. Tu cuerpo te lo agradece.",
];

export function triggerPRBanner() {
  triggerSuccess();
  Toast.show({
    type: "success",
    text1: "🏆 ¡NUEVO RÉCORD PERSONAL REGISTRADO!",
    text2: "Has superado tus límites.",
    position: "top",
    topOffset: 60,
  });
}

export function triggerWorkoutCompletionQuote() {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  Toast.show({
    type: "info",
    text1: "SESIÓN COMPLETADA",
    text2: quote,
    position: "bottom",
  });
}

export function checkInactivityAndAlert(lastSessionDate: string) {
  // Logic to calculate days since lastSessionDate and trigger local notification if >= 3
  const last = new Date(lastSessionDate).getTime();
  const now = new Date().getTime();
  const diffDays = (now - last) / (1000 * 3600 * 24);

  if (diffDays >= 3) {
    console.log("Showing subtle portal card for inactivity.");
    // In a real scenario, update a state context to render a card in the portal.
  }
}
