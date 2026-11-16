import { CURRENT_PERIOD } from "./bill-history";
import { answerBillQuestion } from "./bills";
import { formatRon, plural } from "./format";
import { detectIntent, type IntentName } from "./intents";
import { normalizeSpeech } from "./text";
import type { AssistantCommands, Bill, CartBill } from "./types";

// Local Romanian router for the cart, checkout and invoice actions. The intents
// themselves are defined in intents.ts; this file only says what each intent does.
// The AI backend can replace this and call the same `commands` methods.

const total = (items: CartBill[]) => items.reduce((sum, b) => sum + b.amount, 0);
const facturi = (n: number) => `${n} ${plural(n, "factură", "facturi")}`;

const toCartBill = (b: Bill): CartBill => ({
  id: b.id,
  providerName: b.provider,
  amount: b.amount,
  dueDate: b.dueDate,
});

const listCart = (items: CartBill[]) =>
  items.map((b) => `• ${b.providerName}: ${formatRon(b.amount)}`).join("\n");

/** Finds the bill whose company name appears in the normalized text. */
const findBill = (q: string, bills: Bill[]) =>
  bills.find((b) => q.includes(normalizeSpeech(b.provider)));

type Handler = (q: string, c: AssistantCommands) => string;

/** One handler per intent name. Adding an intent means adding an entry in intents.ts and here. */
const HANDLERS: Record<IntentName, Handler> = {
  CHECKOUT: (_q, c) => {
    if (c.paymentCart.length === 0) {
      return "Coșul este gol. Adaugă mai întâi o factură, de exemplu: adaugă Enel.";
    }
    c.openCheckout();
    return `Deschid plata pentru ${facturi(c.paymentCart.length)}, în total ${formatRon(total(c.paymentCart))}.`;
  },

  OPEN_INVOICE: (q, c) => {
    const bill = findBill(q, c.bills);
    if (!bill) return "Care factură vrei să o deschid? Spune, de exemplu, factura Enel.";
    c.openInvoice(bill);
    return `Deschid factura pentru ${bill.provider}.`;
  },

  CLEAR_CART: (_q, c) => {
    c.clearCart();
    return "Coșul a fost golit.";
  },

  REMOVE_FROM_CART: (q, c) => {
    const inCart = c.paymentCart.find((b) => q.includes(normalizeSpeech(b.providerName)));
    if (!inCart) return "Factura aceasta nu este în coș.";
    c.removeBillFromCart(inCart.id);
    return `Am scos ${inCart.providerName} din coș.`;
  },

  ADD_TO_CART: (q, c) => {
    const bill = findBill(q, c.bills);
    if (!bill) return "Care factură? Spune un nume de companie, de exemplu Enel sau Digi.";
    if (bill.status === "paid") return `${bill.provider} este deja plătită.`;
    if (c.paymentCart.some((b) => b.id === bill.id)) {
      return `${bill.provider} este deja în coș.`;
    }
    const item = toCartBill(bill);
    c.addBillToCart(item);
    const cart = [...c.paymentCart, item];
    return `Am adăugat ${bill.provider} (${formatRon(bill.amount)}). Coș: ${facturi(cart.length)}, total ${formatRon(total(cart))}.`;
  },

  VIEW_CART: (_q, c) => {
    if (c.paymentCart.length === 0) return "Coșul este gol.";
    return `Coșul tău:\n${listCart(c.paymentCart)}\nTotal: ${formatRon(total(c.paymentCart))}`;
  },

  VIEW_MONTH_BILLS: (_q, c) => {
    const month = c.bills.filter((b) => b.dueDate.startsWith(CURRENT_PERIOD));
    if (month.length === 0) return "Nu ai facturi scadente luna aceasta.";
    const lines = month.map(
      (b) => `• ${b.provider}: ${formatRon(b.amount)} (${b.status === "paid" ? "plătită" : "de plătit"})`,
    );
    return `Facturile din luna aceasta:\n${lines.join("\n")}`;
  },
};

/** True when the message is a local cart, checkout or invoice action (not sent to the AI). */
export function isCartCommand(input: string): boolean {
  return detectIntent(normalizeSpeech(input))?.local === true;
}

/** Answers one user message. Matches an intent from the dictionary, otherwise answers from the bills. */
export function respondToCommand(input: string, c: AssistantCommands): string {
  const q = normalizeSpeech(input);
  if (!q) return "Nu am înțeles. Poți repeta?";

  const intent = detectIntent(q);
  if (!intent) return answerBillQuestion(input, c.bills);
  return HANDLERS[intent.intent](q, c);
}
