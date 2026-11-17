/** RMS level (0..~0.5) at which the meter bar is full. */
export const METER_FULL_SCALE = 0.25;

/** Number of radial bars in the voice visualiser. */
export const SPECTRUM_BARS = 48;

/** Only the lower part of the spectrum carries speech (about 0–5 kHz). */
const VOICE_BINS = 240;

export type MicZone = "silent" | "quiet" | "good" | "loud";

// Tune these on a real microphone. Raw RMS values from getFloatTimeDomainData.
export const QUIET_FROM = 0.01;
export const GOOD_FROM = 0.035;
export const LOUD_FROM = 0.2;

export function classifyLevel(raw: number): MicZone {
  if (raw >= LOUD_FROM) return "loud";
  if (raw >= GOOD_FROM) return "good";
  if (raw >= QUIET_FROM) return "quiet";
  return "silent";
}

export interface MicMeter {
  stop: () => void;
}

/**
 * Opens the microphone and reports, every animation frame:
 * - `onLevel`: overall loudness (RMS)
 * - `spectrum`: SPECTRUM_BARS values 0..1 for the speech frequencies, written in place
 * Returns null when the browser has no audio input support.
 * Rejects when permission is denied or no device exists.
 */
export async function startMicMeter(
  onLevel: (raw: number) => void,
  spectrum: Float32Array,
): Promise<MicMeter | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  // The context is created after an async permission step, so Chrome may start it
  // suspended. A suspended context returns silence forever, which froze the meter.
  if (ctx.state === "suspended") await ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const binsPerBar = VOICE_BINS / SPECTRUM_BARS;
  let smoothed = 0;
  let frame = 0;

  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    // Fast attack, slow release: the bar jumps up with speech and falls smoothly.
    smoothed = Math.max(rms, smoothed * 0.9);
    onLevel(smoothed);

    analyser.getByteFrequencyData(freq);
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      let total = 0;
      const from = Math.floor(i * binsPerBar);
      const to = Math.floor((i + 1) * binsPerBar);
      for (let b = from; b < to; b++) total += freq[b];
      const value = total / (to - from) / 255;
      spectrum[i] = Math.max(value, spectrum[i] * 0.85);
    }

    frame = requestAnimationFrame(tick);
  };
  tick();

  return {
    stop: () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
