export type BillStatus = "paid" | "due";

export type BillCategory = "auto" | "house" | "utilities" | "telecom" | "other";

export interface Bill {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  /** ISO date, yyyy-mm-dd */
  dueDate: string;
  status: BillStatus;
  category: BillCategory;
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
}

/** What the orb is doing right now. */
export type AssistantStatus = "idle" | "listening" | "thinking" | "speaking";

export interface RecognizerHandlers {
  /** Partial transcript while the user is still speaking (live interpretation). */
  onInterim: (text: string) => void;
  /** Final transcript once the user stopped speaking. */
  onFinal: (text: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
}

/** A bill selected for the payment cart. */
export interface CartBill {
  id: string;
  providerName: string;
  amount: number;
  /** ISO date, yyyy-mm-dd */
  dueDate: string;
}

/**
 * What the AI backend can read and trigger. The provider builds this for every
 * user message and passes it to `respond`, so voice/AI code calls these methods
 * instead of touching state.
 */
export interface AssistantCommands {
  bills: Bill[];
  paymentCart: CartBill[];
  addBillToCart: (bill: CartBill) => void;
  removeBillFromCart: (billId: string) => void;
  clearCart: () => void;
  openCheckout: () => void;
  openInvoice: (bill: Bill) => void;
  /** Publishes the action the AI asked for, so the UI can react (e.g. open checkout). */
  setDirective: (directive: AssistantDirective) => void;
}

/** The structured part of an AI reply: which action to run and on which bill. */
export interface AssistantDirective {
  action: string;
  target: string | null;
}

/**
 * Pluggable services. The UI only talks to these, so the voice/AI work
 * can replace any of them without touching the components.
 */
export interface AssistantAdapters {
  /**
   * Call inside a user tap. iOS only plays audio that a tap started, so this unlocks the
   * shared player before the (later, async) spoken reply arrives.
   */
  unlockAudio?: () => void;
  /** Produce the assistant's answer for a user message, and may trigger `commands`. */
  respond: (
    input: string,
    history: ChatMessage[],
    commands: AssistantCommands,
  ) => Promise<string>;
  /** Read the answer aloud; call onDone when speech ends (or fails). */
  speak: (text: string, onDone: () => void) => void;
  cancelSpeech: () => void;
  /** Pause the current reply (mute). Returns true if a reply is playing or loading. */
  pauseSpeech: () => boolean;
  /** Continue a paused reply (unmute). Returns true if a reply is still pending. */
  resumeSpeech: () => boolean;
  isVoiceSupported: () => boolean;
  /** Return null when speech recognition is unavailable. */
  createRecognizer: (handlers: RecognizerHandlers) => Recognizer | null;
}
