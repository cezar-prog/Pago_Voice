"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, CreditCard, ScanFace, ShoppingBag, X } from "lucide-react";
import { useAssistant } from "./assistant-provider";
import type { CartBill } from "@/lib/assistant/types";

const PAGO_BLUE = "#0066FF";
const CYAN = "#00E5FF";

/** Demo PIN for the simulated checkout. Replace with real verification. */
export const DEMO_PIN = "1234";
const SAVED_CARD = "Visa •••• 4821";

const money = (n: number) => `${n.toFixed(2)} RON`;
const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Floating bar above the launcher, shown while the cart has bills. */
export function CartPill() {
  const { paymentCart, openCheckout, checkoutOpen } = useAssistant();
  const count = paymentCart.length;
  const total = paymentCart.reduce((sum, b) => sum + b.amount, 0);

  return (
    <AnimatePresence>
      {count > 0 && !checkoutOpen && (
        <motion.div
          key="cart-pill"
          initial={{ opacity: 0, y: 16, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="pointer-events-none fixed inset-x-0 bottom-[104px] z-40 flex justify-center"
        >
          <button
            type="button"
            onClick={openCheckout}
            aria-label={`Open checkout: ${count} bills, ${money(total)}`}
            className="pointer-events-auto touch-manipulation flex items-center gap-3 rounded-full border border-white/15 py-2 pl-2 pr-4 text-white shadow-[0_12px_32px_rgba(0,102,255,0.45)] backdrop-blur-xl"
            style={{ background: `linear-gradient(135deg, ${PAGO_BLUE}, #1d4ed8)` }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <ShoppingBag className="h-4 w-4" />
            </span>
            <span className="text-left leading-tight">
              <span className="block text-[11px] text-white/75">
                {count} {count === 1 ? "bill" : "bills"} in cart
              </span>
              <span className="block text-sm font-semibold">{money(total)}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-white/80" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Method = "face" | "pin";
type Phase = "review" | "verifying" | "success";

/** Full-screen checkout: bills, total, card, then Face ID or PIN to confirm. */
export function CheckoutScreen() {
  const { paymentCart, closeCheckout, confirmPayment } = useAssistant();
  // Snapshot at open time: the cart is emptied on confirm, but the success view still needs it.
  const [snapshot] = useState<CartBill[]>(paymentCart);
  const [method, setMethod] = useState<Method>("face");
  const [phase, setPhase] = useState<Phase>("review");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const total = snapshot.reduce((sum, b) => sum + b.amount, 0);

  // Confirmed: mark bills paid and empty the cart, then show success and close.
  const finish = () => {
    confirmPayment();
    setPhase("success");
    later(2600, closeCheckout);
  };

  const startFace = () => {
    if (phase !== "review") return;
    setPhase("verifying");
    later(1800, finish);
  };

  const pressDigit = (d: string) => {
    if (phase !== "review" || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      if (next === DEMO_PIN) {
        setPhase("verifying");
        later(500, finish);
      } else {
        setPinError(true);
        later(600, () => {
          setPin("");
          setPinError(false);
        });
      }
    }
  };

  const pressBackspace = () => {
    if (phase === "review") setPin((p) => p.slice(0, -1));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-black/90 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <div className="flex min-h-full w-full max-w-md flex-col px-5 pb-8 pt-8">
        {phase === "success" ? (
          <SuccessView count={snapshot.length} total={total} />
        ) : (
          <>
            <header className="flex items-center justify-between">
              <span className="text-sm font-medium tracking-wide text-white/60">Checkout</span>
              <button
                type="button"
                onClick={closeCheckout}
                aria-label="Close checkout"
                className="rounded-full border border-white/10 bg-white/10 p-2 text-white/70 backdrop-blur-xl hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
              <ul className="flex flex-col divide-y divide-white/10">
                {snapshot.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-white">{b.providerName}</p>
                      <p className="text-xs text-white/45">Due {formatDate(b.dueDate)}</p>
                    </div>
                    <p className="text-sm font-semibold text-white">{money(b.amount)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
                <span className="text-xs uppercase tracking-widest text-white/45">Total</span>
                <span className="text-3xl font-semibold tracking-tight text-white">{money(total)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-xl">
              <CreditCard className="h-5 w-5 text-cyan-200" />
              <span className="text-sm text-white">{SAVED_CARD}</span>
            </div>

            <h2 className="mt-8 text-base font-semibold text-white">Confirmă plata</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/5 p-1">
              {(["face", "pin"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  disabled={phase !== "review"}
                  aria-pressed={method === m}
                  className={`rounded-full py-2 text-sm font-medium transition-colors ${
                    method === m ? "bg-white text-black" : "text-white/60"
                  }`}
                >
                  {m === "face" ? "Face ID" : "PIN"}
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-1 flex-col items-center">
              {method === "face" ? (
                <FaceConfirm verifying={phase === "verifying"} onStart={startFace} />
              ) : (
                <PinPad
                  pin={pin}
                  error={pinError}
                  verifying={phase === "verifying"}
                  onDigit={pressDigit}
                  onBackspace={pressBackspace}
                />
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function FaceConfirm({ verifying, onStart }: { verifying: boolean; onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <button
        type="button"
        onClick={onStart}
        disabled={verifying}
        aria-label="Confirm with Face ID"
        className="relative flex h-32 w-32 items-center justify-center rounded-[2.5rem] border border-white/10 bg-white/[0.04] disabled:cursor-default"
      >
        {/* Corner brackets of a Face ID frame. */}
        <svg viewBox="0 0 100 100" className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" fill="none" stroke={PAGO_BLUE} strokeWidth="3" strokeLinecap="round">
          <path d="M8 26V14a6 6 0 0 1 6-6h12M74 8h12a6 6 0 0 1 6 6v12M92 74v12a6 6 0 0 1-6 6H74M26 92H14a6 6 0 0 1-6-6V74" />
        </svg>

        {verifying ? (
          <>
            <motion.span
              aria-hidden
              className="absolute inset-x-6 h-0.5 rounded-full"
              style={{ background: CYAN, boxShadow: `0 0 12px ${CYAN}` }}
              animate={{ top: ["20%", "80%", "20%"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <ScanFace className="h-12 w-12 text-cyan-200" />
          </>
        ) : (
          <ScanFace className="h-12 w-12 text-white/70" />
        )}
      </button>
      <p className="text-center text-xs uppercase tracking-widest text-white/45">
        {verifying ? "Verifying" : "Tap to confirm with Face ID"}
      </p>
    </div>
  );
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

function PinPad({
  pin,
  error,
  verifying,
  onDigit,
  onBackspace,
}: {
  pin: string;
  error: boolean;
  verifying: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <motion.div
        className="flex gap-4"
        animate={error ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border transition-colors ${
              i < pin.length
                ? error
                  ? "border-rose-400 bg-rose-400"
                  : "border-cyan-200 bg-cyan-200"
                : "border-white/40"
            }`}
          />
        ))}
      </motion.div>

      <p className="h-4 text-xs text-white/45">
        {verifying ? "Verifying" : error ? "Wrong PIN" : "Enter your 4-digit PIN"}
      </p>

      <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
        {KEYPAD.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => (key === "⌫" ? onBackspace() : onDigit(key))}
              disabled={verifying}
              aria-label={key === "⌫" ? "Delete" : `Digit ${key}`}
              className="flex h-16 items-center justify-center rounded-full border border-white/10 bg-white/10 text-2xl font-medium text-white backdrop-blur-xl transition-colors active:bg-white/25 disabled:opacity-50"
            >
              {key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function SuccessView({ count, total }: { count: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center text-center"
    >
      <div className="relative flex h-36 w-36 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: PAGO_BLUE }}
          initial={{ scale: 0.7, opacity: 0.9 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeOut", repeat: 1 }}
        />
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <motion.circle
            cx="50"
            cy="50"
            r="44"
            fill={`${PAGO_BLUE}26`}
            stroke={PAGO_BLUE}
            strokeWidth="4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          <motion.path
            d="M32 52 L44 64 L68 38"
            fill="none"
            stroke={CYAN}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
          />
        </svg>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="mt-8 text-2xl font-semibold text-white"
      >
        Payment successful
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.05 }}
        className="mt-2 text-sm text-white/60"
      >
        {count} {count === 1 ? "bill" : "bills"} paid · {money(total)}
      </motion.p>
    </motion.div>
  );
}
