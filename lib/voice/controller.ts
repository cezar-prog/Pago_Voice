import { isChatReply, type Bill, type ChatReply, type VoiceMessage, type VoicePhase } from '@/lib/types';
import { capitalize, CLOSE_RE, normalizeSpeech, WAKE_RE } from './text';
import {
  getSpeechRecognitionConstructor,
  joinResults,
  type SpeechErrorEvent,
  type SpeechRecognitionLike,
  type SpeechResultEvent,
} from './recognition';

const SILENCE_MS = 1300;
const INACTIVITY_MS = 10000;
const RESTART_MS = 300;
const MAX_ERRORS = 4;

const ERROR_REPLY = 'Scuze, a aparut o problema. Mai incearca o data.';
const UNSUPPORTED = 'Browserul tau nu suporta recunoasterea vocala. Incearca in Chrome.';
const BLOCKED = 'Accesul la microfon este blocat. Permite microfonul din setarile browserului.';
const NO_MIC = 'Nu am gasit niciun microfon.';
const NETWORK = 'Recunoasterea vocala are nevoie de conexiune la internet.';
const STOPPED = 'Recunoasterea vocala s-a oprit. Atinge microfonul ca sa reiei.';

type Timer = ReturnType<typeof setTimeout>;
type RecognitionMode = 'wake' | 'question';

export interface VoiceCallbacks {
  getBills: () => Bill[];
  onOpenChange: (open: boolean) => void;
  onPhase: (phase: VoicePhase) => void;
  onTranscript: (text: string) => void;
  onMessages: (messages: VoiceMessage[]) => void;
  onError: (message: string | null) => void;
  onPreparePayment: (billId: string) => void;
}

export interface VoiceController {
  start: () => void;
  tapMic: () => void;
  close: () => void;
  destroy: () => void;
}

let idCounter = 0;

function createId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

function pickRomanianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase() === 'ro-ro') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('ro')) ??
    null
  );
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ro-RO';
    utterance.rate = 1.05;
    const voice = pickRomanianVoice();
    if (voice) utterance.voice = voice;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      resolve();
    };
    const safety = setTimeout(finish, 4000 + text.length * 110);
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
  });
}

function cancelSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();
}

async function requestReply(history: VoiceMessage[], bills: Bill[]): Promise<ChatReply> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history.map(({ role, content }) => ({ role, content })),
        bills,
      }),
    });
    const json: unknown = await res.json();
    return isChatReply(json) ? json : { reply: ERROR_REPLY, action: 'NONE', billId: null };
  } catch {
    return { reply: ERROR_REPLY, action: 'NONE', billId: null };
  }
}

export function createVoiceController(cb: VoiceCallbacks): VoiceController {
  const Ctor = getSpeechRecognitionConstructor();

  let destroyed = false;
  let open = false;
  let phase: VoicePhase = 'idle';
  let messages: VoiceMessage[] = [];
  let mode: RecognitionMode = 'wake';
  let listening = false;
  let blocked = false;
  let errorCount = 0;
  let prefix = '';
  let pending = '';
  let turn = 0;

  let rec: SpeechRecognitionLike | null = null;
  let recGen = 0;

  let silenceTimer: Timer | undefined;
  let inactivityTimer: Timer | undefined;
  let restartTimer: Timer | undefined;

  const setPhase = (next: VoicePhase) => {
    phase = next;
    cb.onPhase(next);
  };

  const setMessages = (next: VoiceMessage[]) => {
    messages = next;
    cb.onMessages(next);
  };

  const cancelTimer = (timer: Timer | undefined) => {
    if (timer) clearTimeout(timer);
  };

  const clearSilence = () => {
    cancelTimer(silenceTimer);
    silenceTimer = undefined;
  };

  const clearInactivity = () => {
    cancelTimer(inactivityTimer);
    inactivityTimer = undefined;
  };

  const clearRestart = () => {
    cancelTimer(restartTimer);
    restartTimer = undefined;
  };

  const clearAllTimers = () => {
    clearSilence();
    clearInactivity();
    clearRestart();
  };

  const detachRecognition = () => {
    recGen += 1;
    const current = rec;
    rec = null;
    if (!current) return;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try {
      current.abort();
    } catch {
      // the instance already stopped
    }
  };

  const giveUp = () => {
    listening = false;
    detachRecognition();
    clearRestart();
    setPhase('idle');
    cb.onError(STOPPED);
  };

  const scheduleRestart = () => {
    if (destroyed || blocked || !listening) return;
    if (errorCount >= MAX_ERRORS) {
      giveUp();
      return;
    }
    clearRestart();
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      startRecognition();
    }, RESTART_MS);
  };

  const armSilence = () => {
    clearSilence();
    silenceTimer = setTimeout(() => {
      silenceTimer = undefined;
      void submit();
    }, SILENCE_MS);
  };

  const startInactivity = () => {
    clearInactivity();
    inactivityTimer = setTimeout(() => {
      inactivityTimer = undefined;
      if (open && phase === 'listening' && !pending) closeAssistant();
    }, INACTIVITY_MS);
  };

  const handleError = (error: string) => {
    if (error === 'no-speech' || error === 'aborted') return;
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      blocked = true;
      listening = false;
      detachRecognition();
      setPhase('idle');
      cb.onError(BLOCKED);
      return;
    }
    if (error === 'audio-capture') {
      blocked = true;
      listening = false;
      detachRecognition();
      setPhase('idle');
      cb.onError(NO_MIC);
      return;
    }
    errorCount += 1;
    if (error === 'network') cb.onError(NETWORK);
  };

  const handleWake = (text: string) => {
    const normalized = normalizeSpeech(text);
    const match = WAKE_RE.exec(normalized);
    if (!match) return;
    const rest = normalized.slice(match.index + match[0].length).trim();
    openAssistant(rest);
  };

  const handleQuestion = (text: string) => {
    const full = [prefix, text].map((part) => part.trim()).filter(Boolean).join(' ');
    if (CLOSE_RE.test(normalizeSpeech(full))) {
      closeAssistant();
      return;
    }
    pending = full;
    cb.onTranscript(capitalize(full));
    if (full) {
      clearInactivity();
      armSilence();
    }
  };

  const handleResult = (event: SpeechResultEvent) => {
    errorCount = 0;
    const text = joinResults(event.results);
    if (mode === 'wake') handleWake(text);
    else handleQuestion(text);
  };

  const startRecognition = () => {
    if (!Ctor || destroyed || blocked || !listening) return;
    detachRecognition();
    const gen = recGen;
    const instance = new Ctor();
    instance.lang = 'ro-RO';
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    instance.onresult = (event) => {
      if (gen === recGen) handleResult(event);
    };
    instance.onerror = (event: SpeechErrorEvent) => {
      if (gen === recGen) handleError(event.error);
    };
    instance.onend = () => {
      if (gen !== recGen) return;
      rec = null;
      if (mode === 'question') prefix = pending;
      scheduleRestart();
    };
    rec = instance;
    try {
      instance.start();
    } catch {
      rec = null;
      errorCount += 1;
      scheduleRestart();
    }
  };

  const startWake = () => {
    clearAllTimers();
    mode = 'wake';
    prefix = '';
    pending = '';
    setPhase('wake');
    if (!Ctor) {
      setPhase('idle');
      cb.onError(UNSUPPORTED);
      return;
    }
    listening = true;
    startRecognition();
  };

  const startQuestion = (initial: string) => {
    turn += 1;
    clearSilence();
    clearRestart();
    mode = 'question';
    prefix = initial;
    pending = initial;
    cb.onTranscript(capitalize(initial));
    setPhase('listening');
    if (!Ctor) {
      setPhase('idle');
      cb.onError(UNSUPPORTED);
      return;
    }
    listening = true;
    startRecognition();
    startInactivity();
    if (initial) {
      clearInactivity();
      armSilence();
    }
  };

  function openAssistant(initial: string) {
    if (open) return;
    open = true;
    cb.onError(null);
    cb.onOpenChange(true);
    startQuestion(initial);
  }

  function closeAssistant() {
    turn += 1;
    clearAllTimers();
    cancelSpeech();
    listening = false;
    detachRecognition();
    prefix = '';
    pending = '';
    cb.onTranscript('');
    setMessages([]);
    cb.onError(null);
    if (open) {
      open = false;
      cb.onOpenChange(false);
    }
    startWake();
  }

  async function submit() {
    const question = pending.trim();
    if (destroyed || !open || phase !== 'listening' || !question) return;

    clearAllTimers();
    listening = false;
    detachRecognition();
    prefix = '';
    pending = '';
    cb.onTranscript('');

    const id = turn + 1;
    turn = id;
    const history: VoiceMessage[] = [
      ...messages,
      { id: createId(), role: 'user', content: capitalize(question) },
    ];
    setMessages(history);
    setPhase('thinking');

    const reply = await requestReply(history, cb.getBills());
    if (destroyed || id !== turn || !open) return;

    setMessages([...history, { id: createId(), role: 'assistant', content: reply.reply }]);
    setPhase('speaking');
    await speak(reply.reply);
    if (destroyed || id !== turn || !open) return;

    if (reply.action === 'PREPARE_PAYMENT' && reply.billId) {
      const billId = reply.billId;
      closeAssistant();
      cb.onPreparePayment(billId);
      return;
    }
    if (reply.action === 'CLOSE') {
      closeAssistant();
      return;
    }
    startQuestion('');
  }

  return {
    start() {
      if (destroyed) return;
      startWake();
    },
    tapMic() {
      if (destroyed || phase === 'thinking') return;
      blocked = false;
      errorCount = 0;
      cb.onError(null);
      if (!open) {
        openAssistant('');
        return;
      }
      turn += 1;
      cancelSpeech();
      startQuestion('');
    },
    close() {
      if (destroyed) return;
      closeAssistant();
    },
    destroy() {
      destroyed = true;
      clearAllTimers();
      listening = false;
      detachRecognition();
      cancelSpeech();
    },
  };
}
