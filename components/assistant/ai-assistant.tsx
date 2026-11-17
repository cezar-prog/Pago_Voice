"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AnimatePresence,
  motion,
  motionValue,
  useAnimationFrame,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { useAssistant } from "./assistant-provider";
import { CartPill, CheckoutScreen } from "./checkout";
import { InvoiceViewerModal } from "./invoice-viewer";
import { useMicMeter } from "./use-mic-meter";
import {
  GOOD_FROM,
  LOUD_FROM,
  METER_FULL_SCALE,
  type MicZone,
} from "@/lib/assistant/mic-level";
import type { AssistantStatus, ChatMessage } from "@/lib/assistant/types";

const PAGO_BLUE = "#0066FF";
const CYAN = "#00E5FF";
const VIOLET = "#8b5cf6";

/** Entry point: the bottom launcher button plus the full-screen assistant overlay. */
export function AiAssistant() {
  const { isOpen, open, checkoutOpen, viewingInvoice } = useAssistant();

  return (
    <>
      <CartPill />

      {!isOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <motion.button
            layoutId="pago-ai-orb"
            type="button"
            onClick={open}
            aria-label="Deschide asistentul Pago"
            whileTap={{ scale: 0.94 }}
            className="pointer-events-auto relative z-10 h-16 w-16 touch-manipulation"
          >
            <SiriOrb status="idle" />
          </motion.button>
        </div>
      )}

      <AnimatePresence>{isOpen && <AssistantOverlay />}</AnimatePresence>

      <AnimatePresence>{checkoutOpen && <CheckoutScreen key="checkout" />}</AnimatePresence>

      <AnimatePresence>
        {viewingInvoice && <InvoiceViewerModal key="invoice" bill={viewingInvoice} />}
      </AnimatePresence>
    </>
  );
}

function MuteButton() {
  const { isAssistantMuted, toggleAssistantMute } = useAssistant();
  const Icon = isAssistantMuted ? VolumeX : Volume2;

  return (
    <button
      type="button"
      onClick={toggleAssistantMute}
      aria-pressed={isAssistantMuted}
      aria-label={isAssistantMuted ? "Pornește vocea asistentului" : "Oprește vocea asistentului"}
      className={`mt-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 backdrop-blur-2xl transition-colors ${
        isAssistantMuted ? "bg-white/5 text-white/35" : "bg-white/10 text-white/70"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function AssistantOverlay() {
  const { expanded, status, messages, liveTranscript, close } = useAssistant();
  const listening = status === "listening";
  const meter = useMicMeter(listening);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-black/90 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Asistentul Pago"
    >
      {/* Soft light rising from the bottom edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] opacity-60"
        style={{
          background: `linear-gradient(to top, ${PAGO_BLUE}44, ${VIOLET}22 45%, transparent)`,
          filter: "blur(28px)",
        }}
      />

      <div className="relative flex h-full w-full max-w-md flex-col px-5 pb-6 pt-8">
        <header className="flex items-center justify-between">
          <span className="text-sm font-medium tracking-wide text-white/60">Asistent Pago</span>
          <button
            type="button"
            onClick={close}
            aria-label="Închide asistentul"
            className="rounded-full border border-white/10 bg-white/10 p-2 text-white/70 backdrop-blur-xl transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* The orb is one shared element: it glides from the centre to the top via layoutId. */}
        <div
          className={`flex w-full flex-col items-center ${
            expanded ? "pt-4" : "flex-1 justify-center"
          }`}
        >
          <motion.div
            layoutId="pago-ai-orb"
            className={expanded ? "h-28 w-28" : "h-64 w-64"}
          >
            <SiriOrb status={status} level={meter.level} />
          </motion.div>

          <MuteButton />

          {listening && <LevelMeter level={meter.level} zone={meter.zone} error={meter.error} />}
          <Caption status={status} text={liveTranscript} compact={expanded} />
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              key="conversation"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="mt-6 flex min-h-0 w-full flex-1 flex-col"
            >
              <Conversation messages={messages} status={status} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4">
          <AssistantInput />
        </div>
      </div>
    </motion.div>
  );
}

/** Used when no loudness data is wired in (launcher). */
const NO_LEVEL = motionValue(0);

/** Sample points per ribbon. */
const POINTS = 48;

/**
 * Neon ribbons, each a sine wave pinned at both ends. They cross each other
 * because each has its own frequency, phase and speed.
 */
const RIBBONS = [
  { grad: "a", freq: 0.035, speed: 1.0, phase: 0.0, amp: 1.0 },
  { grad: "b", freq: 0.027, speed: 0.8, phase: 1.1, amp: 0.85 },
  { grad: "a", freq: 0.043, speed: 1.3, phase: 2.2, amp: 0.7 },
  { grad: "b", freq: 0.031, speed: -0.9, phase: 3.4, amp: 0.95 },
] as const;

/** Each ribbon is drawn three times: wide faint halo, mid glow, thin bright core. */
const LAYERS = [
  { width: 7, opacity: 0.14 },
  { width: 2.6, opacity: 0.45 },
  { width: 1.1, opacity: 1 },
] as const;

/** Wave path for one ribbon at time `t`, with half-height `amplitude` (in the 200-unit viewBox). */
function ribbonPath(
  t: number,
  spec: (typeof RIBBONS)[number],
  amplitude: number,
  speedMul: number,
): string {
  let d = "";
  for (let p = 0; p <= POINTS; p++) {
    const x = (p / POINTS) * 200;
    const envelope = Math.sin((Math.PI * x) / 200);
    const y =
      100 +
      amplitude * spec.amp * envelope * Math.sin(spec.freq * x + t * speedMul * spec.speed + spec.phase);
    d += `${p === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/**
 * Neon wave bubble, in the style of a glowing ribbon visualiser, clipped to a round
 * bubble. Ribbons are crisp strokes with a faint halo, not blurred. Loudness raises them.
 */
function SiriOrb({
  status,
  level = NO_LEVEL,
}: {
  status: AssistantStatus;
  level?: MotionValue<number>;
}) {
  const listening = status === "listening";
  const thinking = status === "thinking";
  const speaking = status === "speaking";
  const swell = useTransform(level, [0, 1], [1, 1.06]);

  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useAnimationFrame((time) => {
    const s = time / 1000;
    const current = statusRef.current;
    const lv = level.get();

    let amplitude: number;
    let speedMul: number;
    if (current === "listening") {
      amplitude = 10 + lv * 70;
      speedMul = 1.2;
    } else if (current === "thinking") {
      amplitude = 26;
      speedMul = 3.2;
    } else if (current === "speaking") {
      amplitude = 22 + 16 * Math.abs(Math.sin(s * 4));
      speedMul = 2;
    } else {
      amplitude = 7;
      speedMul = 0.5;
    }

    RIBBONS.forEach((spec, i) => {
      const d = ribbonPath(s, spec, amplitude, speedMul);
      for (let j = 0; j < LAYERS.length; j++) {
        pathRefs.current[i * LAYERS.length + j]?.setAttribute("d", d);
      }
    });
  });

  return (
    <motion.div className="relative h-full w-full" style={{ scale: swell }}>
      {/* Thin rings while listening or speaking: crisp, not blurred. */}
      {(listening || speaking) &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border"
            style={{ borderColor: i ? `${CYAN}55` : `${VIOLET}55` }}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: speaking ? 1.5 : 1.9, opacity: 0 }}
            transition={{
              duration: speaking ? 1.4 : 2.4,
              repeat: Infinity,
              delay: i * (speaking ? 0.7 : 1.2),
              ease: "easeOut",
            }}
          />
        ))}

      {/* Thinking: a thin dashed orbit spins around the bubble. */}
      {thinking && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-[-5%] rounded-full border border-dashed"
          style={{ borderColor: `${CYAN}88` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* The bubble: black glass, the waves clipped to a circle. */}
      <div
        className="relative h-full w-full overflow-hidden rounded-full bg-black ring-1 ring-white/10"
        style={{ boxShadow: `0 0 28px ${VIOLET}33, inset 0 0 24px ${PAGO_BLUE}22` }}
      >
        <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="pago-ribbon-a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
              <stop offset="0%" stopColor={VIOLET} />
              <stop offset="30%" stopColor={CYAN} />
              <stop offset="55%" stopColor="#ff3ea5" />
              <stop offset="80%" stopColor="#ffd54a" />
              <stop offset="100%" stopColor={CYAN} />
            </linearGradient>
            <linearGradient id="pago-ribbon-b" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
              <stop offset="0%" stopColor={CYAN} />
              <stop offset="35%" stopColor={PAGO_BLUE} />
              <stop offset="65%" stopColor={VIOLET} />
              <stop offset="100%" stopColor="#ff3ea5" />
            </linearGradient>
          </defs>

          {/* Flat baseline across the bubble, like the reference. */}
          <line x1="0" y1="100" x2="200" y2="100" stroke="url(#pago-ribbon-a)" strokeWidth="0.7" opacity="0.8" />

          {RIBBONS.map((spec, i) =>
            LAYERS.map((layer, j) => (
              <path
                key={`${i}-${j}`}
                ref={(el) => {
                  pathRefs.current[i * LAYERS.length + j] = el;
                }}
                d={ribbonPath(0, spec, 7, 0.5)}
                fill="none"
                stroke={`url(#pago-ribbon-${spec.grad})`}
                strokeWidth={layer.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={layer.opacity}
              />
            )),
          )}
        </svg>

        {/* Glass sheen on the top of the bubble. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.10), transparent 45%)" }}
        />
      </div>
    </motion.div>
  );
}

const ZONE_FEEDBACK: Record<MicZone, { label: string; tone: string }> = {
  silent: { label: "Nu te aud încă. Vorbește sau apropie-te.", tone: "text-white/45" },
  quiet: { label: "Prea încet. Apropie-te de microfon.", tone: "text-amber-300" },
  good: { label: "Volum bun.", tone: "text-cyan-200" },
  loud: { label: "Prea tare. Depărtează-te puțin.", tone: "text-amber-300" },
};

const pct = (raw: number) => (raw / METER_FULL_SCALE) * 100;

/** Loudness bar with the good range marked, plus a plain-language hint. */
function LevelMeter({
  level,
  zone,
  error,
}: {
  level: MotionValue<number>;
  zone: MicZone;
  error: string | null;
}) {
  const width = useTransform(level, [0, 1], ["0%", "100%"]);

  if (error) {
    return <p className="mt-6 text-center text-xs text-amber-300">{error}</p>;
  }

  const feedback = ZONE_FEEDBACK[zone];

  return (
    <div className="mt-6 w-full max-w-xs">
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
        {/* The good range: where the voice should land. */}
        <span
          className="absolute inset-y-0 bg-cyan-200/35"
          style={{ left: `${pct(GOOD_FROM)}%`, width: `${pct(LOUD_FROM) - pct(GOOD_FROM)}%` }}
        />
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width,
            background: `linear-gradient(90deg, ${PAGO_BLUE}, ${CYAN}, ${VIOLET})`,
          }}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 text-center text-xs transition-colors ${feedback.tone}`}
      >
        {feedback.label}
      </p>
    </div>
  );
}

const STATUS_HINT: Record<AssistantStatus, string> = {
  idle: "Atinge microfonul sau scrie o întrebare",
  listening: "Te ascult",
  thinking: "Mă gândesc",
  speaking: "Răspund",
};

/** Live transcript in big, clean type right under the orb. */
function Caption({
  status,
  text,
  compact,
}: {
  status: AssistantStatus;
  text: string;
  compact: boolean;
}) {
  return (
    <div className={`w-full max-w-sm text-center ${compact ? "mt-5" : "mt-8"}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
        {STATUS_HINT[status]}
      </p>
      {text && (
        <p
          className={`mt-3 font-semibold leading-tight tracking-tight text-white ${
            compact ? "text-xl" : "text-3xl"
          }`}
        >
          {text}
        </p>
      )}
    </div>
  );
}

function Conversation({
  messages,
  status,
}: {
  messages: ChatMessage[];
  status: AssistantStatus;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`max-w-[85%] whitespace-pre-line rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm leading-relaxed text-white shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl ${
                m.role === "user" ? "rounded-br-md" : "rounded-bl-md"
              }`}
            >
              {m.text}
            </p>
          </li>
        ))}

        {status === "thinking" && (
          <li className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-xl">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-cyan-200"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </li>
        )}
      </ul>
      <div ref={endRef} />
    </div>
  );
}

function AssistantInput() {
  const { micOn, voiceSupported, voiceError, toggleMic, sendText, noteActivity } =
    useAssistant();
  const [draft, setDraft] = useState("");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    sendText(text);
  };

  return (
    <div className="w-full">
      {voiceError && <p className="mb-2 text-center text-xs text-amber-300">{voiceError}</p>}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={!voiceSupported}
          aria-pressed={micOn}
          aria-label={micOn ? "Oprește microfonul" : "Pornește microfonul"}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            micOn ? "bg-[#00E5FF] text-black" : "bg-white/10 text-white/70"
          }`}
        >
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>

        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            noteActivity();
          }}
          placeholder="Întreabă despre facturile tale…"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/35"
        />

        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Trimite mesajul"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
