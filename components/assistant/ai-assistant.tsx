"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { useAssistant } from "./assistant-provider";
import type { AssistantStatus, ChatMessage } from "@/lib/assistant/types";

/** Entry point: the bottom launcher button plus the full-screen assistant overlay. */
export function AiAssistant() {
  const { isOpen, open } = useAssistant();

  return (
    <>
      {!isOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <motion.button
            layoutId="pago-ai-orb"
            type="button"
            onClick={open}
            aria-label="Open Pago AI assistant"
            whileTap={{ scale: 0.94 }}
            className="pointer-events-auto h-16 w-16 rounded-full shadow-[0_10px_30px_rgba(139,92,246,0.45)]"
          >
            <OrbVisual status="idle" iconSize={26} />
          </motion.button>
        </div>
      )}

      <AnimatePresence>{isOpen && <AssistantOverlay />}</AnimatePresence>
    </>
  );
}

function AssistantOverlay() {
  const { expanded, status, messages, liveTranscript, close } = useAssistant();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex justify-center bg-zinc-950/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Pago AI assistant"
    >
      <div className="flex h-full w-full max-w-md flex-col px-5 pb-6 pt-8">
        <header className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/70">Pago Assistant</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close assistant"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10"
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
            className={expanded ? "h-20 w-20" : "h-40 w-40"}
          >
            <OrbVisual status={status} iconSize={expanded ? 26 : 52} />
          </motion.div>

          {!expanded && <Caption status={status} text={liveTranscript} />}
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
              <Conversation
                messages={messages}
                liveTranscript={liveTranscript}
                status={status}
              />
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

function OrbVisual({
  status,
  iconSize,
}: {
  status: AssistantStatus;
  iconSize: number;
}) {
  const listening = status === "listening";

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {listening &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-violet-400/70"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
          />
        ))}

      <motion.div
        className="relative flex h-full w-full items-center justify-center rounded-full"
        style={{
          background: "linear-gradient(135deg, #8b5cf6 0%, #d946ef 55%, #38bdf8 100%)",
          boxShadow: "0 0 40px rgba(168, 85, 247, 0.45)",
        }}
        animate={
          status === "speaking"
            ? { scale: [1, 1.07, 1] }
            : status === "thinking"
              ? { rotate: 360 }
              : { scale: 1, rotate: 0 }
        }
        transition={
          status === "speaking"
            ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
            : status === "thinking"
              ? { duration: 1.4, repeat: Infinity, ease: "linear" }
              : { duration: 0.3 }
        }
      >
        {listening ? (
          <Mic className="text-white" size={iconSize} />
        ) : (
          <Sparkles className="text-white" size={iconSize} />
        )}
      </motion.div>
    </div>
  );
}

const STATUS_HINT: Record<AssistantStatus, string> = {
  idle: "Tap the mic or type a question",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

function Caption({ status, text }: { status: AssistantStatus; text: string }) {
  return (
    <div className="mt-8 min-h-[3rem] max-w-xs text-center">
      <p className="text-xs uppercase tracking-widest text-white/50">{STATUS_HINT[status]}</p>
      {text && <p className="mt-2 text-lg leading-snug text-white">{text}</p>}
    </div>
  );
}

function Conversation({
  messages,
  liveTranscript,
  status,
}: {
  messages: ChatMessage[];
  liveTranscript: string;
  status: AssistantStatus;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveTranscript, status]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-violet-600 text-white"
                  : "rounded-bl-md bg-white/10 text-white/90"
              }`}
            >
              {m.text}
            </p>
          </li>
        ))}

        {liveTranscript && (
          <li className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600/40 px-4 py-2.5 text-sm italic text-white/80">
              {liveTranscript}
            </p>
          </li>
        )}

        {status === "thinking" && (
          <li className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white/10 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-white/70"
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
      {voiceError && (
        <p className="mb-2 text-center text-xs text-amber-300">{voiceError}</p>
      )}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 p-1.5 pl-1.5 backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={!voiceSupported}
          aria-pressed={micOn}
          aria-label={micOn ? "Turn microphone off" : "Turn microphone on"}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            micOn ? "bg-violet-500 text-white" : "bg-white/10 text-white/70"
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
          placeholder="Ask about your bills…"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/40"
        />

        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition-opacity disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
