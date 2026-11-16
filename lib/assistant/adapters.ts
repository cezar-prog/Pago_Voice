import { isCartCommand, respondToCommand } from "./commands";
import type { ChatReply } from "@/lib/types";
import type { AssistantAdapters, ChatMessage, RecognizerHandlers } from "./types";

// Romanian: the app UI, speech recognition and synthesis are all in Romanian.
const SPEECH_LANG = "ro-RO";
const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED !== "false";
const CHAT_ENDPOINT = "/api/chat";

let ttsToken = 0;
let currentAudio: HTMLAudioElement | null = null;

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

/**
 * Default adapters. Answers come from the AI endpoint (/api/chat). Cart and checkout
 * commands are handled locally, and the local Romanian answers are the fallback when
 * the AI is not connected or fails.
 */
export const defaultAdapters: AssistantAdapters = {
  respond: async (input, history, commands) => {
    if (isCartCommand(input)) return respondToCommand(input, commands);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toApiMessages(input, history),
          bills: commands.bills,
        }),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);

      const data = (await res.json()) as Partial<ChatReply>;

      // The AI asked to prepare a payment: put that bill in our cart (checkout stays ours).
      if (data.action === "PREPARE_PAYMENT" && typeof data.billId === "string") {
        const bill = commands.bills.find((b) => b.id === data.billId);
        if (bill && bill.status === "due") {
          commands.addBillToCart({
            id: bill.id,
            providerName: bill.provider,
            amount: bill.amount,
            dueDate: bill.dueDate,
          });
        }
      }
      if (typeof data.reply === "string" && data.reply) return data.reply;
    } catch {
      // AI not connected or failed: answer from the local bill data below.
    }
    return respondToCommand(input, commands);
  },

  speak: (text, onDone) => {
    if (!VOICE_ENABLED || typeof window === "undefined") {
      onDone();
      return;
    }
    const token = ++ttsToken;
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("tts failed");
        return res.blob();
      })
      .then((blob) => {
        if (token !== ttsToken) return;
        const audio = new Audio(URL.createObjectURL(blob));
        currentAudio = audio;
        const done = () => {
          URL.revokeObjectURL(audio.src);
          if (currentAudio === audio) currentAudio = null;
          if (token === ttsToken) onDone();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.volume = 0.235;
        audio.play().catch(done);
      })
      .catch(() => {
        if (token === ttsToken) onDone();
      });
  },

  cancelSpeech: () => {
    ttsToken++;
    currentAudio?.pause();
    currentAudio = null;
  },

  isVoiceSupported: () => VOICE_ENABLED && getRecognitionCtor() !== null,

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
