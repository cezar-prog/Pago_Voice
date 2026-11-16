"use client";

import { useSyncExternalStore } from "react";
import { MOCK_BILLS } from "@/lib/assistant/bills";
import type { Bill } from "@/lib/assistant/types";
import { dispatchPayment, getPaymentEntry, getPaymentsSnapshot, subscribePayments } from "@/lib/payments/store";
import type { PaymentEntry } from "@/lib/payments/machine";

const formatAmount = (bill: Bill) => `${bill.amount.toFixed(2)} ${bill.currency}`;

const BUTTON = "rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50";
const PRIMARY = `${BUTTON} bg-blue-600 text-white`;
const SECONDARY = `${BUTTON} bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100`;

function StatusAction({ bill, entry }: { bill: Bill; entry: PaymentEntry }) {
  if (bill.status === "paid" || entry.state === "paid") {
    return <span className="text-sm font-semibold text-emerald-600">Platita</span>;
  }

  switch (entry.state) {
    case "idle":
      return (
        <button type="button" className={PRIMARY} onClick={() => dispatchPayment(bill.id, { type: "PREPARE" })}>
          Plateste
        </button>
      );
    case "preparing":
      return <span className="text-sm opacity-70">Se pregateste...</span>;
    case "confirming":
      return (
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} onClick={() => dispatchPayment(bill.id, { type: "CONFIRM" })}>
            Confirma
          </button>
          <button type="button" className={SECONDARY} onClick={() => dispatchPayment(bill.id, { type: "CANCEL" })}>
            Anuleaza
          </button>
        </div>
      );
    case "processing":
      return <span className="text-sm opacity-70">Se proceseaza...</span>;
    case "failed":
      return (
        <div className="flex flex-col items-end gap-2">
          <span role="alert" className="text-right text-xs text-rose-600">
            {entry.error}
          </span>
          <button type="button" className={PRIMARY} onClick={() => dispatchPayment(bill.id, { type: "RETRY" })}>
            Reincearca
          </button>
        </div>
      );
    case "cancelled":
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">Anulata</span>
          <button type="button" className={SECONDARY} onClick={() => dispatchPayment(bill.id, { type: "PREPARE" })}>
            Reia
          </button>
        </div>
      );
  }
}

export function PaymentsPanel() {
  const snapshot = useSyncExternalStore(subscribePayments, getPaymentsSnapshot, getPaymentsSnapshot);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Facturi</h2>
      <ul className="space-y-3">
        {MOCK_BILLS.map((bill) => {
          const entry = snapshot[bill.id] ?? getPaymentEntry(bill.id);
          return (
            <li
              key={bill.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <p className="font-semibold">{bill.provider}</p>
                <p className="text-sm opacity-70">{formatAmount(bill)}</p>
              </div>
              <StatusAction bill={bill} entry={entry} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
