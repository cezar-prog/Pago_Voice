import {
  executeAssistantReply,
  isShowAllMonth,
  respondToCommand,
  suspiciousBillWarning,
} from "./commands";
import type { AssistantReply } from "@/lib/types";
import type { AssistantAdapters, AssistantCommands, ChatMessage, RecognizerHandlers } from "./types";

// Romanian: the app UI, speech recognition and synthesis are all in Romanian.
const SPEECH_LANG = "ro-RO";
const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED !== "false";
const CHAT_ENDPOINT = "/api/chat";
/** Longest wait for the AI or the voice service before we answer locally, so the loader always stops. */
const REQUEST_TIMEOUT_MS = 15_000;
/** One-sample silent WAV, used to unlock the player on a tap. */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

let ttsToken = 0;
let speechActive = false;
let speechPaused = false;
/**
 * One shared <audio> element for every reply. iOS only lets an element play if a user tap
 * started it, so the same element is unlocked on the tap and reused for the spoken reply.
 */
let player: HTMLAudioElement | null = null;

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
  }
  return player;
}

function unlockAudio() {
  if (typeof window === "undefined") return;
  const audio = getPlayer();
  audio.src = SILENT_WAV;
  audio.play().then(() => audio.pause()).catch(() => {});
}

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

/** Asks the AI for its strict structured reply. Throws when it is missing, fails or times out. */
async function askAi(input: string, history: ChatMessage[], commands: AssistantCommands) {
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
    const data = (await res.json()) as Partial<AssistantReply>;
    if (typeof data.responseText !== "string" || !data.responseText.trim()) {
      throw new Error("empty responseText");
    }
    return data as AssistantReply;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * The AI is the primary router. Its structured reply is the source of truth: `responseText`
 * is always returned for the app to show and speak, and the app acts only on TRANSACTIONAL
 * replies with an action. The local keyword router runs only when the AI is unavailable.
 */
async function answer(
  input: string,
  history: ChatMessage[],
  commands: AssistantCommands,
): Promise<string> {
  let reply: AssistantReply;
  try {
    reply = await askAi(input, history, commands);
  } catch {
    // AI not connected, failed or timed out: offline fallback, the local router.
    const local = respondToCommand(input, commands, history);
    const warning = isShowAllMonth(input) ? suspiciousBillWarning(commands.bills) : null;
    return warning ? `${local}\n\n${warning}` : local;
  }

  commands.setDirective({ action: reply.action, target: null });
  executeAssistantReply(reply, commands);

  // "Show all this month": warn about unusually high bills even on a general query.
  const warning =
    reply.triage === "TRANSACTIONAL" && reply.action === "SHOW_ALL"
      ? suspiciousBillWarning(commands.bills)
      : null;
  return warning ? `${reply.responseText}\n\n${warning}` : reply.responseText;
}

/**
 * Default adapters. Answers come from the AI endpoint (/api/chat), which returns the strict
 * structured reply for every message. The local router answers only when the AI is unavailable.
 */
export const defaultAdapters: AssistantAdapters = {
  unlockAudio,

  respond: (input, history, commands) => answer(input, history, commands),

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
        const audio = getPlayer();
        const url = URL.createObjectURL(blob);
        const done = () => {
          audio.onended = null;
          audio.onerror = null;
          URL.revokeObjectURL(url);
          if (token !== ttsToken) return;
          speechActive = false;
          onDone();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.src = url;
        audio.volume = 0.235;
        if (speechPaused) return; // Muted while loading: starts when resumed.
        audio.play().catch((err) => {
          // Blocked autoplay (iOS without a tap) or a bad file: say why, then go on.
          console.warn("[voice] speech playback failed", err);
          done();
        });
      })
      .catch((err) => {
        window.clearTimeout(timer);
        console.warn("[voice] speech request failed", err);
        if (token !== ttsToken) return;
        speechActive = false;
        onDone();
      });
  },

  cancelSpeech: () => {
    ttsToken++;
    speechActive = false;
    speechPaused = false;
    player?.pause();
  },

  pauseSpeech: () => {
    speechPaused = true;
    player?.pause();
    return speechActive;
  },

  resumeSpeech: () => {
    speechPaused = false;
    if (player && speechActive) {
      const audio = player;
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
