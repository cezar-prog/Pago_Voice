const failOnce = new Set<string>(["b1"]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockPrepare(): Promise<void> {
  await wait(700);
}

export async function mockProcess(billId: string): Promise<void> {
  await wait(1500);
  if (failOnce.delete(billId)) {
    throw new Error("Plata a fost refuzata. Incearca din nou.");
  }
}
