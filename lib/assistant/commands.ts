import { CURRENT_PERIOD, MOCK_HISTORY, detectBillAnomalies, type ProviderHistory } from "./bill-history";
import { answerBillQuestion } from "./bills";
import { formatRon, plural } from "./format";
import { ALL_WORDS, detectIntent, type IntentName } from "./intents";
import { normalizeSpeech } from "./text";
import type { AssistantCommands, Bill, CartBill, ChatMessage } from "./types";

// Local Romanian router for the cart, checkout and invoice actions. The intents
// themselves are defined in intents.ts; this file only says what each intent does.
// The AI backend can replace this and call the same `commands` methods.

/** The question that ends every "what do I owe" answer. It opens the stateful follow-up. */
export const PAYMENT_FOLLOW_UP = "Vrei să plătim ceva acum? Dacă da, ce?";

const YES_WORDS = ["da", "sigur", "bine", "ok", "desigur"];
const NO_WORDS = ["nu", "nu acum", "mai tarziu", "later"];

const total = (items: { amount: number }[]) => items.reduce((sum, b) => sum + b.amount, 0);
const facturi = (n: number) => `${n} ${plural(n, "factură", "facturi")}`;

/** "A", "A și B", "A, B și C". */
const joinRo = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} și ${names[names.length - 1]}`;

const toCartBill = (b: Bill): CartBill => ({
  id: b.id,
  providerName: b.provider,
  amount: b.amount,
  dueDate: b.dueDate,
});

const listCart = (items: CartBill[]) =>
  items.map((b) => `• ${b.providerName}: ${formatRon(b.amount)}`).join("\n");

/**
 * Bills whose company is named in the text. Matches the full provider name, or its first
 * word on its own, so "Engie" finds "Engie Gaz" and "Electrica" finds "Electrica".
 */
const findBills = (q: string, bills: Bill[]): Bill[] => {
  const words = new Set(q.split(" "));
  return bills.filter((b) => {
    const name = normalizeSpeech(b.provider);
    return q.includes(name) || words.has(name.split(" ")[0]);
  });
};

const findBill = (q: string, bills: Bill[]) => findBills(q, bills)[0];

/** True when the last assistant message asked the payment follow-up question. */
function isAwaitingPaymentChoice(history: ChatMessage[]): boolean {
  const last = [...history].reverse().find((m) => m.role === "assistant");
  return last?.text.trim().endsWith(PAYMENT_FOLLOW_UP) ?? false;
}

/**
 * Adds the given bills to the cart. Paid bills and bills already in the cart are skipped
 * and reported. The cart UI (the cart pill) shows as soon as the cart has items.
 */
function addBills(matched: Bill[], c: AssistantCommands): string {
  const inCart = new Set(c.paymentCart.map((b) => b.id));
  const added: CartBill[] = [];
  const notes: string[] = [];

  for (const bill of matched) {
    if (bill.status === "paid") {
      notes.push(`${bill.provider} este deja plătită.`);
    } else if (inCart.has(bill.id)) {
      notes.push(`${bill.provider} este deja în coș.`);
    } else {
      const item = toCartBill(bill);
      c.addBillToCart(item);
      inCart.add(bill.id);
      added.push(item);
    }
  }

  if (added.length === 0) return notes.join(" ") || "Nu am ce adăuga în coș.";
  const cart = [...c.paymentCart, ...added];
  const names = joinRo(added.map((b) => b.providerName));
  const summary = `Am adăugat ${names}. Coș: ${facturi(cart.length)}, total ${formatRon(total(cart))}.`;
  return [summary, ...notes].join(" ");
}

type Handler = (q: string, c: AssistantCommands) => string;

/** One handler per intent name. Adding an intent means adding an entry in intents.ts and here. */
const HANDLERS: Record<IntentName, Handler> = {
  PAY_ALL: (_q, c) => {
    const unpaid = c.bills.filter((b) => b.status === "due");
    if (unpaid.length === 0) return "Nu ai nicio factură de plătit.";
    for (const bill of unpaid) c.addBillToCart(toCartBill(bill));
    // The cart only ever holds unpaid bills, so this total is the cart total.
    c.openCheckout();
    return `Am pregătit toate cele ${facturi(unpaid.length)}, în total ${formatRon(total(unpaid))}. Deschid plata.`;
  },

  CHECKOUT: (_q, c) => {
    if (c.paymentCart.length === 0) {
      return "Coșul este gol. Adaugă mai întâi o factură, de exemplu: adaugă Enel.";
    }
    c.openCheckout();
    return `Deschid plata pentru ${facturi(c.paymentCart.length)}, în total ${formatRon(total(c.paymentCart))}.`;
  },

  UNPAID_BILLS: (_q, c) => {
    const due = c.bills.filter((b) => b.status === "due");
    const body =
      due.length === 0
        ? "Nu ai nimic de plătit acum. Bravo!"
        : `Facturi de plătit:\n${due
            .map((b) => `• ${b.provider}: ${formatRon(b.amount)}`)
            .join("\n")}\nTotal: ${formatRon(total(due))}`;
    return `${body}\n\n${PAYMENT_FOLLOW_UP}`;
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
    const matched = findBills(q, c.bills);
    if (matched.length === 0) {
      return "Care factură? Spune un nume de companie, de exemplu Enel sau Digi.";
    }
    return addBills(matched, c);
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

/**
 * The answer for a message handled locally (cart, checkout, invoice, unpaid list, or the
 * reply to our payment follow-up). Returns null when the AI should answer.
 */
export function localReply(input: string, c: AssistantCommands, history: ChatMessage[] = []): string | null {
  const q = normalizeSpeech(input);
  if (!q) return null;

  const intent = detectIntent(q);
  if (intent?.local) return HANDLERS[intent.intent](q, c);

  // Stateful follow-up: we just asked "Vrei să plătim ceva acum?".
  if (isAwaitingPaymentChoice(history)) {
    if (ALL_WORDS.includes(q)) return HANDLERS.PAY_ALL(q, c);
    const matched = findBills(q, c.bills);
    if (matched.length > 0) return addBills(matched, c);
    if (YES_WORDS.includes(q)) return "Spune ce factură vrei să plătești, de exemplu Enel sau Digi.";
    if (NO_WORDS.includes(q)) return "Bine, nu plătim acum.";
  }
  return null;
}

/** True when the message asks for all invoices this month ("Ce facturi am luna asta?"). */
export function isShowAllMonth(input: string): boolean {
  return detectIntent(normalizeSpeech(input))?.intent === "VIEW_MONTH_BILLS";
}

/**
 * Warning for this month's bills whose amount is unusually high compared with their usual
 * amount. Null when none is flagged.
 */
export function suspiciousBillWarning(
  bills: Bill[],
  histories: ProviderHistory[] = MOCK_HISTORY,
): string | null {
  const monthProviders = new Set(
    bills.filter((b) => b.dueDate.startsWith(CURRENT_PERIOD)).map((b) => b.provider),
  );
  const flagged = detectBillAnomalies(histories).filter((a) => monthProviders.has(a.provider));
  if (flagged.length === 0) return null;
  return flagged
    .map(
      (a) =>
        `Atenție, factura la ${a.provider} este neobișnuit de mare luna aceasta (${formatRon(a.amount)}, de obicei ${formatRon(a.expected)}).`,
    )
    .join(" ");
}

/** Answers one user message. Local actions first, then the intent handlers, then the bill answers. */
export function respondToCommand(input: string, c: AssistantCommands, history: ChatMessage[] = []): string {
  const q = normalizeSpeech(input);
  if (!q) return "Nu am înțeles. Poți repeta?";

  const local = localReply(input, c, history);
  if (local !== null) return local;

  const intent = detectIntent(q);
  if (intent) return HANDLERS[intent.intent](q, c);
  return answerBillQuestion(input, c.bills);
}
