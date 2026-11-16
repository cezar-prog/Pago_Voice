import { dispatchPayment } from "@/lib/payments/store";
import { MOCK_BILLS } from "./bills";
import type { AssistantAdapters, ChatMessage, RecognizerHandlers } from "./types";

const SPEECH_LANG = "ro-RO";
const CHAT_ENDPOINT = "/api/chat";
const FALLBACK_REPLY = "Scuze, nu pot raspunde acum. Incearca din nou.";

function toApiMessages(input: string, history: ChatMessage[]) {
  const messages = history
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, content: m.text }));
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content !== input) {
    messages.push({ role: "user", content: input });
  }
  return messages;
}

// Minimal typings for the Web Speech API (not in every TS lib version).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Default, browser-only adapters. The voice/AI branch can replace these. */
export const defaultAdapters: AssistantAdapters = {
  respond: async (input, history) => {
    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toApiMessages(input, history), bills: MOCK_BILLS }),
      });
      const data = (await res.json()) as { reply?: unknown; action?: unknown; billId?: unknown };
      if (data.action === "PREPARE_PAYMENT" && typeof data.billId === "string") {
        dispatchPayment(data.billId, { type: "PREPARE" });
      }
      return typeof data.reply === "string" && data.reply ? data.reply : FALLBACK_REPLY;
    } catch {
      return FALLBACK_REPLY;
    }
  },

  speak: (text, onDone) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onDone();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG;
    utterance.onend = onDone;
    utterance.onerror = onDone;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  },

  cancelSpeech: () => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  },

  isVoiceSupported: () => getRecognitionCtor() !== null,

  createRecognizer: (handlers: RecognizerHandlers) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;

    const rec = new Ctor();
    rec.lang = SPEECH_LANG;
    // One utterance per session: the final result arrives when the user stops speaking.
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final.trim()) handlers.onFinal(final.trim());
      else if (interim.trim()) handlers.onInterim(interim.trim());
    };
    rec.onerror = (e) => handlers.onError(e.error);
    rec.onend = () => handlers.onEnd();

    return {
      start: () => {
        try {
          rec.start();
        } catch {
          // start() throws if already running; ignore.
        }
      },
      stop: () => {
        try {
          rec.abort();
        } catch {
          // Already stopped; ignore.
        }
      },
    };
  },
};
