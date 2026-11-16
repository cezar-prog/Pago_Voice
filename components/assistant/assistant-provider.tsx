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
import { isClosePhrase } from "@/lib/assistant/text";
import type {
  AssistantAdapters,
  AssistantCommands,
  AssistantStatus,
  Bill,
  CartBill,
  ChatMessage,
} from "@/lib/assistant/types";

/** Closes the assistant after this long without activity. */
const IDLE_TIMEOUT_MS = 10_000;

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

  // Refs mirror state where async callbacks need the latest value.
  const isOpenRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const billsRef = useRef<Bill[]>(bills);
  const cartRef = useRef<CartBill[]>([]);
  /** Incremented on every new turn/session; stale async work checks it and bails. */
  const turnRef = useRef(0);
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

  const open = useCallback(() => {
    if (isOpenRef.current) return;
    isOpenRef.current = true;
    turnRef.current += 1;
    messagesRef.current = [];
    setMessages([]);
    setIsOpen(true);
    setExpanded(false);
    setBusy("idle");
    setLiveTranscript("");
    setVoiceError(null);
    setMicOn(adaptersRef.current.isVoiceSupported());
    setLastActivity(Date.now());
  }, []);

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
      };
      const reply = await adaptersRef.current.respond(text, messagesRef.current, commands);
      if (turn !== turnRef.current) return;

      pushMessage("assistant", reply);
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
    void handleUtteranceRef.current(text);
  }, []);

  const toggleMic = useCallback(() => {
    setMicOn((on) => !on);
    setLiveTranscript("");
    setLastActivity(Date.now());
  }, []);

  const noteActivity = useCallback(() => setLastActivity(Date.now()), []);

  // Pause listening and the idle timeout while the checkout or an invoice is on screen.
  const paused = checkoutOpen || viewingInvoice !== null;

  // Microphone: listen only while open, mic enabled, the assistant is not busy and
  // checkout is not open (so it never transcribes its own answer or the payment screen).
  // Re-runs on `micTick` to restart after the browser ends a session on silence.
  useEffect(() => {
    if (!isOpen || !micOn || busy !== "idle" || paused) return;

    let active = true;
    const recognizer = adaptersRef.current.createRecognizer({
      onInterim: (text) => {
        if (!active) return;
        setLiveTranscript(text);
        setLastActivity(Date.now());
      },
      onFinal: (text) => {
        if (!active) return;
        void handleUtteranceRef.current(text);
      },
      onEnd: () => {
        if (!active) return;
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
      recognizer.stop();
    };
  }, [isOpen, micOn, busy, micTick, paused]);

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
    }),
    [
      isOpen,
      expanded,
      micOn,
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
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}
