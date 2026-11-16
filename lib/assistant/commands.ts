import { CURRENT_PERIOD } from "./bill-history";
import { answerBillQuestion } from "./bills";
import { normalizeSpeech } from "./text";
import type { AssistantCommands, Bill, CartBill } from "./types";

// Mock voice/AI router for the cart flow. The AI backend can replace this and call
// the same `commands` methods.

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

const includesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));
const hasWord = (text: string, words: string[]) =>
  text.split(" ").some((t) => words.includes(t));

const money = (n: number) => `${n.toFixed(2)} RON`;
const total = (items: CartBill[]) => items.reduce((sum, b) => sum + b.amount, 0);

const toCartBill = (b: Bill): CartBill => ({
  id: b.id,
  providerName: b.provider,
  amount: b.amount,
  dueDate: b.dueDate,
});

const listCart = (items: CartBill[]) =>
  items.map((b) => `• ${b.providerName}: ${money(b.amount)}`).join("\n");

/** Answers one user message and may trigger cart/checkout through `c`. */
export function respondToCommand(input: string, c: AssistantCommands): string {
  const q = normalizeSpeech(input);
  if (!q) return "I didn't catch that. Could you repeat?";

  if (includesAny(q, CHECKOUT_PHRASES)) {
    if (c.paymentCart.length === 0) {
      return "Your cart is empty. Add a bill first, for example: add Enel.";
    }
    c.openCheckout();
    return `Opening checkout for ${c.paymentCart.length} bill(s), ${money(total(c.paymentCart))} in total.`;
  }

  if (includesAny(q, CLEAR_PHRASES)) {
    c.clearCart();
    return "Cart cleared.";
  }

  if (includesAny(q, REMOVE_WORDS)) {
    const inCart = c.paymentCart.find((b) => q.includes(normalizeSpeech(b.providerName)));
    if (!inCart) return "That bill is not in your cart.";
    c.removeBillFromCart(inCart.id);
    return `Removed ${inCart.providerName} from the cart.`;
  }

  if (includesAny(q, ADD_WORDS)) {
    const bill = c.bills.find((b) => q.includes(normalizeSpeech(b.provider)));
    if (!bill) return "Which bill? Try a company name like Enel or Digi.";
    if (bill.status === "paid") return `${bill.provider} is already paid.`;
    if (c.paymentCart.some((b) => b.id === bill.id)) {
      return `${bill.provider} is already in your cart.`;
    }
    const item = toCartBill(bill);
    c.addBillToCart(item);
    const cart = [...c.paymentCart, item];
    return `Added ${bill.provider} (${money(bill.amount)}). Cart: ${cart.length} bill(s), ${money(total(cart))}.`;
  }

  if (hasWord(q, ["cos", "cart"])) {
    if (c.paymentCart.length === 0) return "Your cart is empty.";
    return `Your cart:\n${listCart(c.paymentCart)}\nTotal: ${money(total(c.paymentCart))}`;
  }

  if (includesAny(q, MONTH_PHRASES)) {
    const month = c.bills.filter((b) => b.dueDate.startsWith(CURRENT_PERIOD));
    if (month.length === 0) return "No bills are due this month.";
    const lines = month.map(
      (b) => `• ${b.provider}: ${money(b.amount)} (${b.status === "paid" ? "paid" : "due"})`,
    );
    return `Bills this month:\n${lines.join("\n")}`;
  }

  return answerBillQuestion(input, c.bills);
}
