import type { Bill } from "./types";
import { normalizeSpeech } from "./text";

// Placeholder data for UI work. Replace with the real bills source later.
export const MOCK_BILLS: Bill[] = [
  { id: "b1", provider: "Enel", amount: 287.5, currency: "RON", dueDate: "2026-11-20", status: "due", category: "utilities" },
  { id: "b2", provider: "Digi", amount: 45, currency: "RON", dueDate: "2026-11-05", status: "paid", category: "telecom" },
  { id: "b3", provider: "Allianz RCA", amount: 1240, currency: "RON", dueDate: "2026-12-01", status: "due", category: "auto" },
  { id: "b4", provider: "Apa Nova", amount: 62.3, currency: "RON", dueDate: "2026-11-10", status: "paid", category: "utilities" },
  { id: "b5", provider: "BT Home Loan", amount: 2100, currency: "RON", dueDate: "2026-11-25", status: "due", category: "house" },
  { id: "b6", provider: "Rovinieta", amount: 150, currency: "RON", dueDate: "2027-01-15", status: "due", category: "auto" },
  { id: "b7", provider: "Orange", amount: 79.99, currency: "RON", dueDate: "2026-11-18", status: "due", category: "telecom" },
  { id: "b8", provider: "Electrica", amount: 143.6, currency: "RON", dueDate: "2026-11-22", status: "due", category: "utilities" },
  { id: "b9", provider: "Engie Gaz", amount: 312.4, currency: "RON", dueDate: "2026-11-28", status: "due", category: "utilities" },
  { id: "b10", provider: "Asigurare locuinta", amount: 480, currency: "RON", dueDate: "2026-12-10", status: "due", category: "house" },
  { id: "b11", provider: "Abonament sala", amount: 120, currency: "RON", dueDate: "2026-11-01", status: "paid", category: "other" },
];

const CATEGORY_KEYWORDS: Record<Bill["category"], string[]> = {
  auto: ["auto", "masina", "car", "rca", "rovinieta"],
  house: ["casa", "house", "home", "chirie", "rate", "credit"],
  utilities: ["utilitati", "utilities", "curent", "apa", "gaz"],
  telecom: ["telecom", "internet", "telefon", "digi", "telefonie"],
  other: ["altele", "other"],
};

const STATUS_DUE = ["restant", "neplatit", "datorat", "due", "unpaid", "neachitat"];
const STATUS_PAID = ["platit", "paid", "achitat"];
const TOTAL_WORDS = ["total", "cat trebuie", "how much", "cat am", "suma"];
const DATE_WORDS = ["cand", "scadent", "scadenta", "when", "due date", "termen"];

const formatAmount = (bill: Bill) => `${bill.amount.toFixed(2)} ${bill.currency}`;

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const describe = (bill: Bill) =>
  `${bill.provider}: ${formatAmount(bill)}, due ${formatDate(bill.dueDate)}, ${
    bill.status === "paid" ? "already paid" : "still due"
  }.`;

const listBills = (bills: Bill[]) => bills.map((b) => `• ${describe(b)}`).join("\n");

const includesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

/**
 * Keyword-based answers over the bill list. Good enough for the UI demo;
 * the AI work can replace this via the `respond` adapter.
 */
export function answerBillQuestion(question: string, bills: Bill[] = MOCK_BILLS): string {
  const q = normalizeSpeech(question);
  if (!q) return "I didn't catch that. Could you repeat?";

  const byProvider = bills.find((b) => q.includes(normalizeSpeech(b.provider)));
  if (byProvider) return describe(byProvider);

  const category = (Object.keys(CATEGORY_KEYWORDS) as Bill["category"][]).find((c) =>
    includesAny(q, CATEGORY_KEYWORDS[c]),
  );
  if (category) {
    const matches = bills.filter((b) => b.category === category);
    if (matches.length === 0) return `You have no ${category} bills.`;
    return `Your ${category} bills:\n${listBills(matches)}`;
  }

  const due = bills.filter((b) => b.status === "due");
  const paid = bills.filter((b) => b.status === "paid");

  if (includesAny(q, STATUS_DUE)) {
    if (due.length === 0) return "Nothing is due right now. Well done!";
    return `Bills still due:\n${listBills(due)}`;
  }
  if (includesAny(q, STATUS_PAID)) {
    if (paid.length === 0) return "No bills have been paid yet.";
    return `Paid bills:\n${listBills(paid)}`;
  }
  if (includesAny(q, TOTAL_WORDS)) {
    const total = due.reduce((sum, b) => sum + b.amount, 0);
    return `You have ${due.length} bills due, totalling ${total.toFixed(2)} RON.`;
  }
  if (includesAny(q, DATE_WORDS)) {
    const next = [...due].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return next ? `Next due: ${describe(next)}` : "No upcoming due dates.";
  }

  return "I can tell you about your bills: provider, amount, due date, status, or category. What would you like to know?";
}
