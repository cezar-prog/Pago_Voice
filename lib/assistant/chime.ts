type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

/**
 * Short soft "bing" (a sine tone that drops and fades out), generated with Web Audio so no
 * sound file is needed. Does nothing if audio is unavailable.
 */
export function playWakeChime(): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as Window & {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const audio = (context ??= new Ctor());
    if (audio.state === "suspended") void audio.resume();

    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // Audio blocked or unavailable: the wake still works without the chime.
  }
}
