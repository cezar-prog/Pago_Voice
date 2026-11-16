export type PaymentState =
  | "idle"
  | "preparing"
  | "confirming"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled";

export type PaymentEvent =
  | { type: "PREPARE" }
  | { type: "PREPARED" }
  | { type: "CONFIRM" }
  | { type: "CANCEL" }
  | { type: "SUCCEEDED" }
  | { type: "FAILED"; reason: string }
  | { type: "RETRY" }
  | { type: "RESET" };

export interface PaymentEntry {
  state: PaymentState;
  error: string | null;
  version: number;
}

export const INITIAL_ENTRY: PaymentEntry = { state: "idle", error: null, version: 0 };

type Transitions = Partial<Record<PaymentEvent["type"], PaymentState>>;

const TRANSITIONS: Record<PaymentState, Transitions> = {
  idle: { PREPARE: "preparing" },
  preparing: { PREPARED: "confirming", CANCEL: "cancelled", FAILED: "failed" },
  confirming: { CONFIRM: "processing", CANCEL: "cancelled" },
  processing: { SUCCEEDED: "paid", FAILED: "failed" },
  paid: { RESET: "idle" },
  failed: { RETRY: "processing", PREPARE: "preparing", RESET: "idle" },
  cancelled: { PREPARE: "preparing", RESET: "idle" },
};

export function transition(entry: PaymentEntry, event: PaymentEvent): PaymentEntry {
  const next = TRANSITIONS[entry.state][event.type];
  if (!next) return entry;
  return {
    state: next,
    error: event.type === "FAILED" ? event.reason : null,
    version: entry.version + 1,
  };
}
