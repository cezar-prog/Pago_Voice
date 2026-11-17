"use client";

import { useEffect, useState } from "react";
import { motionValue, type MotionValue } from "framer-motion";
import {
  METER_FULL_SCALE,
  SPECTRUM_BARS,
  classifyLevel,
  meterAvailable,
  startMicMeter,
  type MicMeter,
  type MicZone,
} from "@/lib/assistant/mic-level";

export interface MicMeterState {
  /** Normalised loudness 0..1, read by the visuals without re-rendering React. */
  level: MotionValue<number>;
  /** Per-bar speech spectrum 0..1, updated in place every frame. */
  spectrum: Float32Array;
  zone: MicZone;
  error: string | null;
}

/** Live microphone loudness and spectrum while `enabled` is true. Releases the mic when disabled. */
export function useMicMeter(enabled: boolean): MicMeterState {
  const [level] = useState(() => motionValue(0));
  const [spectrum] = useState(() => new Float32Array(SPECTRUM_BARS));
  const [zone, setZone] = useState<MicZone>("silent");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !meterAvailable()) return;

    let cancelled = false;
    let meter: MicMeter | null = null;

    startMicMeter((raw) => {
      if (cancelled) return;
      level.set(Math.min(1, raw / METER_FULL_SCALE));
      const next = classifyLevel(raw);
      setZone((prev) => (prev === next ? prev : next));
    }, spectrum)
      .then((m) => {
        if (cancelled) {
          m?.stop();
          return;
        }
        meter = m;
        setError(m ? null : "Microfonul nu este disponibil în acest browser.");
      })
      .catch(() => {
        if (!cancelled) setError("Permite accesul la microfon ca să vezi volumul.");
      });

    return () => {
      cancelled = true;
      meter?.stop();
      level.set(0);
      spectrum.fill(0);
    };
  }, [enabled, level, spectrum]);

  return { level, spectrum, zone, error };
}
