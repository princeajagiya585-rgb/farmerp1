import { shouldPlaySound } from "./notifPrefs";

/**
 * Play a short, pleasant notification beep using the Web Audio API.
 * No external audio files needed — generates the sound programmatically.
 *
 * @param {string} [notificationType] — if provided, checks user prefs first.
 */
export function playNotificationSound(notificationType) {
  // Check user preference before playing
  if (notificationType && !shouldPlaySound(notificationType)) {
    return;
  }

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // First tone — 800 Hz, gentle
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(800, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    // Second tone — 1000 Hz, slightly higher, short gap
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1000, ctx.currentTime + 0.2);
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {
    // Web Audio API not available or blocked — silently ignore
  }
}
