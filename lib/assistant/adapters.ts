import { isShowAllMonth, localReply, respondToCommand, suspiciousBillWarning } from "./commands";
import type { ChatReply } from "@/lib/types";
import type { AssistantAdapters, AssistantCommands, ChatMessage, RecognizerHandlers } from "./types";

// Romanian: the app UI, speech recognition and synthesis are all in Romanian.
const SPEECH_LANG = "ro-RO";
const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED !== "false";
const CHAT_ENDPOINT = "/api/chat";
/** Longest wait for the AI or the voice service before we answer locally, so the loader always stops. */
const REQUEST_TIMEOUT_MS = 15_000;

let ttsToken = 0;
let currentAudio: HTMLAudioElement | null = null;
let speechActive = false;
let speechPaused = false;

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
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onnomatch: (() => void) | null;
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
 * Answers one message: the local router first (cart, checkout, unpaid list, follow-up),
 * then the AI endpoint, then the local bill answers if the AI is down or slow.
 */
async function answer(
  input: string,
  history: ChatMessage[],
  commands: AssistantCommands,
): Promise<string> {
  // Cart, checkout, unpaid list and the payment follow-up are answered here, never by the AI.
  const local = localReply(input, commands, history);
  if (local !== null) return local;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toApiMessages(input, history),
        bills: commands.bills,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);

    const data = (await res.json()) as Partial<ChatReply>;
    commands.setDirective({
      action: typeof data.action === "string" ? data.action : "NONE",
      target: typeof data.billId === "string" ? data.billId : null,
    });

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
    // AI not connected, failed or timed out: answer from the local bill data below.
  } finally {
    window.clearTimeout(timer);
  }
  return respondToCommand(input, commands, history);
}

/**
 * Default adapters. Answers come from the local router and the AI endpoint (/api/chat).
 * The local answers are the fallback when the AI is not connected, fails or times out.
 */
export const defaultAdapters: AssistantAdapters = {
  respond: async (input, history, commands) => {
    const reply = await answer(input, history, commands);
    // "Show all this month": warn about any bill that is unusually high, even on a general query.
    if (!isShowAllMonth(input)) return reply;
    const warning = suspiciousBillWarning(commands.bills);
    return warning ? `${reply}\n\n${warning}` : reply;
  },

  speak: (text, onDone) => {
    if (!VOICE_ENABLED || typeof window === "undefined") {
      onDone();
      return;
    }
    const token = ++ttsToken;
    speechActive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("tts failed");
        return res.blob();
      })
      .then((blob) => {
        window.clearTimeout(timer);
        if (token !== ttsToken) return;
        const audio = new Audio(URL.createObjectURL(blob));
        currentAudio = audio;
        const done = () => {
          URL.revokeObjectURL(audio.src);
          if (currentAudio === audio) currentAudio = null;
          if (token !== ttsToken) return;
          speechActive = false;
          onDone();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.volume = 0.235;
        if (speechPaused) return; // Muted while loading: starts when resumed.
        audio.play().catch(done);
      })
      .catch(() => {
        window.clearTimeout(timer);
        if (token !== ttsToken) return;
        speechActive = false;
        onDone();
      });
  },

  cancelSpeech: () => {
    ttsToken++;
    speechActive = false;
    speechPaused = false;
    currentAudio?.pause();
    currentAudio = null;
  },

  pauseSpeech: () => {
    speechPaused = true;
    currentAudio?.pause();
    return speechActive;
  },

  resumeSpeech: () => {
    speechPaused = false;
    if (currentAudio) {
      const audio = currentAudio;
      audio.play().catch(() => audio.onerror?.(new Event("error")));
    }
    return speechActive;
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
    rec.onstart = () => console.info("[voice] start");
    rec.onspeechstart = () => console.info("[voice] speech start");
    rec.onnomatch = () => console.info("[voice] no match");
    rec.onerror = (e) => {
      console.warn("[voice] error", e.error);
      handlers.onError(e.error);
    };
    rec.onend = () => {
      console.info("[voice] end");
      handlers.onEnd();
    };

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
