import { CURRENT_PERIOD } from "./bill-history";
import { answerBillQuestion } from "./bills";
import { formatRon, plural } from "./format";
import { normalizeSpeech } from "./text";
import type { AssistantCommands, Bill, CartBill } from "./types";

// Mock Romanian voice/AI router for the cart flow. The AI backend can replace this
// and call the same `commands` methods.

const CHECKOUT_PHRASES = [
  "hai sa le platim",
  "plateste le",
  "plateste",
  "platim",
  "checkout",
  "pay now",
  "pay them",
  "pay all",
];
const CLEAR_PHRASES = ["goleste cosul", "goleste", "clear cart", "empty cart"];
const REMOVE_WORDS = ["scoate", "elimina", "remove"];
const ADD_WORDS = ["adauga", "pune in cos", "add to cart", "add"];
const MONTH_PHRASES = ["luna asta", "luna aceasta", "this month"];
const INVOICE_PHRASES = [
  "vreau sa vad factura",
  "vreau factura",
  "vezi factura",
  "arata factura",
  "arata-mi factura",
  "deschide factura",
  "vad factura",
];

const includesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));
const hasWord = (text: string, words: string[]) =>
  text.split(" ").some((t) => words.includes(t));

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

/** True when the message is about the cart or checkout (handled locally, not by the AI). */
export function isCartCommand(input: string): boolean {
  const q = normalizeSpeech(input);
  return (
    includesAny(q, CHECKOUT_PHRASES) ||
    includesAny(q, CLEAR_PHRASES) ||
    includesAny(q, REMOVE_WORDS) ||
    includesAny(q, ADD_WORDS) ||
    includesAny(q, INVOICE_PHRASES) ||
    hasWord(q, ["cos", "cart"])
  );
}

/** Answers one user message and may trigger cart/checkout through `c`. */
export function respondToCommand(input: string, c: AssistantCommands): string {
  const q = normalizeSpeech(input);
  if (!q) return "Nu am înțeles. Poți repeta?";

  if (includesAny(q, CHECKOUT_PHRASES)) {
    if (c.paymentCart.length === 0) {
      return "Coșul este gol. Adaugă mai întâi o factură, de exemplu: adaugă Enel.";
    }
    c.openCheckout();
    return `Deschid plata pentru ${facturi(c.paymentCart.length)}, în total ${formatRon(total(c.paymentCart))}.`;
  }

  if (includesAny(q, INVOICE_PHRASES)) {
    // "deschide factura la Enel", "vreau să văd factura Digi": match the company name.
    const bill = c.bills.find((b) => q.includes(normalizeSpeech(b.provider)));
    if (!bill) return "Care factură vrei să o deschid? Spune, de exemplu, factura Enel.";
    c.openInvoice(bill);
    return `Deschid factura pentru ${bill.provider}.`;
  }

  if (includesAny(q, CLEAR_PHRASES)) {
    c.clearCart();
    return "Coșul a fost golit.";
  }

  if (includesAny(q, REMOVE_WORDS)) {
    const inCart = c.paymentCart.find((b) => q.includes(normalizeSpeech(b.providerName)));
    if (!inCart) return "Factura aceasta nu este în coș.";
    c.removeBillFromCart(inCart.id);
    return `Am scos ${inCart.providerName} din coș.`;
  }

  if (includesAny(q, ADD_WORDS)) {
    const bill = c.bills.find((b) => q.includes(normalizeSpeech(b.provider)));
    if (!bill) return "Care factură? Spune un nume de companie, de exemplu Enel sau Digi.";
    if (bill.status === "paid") return `${bill.provider} este deja plătită.`;
    if (c.paymentCart.some((b) => b.id === bill.id)) {
      return `${bill.provider} este deja în coș.`;
    }
    const item = toCartBill(bill);
    c.addBillToCart(item);
    const cart = [...c.paymentCart, item];
    return `Am adăugat ${bill.provider} (${formatRon(bill.amount)}). Coș: ${facturi(cart.length)}, total ${formatRon(total(cart))}.`;
  }

  if (hasWord(q, ["cos", "cart"])) {
    if (c.paymentCart.length === 0) return "Coșul este gol.";
    return `Coșul tău:\n${listCart(c.paymentCart)}\nTotal: ${formatRon(total(c.paymentCart))}`;
  }

  if (includesAny(q, MONTH_PHRASES)) {
    const month = c.bills.filter((b) => b.dueDate.startsWith(CURRENT_PERIOD));
    if (month.length === 0) return "Nu ai facturi scadente luna aceasta.";
    const lines = month.map(
      (b) => `• ${b.provider}: ${formatRon(b.amount)} (${b.status === "paid" ? "plătită" : "de plătit"})`,
    );
    return `Facturile din luna aceasta:\n${lines.join("\n")}`;
  }

  return answerBillQuestion(input, c.bills);
}
