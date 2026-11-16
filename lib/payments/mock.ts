import { scenarioFor } from "./scenarios";

const failuresLeft = new Map<string, number>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockPrepare(billId: string): Promise<void> {
  await wait(scenarioFor(billId).prepareMs);
}

export async function mockProcess(billId: string): Promise<void> {
  const scenario = scenarioFor(billId);
  await wait(scenario.processMs);
  const left = failuresLeft.get(billId) ?? scenario.failures;
  if (left > 0) {
    failuresLeft.set(billId, left - 1);
    throw new Error(scenario.failMessage);
  }
  failuresLeft.set(billId, 0);
}
