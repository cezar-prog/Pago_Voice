"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { defaultAdapters } from "@/lib/assistant/adapters";
import { MOCK_BILLS } from "@/lib/assistant/bills";
import { FALLBACK_REPLY } from "@/lib/assistant/intents";
import { playWakeChime } from "@/lib/assistant/chime";
import { extractWakeRest, isClosePhrase } from "@/lib/assistant/text";
import { throttleLatest } from "@/lib/assistant/throttle";
import type {
  AssistantAdapters,
  AssistantCommands,
  AssistantDirective,
  AssistantStatus,
  Bill,
  CartBill,
  ChatMessage,
  Recognizer,
} from "@/lib/assistant/types";

/** Closes the assistant after this long without activity. */
const IDLE_TIMEOUT_MS = 10_000;

/** Pause between wake-listener sessions (the browser ends each one after an utterance). */
const WAKE_RESTART_MS = 300;

/** Minimum gap between redraws of the live transcript while the user is speaking. */
const LIVE_TRANSCRIPT_MS = 250;

/** Shown and spoken when the assistant opens without a question yet. */
const WELCOME_TEXT = "Bună! Sunt asistentul Pago. Cu ce te pot ajuta astăzi?";

type Busy = "idle" | "thinking" | "speaking";

interface AssistantContextValue {
  isOpen: boolean;
  /** False: bubble centred on screen. True: bubble moved to top, conversation shown. */
  expanded: boolean;
  micOn: boolean;
  voiceSupported: boolean;
  voiceError: string | null;
  status: AssistantStatus;
  messages: ChatMessage[];
  liveTranscript: string;
  /** Opens the assistant (used by the bottom button and by the "Hei Pago" wake word). */
  open: () => void;
  close: () => void;
  toggleMic: () => void;
  isAssistantMuted: boolean;
  toggleAssistantMute: () => void;
  sendText: (text: string) => void;
  /** Call on user typing so the idle timer resets. */
  noteActivity: () => void;

  /** All bills, with `status` updated when a payment is confirmed. */
  bills: Bill[];
  /** Bills selected for paying together. */
  paymentCart: CartBill[];
  addBillToCart: (bill: CartBill) => void;
  removeBillFromCart: (billId: string) => void;
  clearCart: () => void;
  checkoutOpen: boolean;
  openCheckout: () => void;
  closeCheckout: () => void;
  /** Marks every bill in the cart as paid and empties the cart. */
  confirmPayment: () => void;
  /** Bill whose invoice is open in the viewer, or null. */
  viewingInvoice: Bill | null;
  openInvoice: (bill: Bill) => void;
  closeInvoice: () => void;
  /** Latest action the AI asked for (PREPARE_PAYMENT, OPEN_INVOICE, ...), or null. */
  directive: AssistantDirective | null;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({
  children,
  adapters,
}: {
  children: ReactNode;
  /** Override any service, e.g. the voice/AI implementation. */
  adapters?: Partial<AssistantAdapters>;
}) {
  const adaptersRef = useRef<AssistantAdapters>({ ...defaultAdapters, ...adapters });

  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [isAssistantMuted, setIsAssistantMuted] = useState(false);
  const mutedRef = useRef(false);
  const [busy, setBusy] = useState<Busy>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [lastActivity, setLastActivity] = useState(0);
  const [micTick, setMicTick] = useState(0);
  const [bills, setBills] = useState<Bill[]>(() => MOCK_BILLS.map((b) => ({ ...b })));
  const [paymentCart, setPaymentCart] = useState<CartBill[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Bill | null>(null);
  const [directive, setDirective] = useState<AssistantDirective | null>(null);

  // Refs mirror state where async callbacks need the latest value.
  const isOpenRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const billsRef = useRef<Bill[]>(bills);
  const cartRef = useRef<CartBill[]>([]);
  /** Incremented on every new turn/session; stale async work checks it and bails. */
  const turnRef = useRef(0);
  /** Recognizer sessions that ended without hearing anything, in a row. */
  const silentEndsRef = useRef(0);
  const handleUtteranceRef = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => {
    setVoiceSupported(adaptersRef.current.isVoiceSupported());
  }, []);

  const pushMessage = useCallback((role: ChatMessage["role"], text: string) => {
    // Not crypto.randomUUID: it is unavailable on non-HTTPS LAN hosts (e.g. phone testing).
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      text,
    };
    messagesRef.current = [...messagesRef.current, message];
    setMessages(messagesRef.current);
  }, []);

  const close = useCallback(() => {
    turnRef.current += 1;
    adaptersRef.current.cancelSpeech();
    isOpenRef.current = false;
    setIsOpen(false);
    setExpanded(false);
    setMicOn(false);
    setBusy("idle");
    setLiveTranscript("");
    setVoiceError(null);
  }, []);

  // Opens the overlay. With `greet`, the assistant welcomes the user (text and voice).
  const openAssistant = useCallback(
    (greet: boolean) => {
      if (isOpenRef.current) return;
      isOpenRef.current = true;
      const turn = ++turnRef.current;
      messagesRef.current = [];
      setMessages([]);
      setIsOpen(true);
      setExpanded(false);
      setBusy("idle");
      setLiveTranscript("");
      setVoiceError(null);
      setMicOn(adaptersRef.current.isVoiceSupported());
      setLastActivity(Date.now());
      if (!greet) return;

      setExpanded(true);
      pushMessage("assistant", WELCOME_TEXT);
      if (mutedRef.current) return;
      setBusy("speaking");
      adaptersRef.current.speak(WELCOME_TEXT, () => {
        if (turn !== turnRef.current) return;
        setBusy("idle");
        setLastActivity(Date.now());
      });
    },
    [pushMessage],
  );

  // A tap on the open button: unlock audio inside the tap so the spoken welcome can play on iPhone.
  const open = useCallback(() => {
    adaptersRef.current.unlockAudio?.();
    openAssistant(true);
  }, [openAssistant]);

  // ---- Payment cart ------------------------------------------------------

  const addBillToCart = useCallback((bill: CartBill) => {
    const stored = billsRef.current.find((b) => b.id === bill.id);
    if (stored?.status === "paid") return;
    if (cartRef.current.some((b) => b.id === bill.id)) return;
    cartRef.current = [...cartRef.current, bill];
    setPaymentCart(cartRef.current);
  }, []);

  const removeBillFromCart = useCallback((billId: string) => {
    cartRef.current = cartRef.current.filter((b) => b.id !== billId);
    setPaymentCart(cartRef.current);
  }, []);

  const clearCart = useCallback(() => {
    cartRef.current = [];
    setPaymentCart([]);
  }, []);

  const openCheckout = useCallback(() => {
    if (cartRef.current.length === 0) return;
    setCheckoutOpen(true);
  }, []);

  const closeCheckout = useCallback(() => setCheckoutOpen(false), []);

  // The AI asked to pay a bill: the bill is already in the cart (adapter), so open checkout.
  useEffect(() => {
    if (directive?.action === "PREPARE_PAYMENT" && cartRef.current.length > 0) {
      setCheckoutOpen(true);
    }
  }, [directive]);

  const confirmPayment = useCallback(() => {
    const paidIds = new Set(cartRef.current.map((b) => b.id));
    billsRef.current = billsRef.current.map((b) =>
      paidIds.has(b.id) ? { ...b, status: "paid" } : b,
    );
    setBills(billsRef.current);
    cartRef.current = [];
    setPaymentCart([]);
  }, []);

  // ---- Invoice viewer ----------------------------------------------------

  const openInvoice = useCallback((bill: Bill) => setViewingInvoice(bill), []);
  const closeInvoice = useCallback(() => setViewingInvoice(null), []);

  // ---- Conversation ------------------------------------------------------

  const handleUtterance = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setLiveTranscript("");
      setLastActivity(Date.now());

      if (isClosePhrase(text)) {
        close();
        return;
      }

      const turn = ++turnRef.current;
      adaptersRef.current.cancelSpeech();
      setExpanded(true);
      setBusy("thinking");
      pushMessage("user", text);

      const commands: AssistantCommands = {
        bills: billsRef.current,
        paymentCart: cartRef.current,
        addBillToCart,
        removeBillFromCart,
        clearCart,
        openCheckout,
        openInvoice,
        setDirective,
      };
      // Never leave the loader running: if answering throws, show the fallback instead.
      let reply: string;
      try {
        reply = await adaptersRef.current.respond(text, messagesRef.current, commands);
      } catch {
        reply = FALLBACK_REPLY;
      }
      if (turn !== turnRef.current) return;

      pushMessage("assistant", reply);
      if (mutedRef.current) {
        setBusy("idle");
        setLastActivity(Date.now());
        return;
      }
      setBusy("speaking");
      adaptersRef.current.speak(reply, () => {
        if (turn !== turnRef.current) return;
        setBusy("idle");
        setLastActivity(Date.now());
      });
    },
    [close, pushMessage, addBillToCart, removeBillFromCart, clearCart, openCheckout, openInvoice],
  );

  useEffect(() => {
    handleUtteranceRef.current = handleUtterance;
  }, [handleUtterance]);

  const sendText = useCallback((text: string) => {
    adaptersRef.current.unlockAudio?.();
    void handleUtteranceRef.current(text);
  }, []);

  const toggleMic = useCallback(() => {
    adaptersRef.current.unlockAudio?.();
    setMicOn((on) => !on);
    setLiveTranscript("");
    setLastActivity(Date.now());
  }, []);

  const noteActivity = useCallback(() => setLastActivity(Date.now()), []);

  // Pause listening and the idle timeout while the checkout or an invoice is on screen.
  const paused = checkoutOpen || viewingInvoice !== null;

  // Mutes the assistant's voice. Muting mid-speech stops the audio at once and frees the UI.
  const toggleAssistantMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsAssistantMuted(next);
    if (next) {
      // Pause, don't discard: unmuting continues the same reply.
      if (adaptersRef.current.pauseSpeech()) setBusy((b) => (b === "speaking" ? "idle" : b));
    } else if (adaptersRef.current.resumeSpeech()) {
      setBusy("speaking");
    }
  }, []);

  // Microphone: listen only while open, mic enabled, the assistant is not busy and
  // checkout is not open (so it never transcribes its own answer or the payment screen).
  // Re-runs on `micTick` to restart after the browser ends a session on silence.
  useEffect(() => {
    if (!isOpen || !micOn || busy !== "idle" || paused) return;

    let active = true;
    let heard = false;
    // Interim words arrive many times a second; paint them at most every 250 ms.
    const paint = throttleLatest(setLiveTranscript, LIVE_TRANSCRIPT_MS);
    const recognizer = adaptersRef.current.createRecognizer({
      onInterim: (text) => {
        if (!active) return;
        heard = true;
        paint.push(text);
        setLastActivity(Date.now());
      },
      onFinal: (text) => {
        if (!active) return;
        heard = true;
        paint.cancel();
        silentEndsRef.current = 0;
        void handleUtteranceRef.current(text);
      },
      onEnd: () => {
        if (!active) return;
        // Chrome can end the session at once (e.g. "aborted"). Without a cap this restarts
        // every 300 ms forever, so stop after 3 silent sessions in a row.
        silentEndsRef.current = heard ? 0 : silentEndsRef.current + 1;
        if (silentEndsRef.current >= 3) {
          silentEndsRef.current = 0;
          setMicOn(false);
          setVoiceError("Microfonul nu pornește. Apasă microfonul ca să încerci din nou.");
          return;
        }
        window.setTimeout(() => {
          if (active) setMicTick((n) => n + 1);
        }, 300);
      },
      onError: (error) => {
        if (!active) return;
        if (error === "not-allowed" || error === "service-not-allowed") {
          setMicOn(false);
          setVoiceError("Accesul la microfon este blocat. Scrie întrebarea în loc.");
        } else if (error !== "no-speech" && error !== "aborted") {
          setVoiceError(`Intrarea vocală a eșuat (${error}). Scrie întrebarea în loc.`);
        }
      },
    });
    if (!recognizer) return;

    recognizer.start();
    return () => {
      active = false;
      paint.cancel();
      recognizer.stop();
    };
  }, [isOpen, micOn, busy, micTick, paused]);

  // Wake word: while the assistant is closed, listen for "Hello Pago" / "Hi Pago" and open it.
  // Each recognizer session ends after one utterance, so it is restarted until a wake phrase
  // is heard or the effect is cleaned up.
  useEffect(() => {
    if (isOpen || !voiceSupported || paused) return;

    let active = true;
    let restartId: number | undefined;
    let recognizer: Recognizer | null = null;

    const stopListening = () => {
      active = false;
      window.clearTimeout(restartId);
      recognizer?.stop();
      recognizer = null;
    };

    const heard = (text: string, isFinal: boolean) => {
      const rest = extractWakeRest(text);
      if (rest === null) return;
      stopListening();
      playWakeChime();
      // Greet only when no question came with the wake phrase.
      openAssistant(rest === "");
      if (isFinal && rest) void handleUtteranceRef.current(rest);
    };

    const listen = () => {
      if (!active) return;
      recognizer = adaptersRef.current.createRecognizer({
        onInterim: (text) => heard(text, false),
        onFinal: (text) => heard(text, true),
        onEnd: () => {
          recognizer = null;
          if (active) restartId = window.setTimeout(listen, WAKE_RESTART_MS);
        },
        onError: (error) => {
          // Permission denied: stop for good instead of retrying forever.
          if (error === "not-allowed" || error === "service-not-allowed") stopListening();
        },
      });
      if (!recognizer) {
        active = false;
        return;
      }
      recognizer.start();
    };

    listen();
    return stopListening;
  }, [isOpen, voiceSupported, paused, openAssistant]);

  // Idle timeout: close after 10 s with no activity (not while the assistant is working
  // or while the checkout screen is open).
  useEffect(() => {
    if (!isOpen || busy !== "idle" || paused) return;
    const id = window.setTimeout(close, IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [isOpen, busy, lastActivity, paused, close]);

  const status: AssistantStatus =
    busy !== "idle" ? busy : micOn ? "listening" : "idle";

  const value = useMemo<AssistantContextValue>(
    () => ({
      isOpen,
      expanded,
      micOn,
      isAssistantMuted,
      toggleAssistantMute,
      voiceSupported,
      voiceError,
      status,
      messages,
      liveTranscript,
      open,
      close,
      toggleMic,
      sendText,
      noteActivity,
      bills,
      paymentCart,
      addBillToCart,
      removeBillFromCart,
      clearCart,
      checkoutOpen,
      openCheckout,
      closeCheckout,
      confirmPayment,
      viewingInvoice,
      openInvoice,
      closeInvoice,
      directive,
    }),
    [
      isOpen,
      expanded,
      micOn,
      isAssistantMuted,
      toggleAssistantMute,
      voiceSupported,
      voiceError,
      status,
      messages,
      liveTranscript,
      open,
      close,
      toggleMic,
      sendText,
      noteActivity,
      bills,
      paymentCart,
      addBillToCart,
      removeBillFromCart,
      clearCart,
      checkoutOpen,
      openCheckout,
      closeCheckout,
      confirmPayment,
      viewingInvoice,
      openInvoice,
      closeInvoice,
      directive,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}
