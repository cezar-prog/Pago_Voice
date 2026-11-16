import { INITIAL_ENTRY, transition, type PaymentEntry, type PaymentEvent } from "./machine";
import { mockPrepare, mockProcess } from "./mock";

type Listener = () => void;

let entries: Record<string, PaymentEntry> = {};
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getPaymentsSnapshot(): Record<string, PaymentEntry> {
  return entries;
}

export function subscribePayments(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPaymentEntry(billId: string): PaymentEntry {
  return entries[billId] ?? INITIAL_ENTRY;
}

function dispatchIfCurrent(billId: string, version: number, event: PaymentEvent): void {
  if (getPaymentEntry(billId).version !== version) return;
  dispatchPayment(billId, event);
}

function runEffects(billId: string, entry: PaymentEntry): void {
  const { version } = entry;
  if (entry.state === "preparing") {
    mockPrepare(billId).then(
      () => dispatchIfCurrent(billId, version, { type: "PREPARED" }),
      () => dispatchIfCurrent(billId, version, { type: "FAILED", reason: "Could not prepare the payment." }),
    );
  }
  if (entry.state === "processing") {
    mockProcess(billId).then(
      () => dispatchIfCurrent(billId, version, { type: "SUCCEEDED" }),
      (error: unknown) =>
        dispatchIfCurrent(billId, version, {
          type: "FAILED",
          reason: error instanceof Error ? error.message : "Payment failed.",
        }),
    );
  }
}

export function dispatchPayment(billId: string, event: PaymentEvent): boolean {
  const current = getPaymentEntry(billId);
  const next = transition(current, event);
  if (next === current) return false;
  entries = { ...entries, [billId]: next };
  notify();
  runEffects(billId, next);
  return true;
}
