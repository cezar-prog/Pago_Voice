'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mic, X } from 'lucide-react';
import type { VoiceMessage, VoicePhase } from '@/lib/types';

interface VoiceOverlayProps {
  open: boolean;
  phase: VoicePhase;
  messages: VoiceMessage[];
  transcript: string;
  error: string | null;
  supported: boolean;
  onClose: () => void;
  onMic: () => void;
}

const UNSUPPORTED_TEXT = 'Browserul tau nu suporta recunoasterea vocala. Incearca in Chrome.';

const STATUS_LABELS: Record<VoicePhase, string> = {
  idle: 'Atinge microfonul ca sa vorbesti',
  wake: 'Spune "Hei Pago"',
  listening: 'Te ascult...',
  thinking: 'Ma gandesc...',
  speaking: 'Pago raspunde...',
};

function Orb({ phase, size }: { phase: VoicePhase; size: 'large' | 'small' }) {
  const active = phase === 'listening' || phase === 'speaking';
  const dimension = size === 'large' ? 'h-40 w-40' : 'h-14 w-14';

  return (
    <div className={`relative ${dimension}`} aria-hidden>
      <motion.div
        className="absolute inset-0 rounded-full bg-linear-to-br from-fuchsia-500 via-violet-600 to-sky-400 shadow-[0_0_60px_rgba(168,85,247,0.55)]"
        animate={
          active
            ? { scale: [1, 1.12, 0.97, 1.08, 1], rotate: [0, 20, -12, 10, 0] }
            : phase === 'thinking'
              ? { scale: [0.94, 1, 0.94], rotate: [0, 360] }
              : { scale: [1, 1.03, 1] }
        }
        transition={{
          duration: active ? 1.6 : phase === 'thinking' ? 2.4 : 5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {active && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-fuchsia-300/60"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <div className="absolute inset-[30%] rounded-full bg-white/25 blur-md" />
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-white/70"
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant' | 'draft'; children: string }) {
  const className =
    role === 'user'
      ? 'max-w-[82%] rounded-3xl rounded-br-md bg-white/15 px-4 py-3 text-[15px] leading-snug text-white break-words'
      : role === 'draft'
        ? 'max-w-[82%] rounded-3xl rounded-br-md border border-dashed border-white/25 bg-white/5 px-4 py-3 text-[15px] leading-snug text-white/80 break-words'
        : 'max-w-[82%] rounded-3xl rounded-bl-md border border-white/10 bg-linear-to-br from-violet-600/40 via-fuchsia-600/30 to-sky-500/30 px-4 py-3 text-[15px] leading-snug text-white break-words';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${role === 'assistant' ? 'justify-start' : 'justify-end'}`}
    >
      <div className={className}>{children}</div>
    </motion.div>
  );
}

export function VoiceOverlay({
  open,
  phase,
  messages,
  transcript,
  error,
  supported,
  onClose,
  onMic,
}: VoiceOverlayProps) {
  const feedEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, transcript, phase]);

  const hasReplies = messages.length > 0;
  const micDisabled = !supported || phase === 'thinking';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pago-voice-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pago Voice"
          className="fixed inset-0 z-[100] bg-black/75 text-white backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="mx-auto flex h-dvh w-full max-w-md flex-col px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),1rem)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/80">
                <span className="h-2 w-2 rounded-full bg-linear-to-br from-fuchsia-400 to-sky-400" />
                Pago Voice
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Inchide asistentul"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {hasReplies ? (
              <>
                <div className="flex flex-col items-center gap-2 pb-3 pt-2">
                  <Orb phase={phase} size="small" />
                  <span className="text-xs font-medium uppercase tracking-widest text-white/50">
                    {STATUS_LABELS[phase]}
                  </span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4 [scrollbar-width:none]">
                  {messages.map((message) => (
                    <Bubble key={message.id} role={message.role}>
                      {message.content}
                    </Bubble>
                  ))}
                  {transcript && <Bubble role="draft">{transcript}</Bubble>}
                  {phase === 'thinking' && (
                    <div className="flex justify-start">
                      <div className="rounded-3xl rounded-bl-md bg-white/10 px-4 py-3">
                        <ThinkingDots />
                      </div>
                    </div>
                  )}
                  <div ref={feedEnd} />
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-12">
                <Orb phase={phase} size="large" />
                <div className="flex min-h-28 w-full flex-col items-center gap-3 text-center">
                  {transcript ? (
                    <p className="break-words text-2xl font-semibold leading-tight text-white">{transcript}</p>
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-white">
                        {phase === 'listening' ? 'Cu ce te pot ajuta?' : STATUS_LABELS[phase]}
                      </p>
                      <p className="text-sm text-white/50">Ex: &quot;Cat am de plata la Digi?&quot;</p>
                    </>
                  )}
                  {phase === 'thinking' && <ThinkingDots />}
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 pt-2">
              {(error || !supported) && (
                <p role="alert" className="px-6 text-center text-sm text-rose-300">
                  {supported ? error : UNSUPPORTED_TEXT}
                </p>
              )}
              <button
                type="button"
                onClick={onMic}
                disabled={micDisabled}
                aria-label="Vorbeste cu Pago"
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white transition enabled:hover:bg-white/20 enabled:active:scale-95 disabled:opacity-60"
              >
                {phase === 'listening' && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-fuchsia-500/40"
                    animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                {phase === 'thinking' ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Mic className={`h-6 w-6 ${phase === 'listening' ? 'text-fuchsia-300' : ''}`} />
                )}
              </button>
              <p className="text-xs text-white/40">Spune &quot;Multumesc Pago&quot; ca sa inchizi</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
