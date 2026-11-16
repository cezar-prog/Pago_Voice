export interface PaymentScenario {
  prepareMs: number;
  processMs: number;
  failures: number;
  failMessage: string;
}

const DEFAULT_SCENARIO: PaymentScenario = {
  prepareMs: 700,
  processMs: 1500,
  failures: 0,
  failMessage: "The payment was declined. Please try again.",
};

/**
 * Mock behaviour per bill id. `failures` is how many processing attempts fail
 * before one succeeds; Infinity means the payment always fails.
 */
export const PAYMENT_SCENARIOS: Record<string, Partial<PaymentScenario>> = {
  b1: { failures: 1 },
  b3: { prepareMs: 2500, processMs: 3000 },
  b5: { failures: 2 },
  b7: { processMs: 800 },
  b9: { failures: Infinity, failMessage: "The card was declined. Change the payment method." },
};

export function scenarioFor(billId: string): PaymentScenario {
  return { ...DEFAULT_SCENARIO, ...PAYMENT_SCENARIOS[billId] };
}
