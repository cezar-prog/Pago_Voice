import type { Bill } from "./types";
import { normalizeSpeech } from "./text";
import { CATEGORY_LABEL_RO, formatDateRo, formatRon, plural } from "./format";
import {
  MOCK_HISTORY,
  detectBillAnomalies,
  type BillAnomaly,
  type ProviderHistory,
} from "./bill-history";

// Placeholder data for UI work. Replace with the real bills source later.
export const MOCK_BILLS: Bill[] = [
  { id: "b1", provider: "Enel", amount: 287.5, currency: "RON", dueDate: "2026-11-20", status: "due", category: "utilities" },
  { id: "b2", provider: "Digi", amount: 45, currency: "RON", dueDate: "2026-11-05", status: "paid", category: "telecom" },
  { id: "b3", provider: "Allianz RCA", amount: 1240, currency: "RON", dueDate: "2026-12-01", status: "due", category: "auto" },
  { id: "b4", provider: "Apa Nova", amount: 62.3, currency: "RON", dueDate: "2026-11-10", status: "paid", category: "utilities" },
  { id: "b5", provider: "BT Home Loan", amount: 2100, currency: "RON", dueDate: "2026-11-25", status: "due", category: "house" },
  { id: "b6", provider: "Rovinieta", amount: 150, currency: "RON", dueDate: "2027-01-15", status: "due", category: "auto" },
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
const MISTAKE_WORDS = ["greseala", "eroare", "gresit", "mistake", "wrong", "anomal", "prea mult", "too much", "supracost", "overcharg", "suspect", "verific", "check"];

const describe = (bill: Bill) =>
  `${bill.provider}: ${formatRon(bill.amount)}, scadentă ${formatDateRo(bill.dueDate)}, ${
    bill.status === "paid" ? "deja plătită" : "încă de plătit"
  }.`;

const listBills = (bills: Bill[]) => bills.map((b) => `• ${describe(b)}`).join("\n");

const warningFor = (a: BillAnomaly) =>
  `${a.provider}: ${formatRon(a.amount)} luna aceasta, de obicei în jur de ${formatRon(a.expected)} (+${a.deviationPct.toFixed(0)}%). Poate fi o eroare de estimare. Verifică indexul contorului cu compania.`;

const includesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

/**
 * Keyword-based Romanian answers over the bill list. Good enough for the UI demo;
 * the AI backend can replace this through the `respond` adapter.
 */
export function answerBillQuestion(
  question: string,
  bills: Bill[] = MOCK_BILLS,
  histories: ProviderHistory[] = MOCK_HISTORY,
): string {
  const q = normalizeSpeech(question);
  if (!q) return "Nu am înțeles. Poți repeta?";

  if (includesAny(q, MISTAKE_WORDS)) {
    const anomalies = detectBillAnomalies(histories);
    if (anomalies.length === 0) {
      return "Nu observ nimic neobișnuit. Facturile tale sunt în linie cu lunile trecute.";
    }
    return anomalies.map(warningFor).join("\n");
  }

  const byProvider = bills.find((b) => q.includes(normalizeSpeech(b.provider)));
  if (byProvider) {
    // Price mistake first, so the client sees it before the normal details.
    const anomaly = detectBillAnomalies(histories).find(
      (a) => a.provider === byProvider.provider,
    );
    if (anomaly) return `Atenție la preț. ${warningFor(anomaly)}\n\n${describe(byProvider)}`;
    return describe(byProvider);
  }

  const category = (Object.keys(CATEGORY_KEYWORDS) as Bill["category"][]).find((c) =>
    includesAny(q, CATEGORY_KEYWORDS[c]),
  );
  if (category) {
    const matches = bills.filter((b) => b.category === category);
    const label = CATEGORY_LABEL_RO[category].toLowerCase();
    if (matches.length === 0) return `Nu ai facturi de tip ${label}.`;
    return `Facturile tale de ${label}:\n${listBills(matches)}`;
  }

  const due = bills.filter((b) => b.status === "due");
  const paid = bills.filter((b) => b.status === "paid");

  if (includesAny(q, STATUS_DUE)) {
    if (due.length === 0) return "Nu ai nimic de plătit acum. Bravo!";
    return `Facturi încă de plătit:\n${listBills(due)}`;
  }
  if (includesAny(q, STATUS_PAID)) {
    if (paid.length === 0) return "Nu ai plătit încă nicio factură.";
    return `Facturi plătite:\n${listBills(paid)}`;
  }
  if (includesAny(q, TOTAL_WORDS)) {
    const total = due.reduce((sum, b) => sum + b.amount, 0);
    return `Ai ${due.length} ${plural(due.length, "factură", "facturi")} de plătit, în total ${formatRon(total)}.`;
  }
  if (includesAny(q, DATE_WORDS)) {
    const next = [...due].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return next ? `Următoarea scadență: ${describe(next)}` : "Nu ai scadențe viitoare.";
  }

  return "Te pot ajuta cu facturile: furnizor, sumă, scadență, stare sau categorie. Ce vrei să știi?";
}
