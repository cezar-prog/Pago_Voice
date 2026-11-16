'use client';

import { useState } from 'react';
import { PagoVoice } from '@/components/voice/PagoVoice';
import { SAMPLE_BILLS } from '@/lib/bills';

export default function Home() {
  const [prepared, setPrepared] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Pago Voice</h1>
      <p className="text-sm opacity-70">
        Spune &quot;Hei Pago, cat am la Digi?&quot; sau apasa microfonul. Permite microfonul in Chrome.
      </p>

      <ul className="space-y-2">
        {SAMPLE_BILLS.map((bill) => (
          <li key={bill.id} className="flex justify-between rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/5">
            <span>{bill.provider}</span>
            <span>
              {bill.amount.toFixed(2)} lei - {bill.status === 'paid' ? 'platita' : bill.dueDate}
            </span>
          </li>
        ))}
      </ul>

      {prepared && <p className="text-sm">Plata pregatita pentru factura {prepared}.</p>}

      <PagoVoice bills={SAMPLE_BILLS} onPreparePayment={setPrepared} />
    </main>
  );
}
