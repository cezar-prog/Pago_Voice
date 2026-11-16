import type { BillCategory } from "./types";

/** One billed month. `period` is YYYY-MM, so periods sort correctly as strings. */
export interface MonthlyBill {
  period: string;
  amount: number;
}

/** Monthly bills for one company, oldest first. The last entry for the current period is "this month". */
export interface ProviderHistory {
  provider: string;
  category: BillCategory;
  currency: string;
  bills: MonthlyBill[];
}

export interface BillAnomaly {
  provider: string;
  category: BillCategory;
  currency: string;
  period: string;
  amount: number;
  /** Median of the previous months: what this bill "should" be. */
  expected: number;
  /** How far above the expected amount, in percent. */
  deviationPct: number;
}

export const CURRENT_PERIOD = "2026-11";

/** Placeholder history for UI and AI work. Replace with the real billing data later. */
export const MOCK_HISTORY: ProviderHistory[] = [
  {
    provider: "Enel",
    category: "utilities",
    currency: "RON",
    bills: [
      { period: "2025-12", amount: 212.4 },
      { period: "2026-01", amount: 236.1 },
      { period: "2026-02", amount: 221.8 },
      { period: "2026-03", amount: 198.3 },
      { period: "2026-04", amount: 176.5 },
      { period: "2026-05", amount: 164.2 },
      { period: "2026-06", amount: 158.9 },
      { period: "2026-07", amount: 171.0 },
      { period: "2026-08", amount: 169.4 },
      { period: "2026-09", amount: 182.7 },
      { period: "2026-10", amount: 195.6 },
      { period: "2026-11", amount: 287.5 },
    ],
  },
  {
    provider: "Apa Nova",
    category: "utilities",
    currency: "RON",
    bills: [
      { period: "2025-12", amount: 58.4 },
      { period: "2026-01", amount: 61.0 },
      { period: "2026-02", amount: 59.2 },
      { period: "2026-03", amount: 55.7 },
      { period: "2026-04", amount: 50.3 },
      { period: "2026-05", amount: 47.8 },
      { period: "2026-06", amount: 46.9 },
      { period: "2026-07", amount: 49.5 },
      { period: "2026-08", amount: 51.0 },
      { period: "2026-09", amount: 55.2 },
      { period: "2026-10", amount: 60.1 },
      { period: "2026-11", amount: 62.3 },
    ],
  },
  {
    provider: "Digi",
    category: "telecom",
    currency: "RON",
    bills: [
      { period: "2025-12", amount: 45 },
      { period: "2026-01", amount: 45 },
      { period: "2026-02", amount: 45 },
      { period: "2026-03", amount: 45 },
      { period: "2026-04", amount: 45 },
      { period: "2026-05", amount: 45 },
      { period: "2026-06", amount: 45 },
      { period: "2026-07", amount: 45 },
      { period: "2026-08", amount: 45 },
      { period: "2026-09", amount: 45 },
      { period: "2026-10", amount: 45 },
      { period: "2026-11", amount: 45 },
    ],
  },
  {
    provider: "BT Home Loan",
    category: "house",
    currency: "RON",
    bills: [
      { period: "2025-12", amount: 2010 },
      { period: "2026-01", amount: 2010 },
      { period: "2026-02", amount: 2010 },
      { period: "2026-03", amount: 2010 },
      { period: "2026-04", amount: 2040 },
      { period: "2026-05", amount: 2040 },
      { period: "2026-06", amount: 2040 },
      { period: "2026-07", amount: 2040 },
      { period: "2026-08", amount: 2070 },
      { period: "2026-09", amount: 2070 },
      { period: "2026-10", amount: 2070 },
      { period: "2026-11", amount: 2100 },
    ],
  },
];

// Anomaly rule: the current bill must be at least this many times the typical amount,
// and at least this many RON above it. Both guard against noise on small bills.
const MIN_RATIO = 1.25;
const MIN_DIFF_RON = 30;
const BASELINE_MONTHS = 6;
const MIN_BASELINE_MONTHS = 3;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Flags companies whose current-period bill is much higher than their recent history.
 * This is a plain statistical check; the AI can use it as a first pass and add its own reasoning.
 */
export function detectBillAnomalies(
  histories: ProviderHistory[] = MOCK_HISTORY,
  currentPeriod: string = CURRENT_PERIOD,
): BillAnomaly[] {
  const anomalies: BillAnomaly[] = [];

  for (const h of histories) {
    const current = h.bills.find((b) => b.period === currentPeriod);
    if (!current) continue;

    const prior = h.bills.filter((b) => b.period < currentPeriod).slice(-BASELINE_MONTHS);
    if (prior.length < MIN_BASELINE_MONTHS) continue;

    const expected = median(prior.map((b) => b.amount));
    const flagged =
      current.amount >= expected * MIN_RATIO && current.amount - expected >= MIN_DIFF_RON;

    if (flagged) {
      anomalies.push({
        provider: h.provider,
        category: h.category,
        currency: h.currency,
        period: current.period,
        amount: current.amount,
        expected,
        deviationPct: ((current.amount - expected) / expected) * 100,
      });
    }
  }

  return anomalies;
}

/**
 * Plain-text summary of the history and any anomalies, ready to paste into an AI prompt.
 * One line per company, oldest month first.
 */
export function historySummaryForAI(histories: ProviderHistory[] = MOCK_HISTORY): string {
  const lines = histories.map((h) => {
    const months = h.bills.map((b) => `${b.period}: ${b.amount.toFixed(2)}`).join(", ");
    return `${h.provider} (${h.category}, ${h.currency}): ${months}`;
  });

  const anomalies = detectBillAnomalies(histories);
  const flagged =
    anomalies.length === 0
      ? "No bill is unusually high compared with recent months."
      : anomalies
          .map(
            (a) =>
              `${a.provider} ${a.period}: ${a.amount.toFixed(2)} ${a.currency}, typical ${a.expected.toFixed(2)} ${a.currency} (+${a.deviationPct.toFixed(0)}%)`,
          )
          .join("; ");

  return [`Bill history (monthly):`, ...lines, `Flagged for review: ${flagged}`].join("\n");
}
