'use client';

import { Mic } from 'lucide-react';
import { usePagoVoice } from '@/hooks/usePagoVoice';
import type { Bill } from '@/lib/types';
import { VoiceOverlay } from './VoiceOverlay';

interface PagoVoiceProps {
  bills: Bill[];
  onPreparePayment: (billId: string) => void;
}

export function PagoVoice({ bills, onPreparePayment }: PagoVoiceProps) {
  const voice = usePagoVoice({ bills, onPreparePayment });

  return (
    <>
      {!voice.open && (
        <button
          type="button"
          onClick={voice.tapMic}
          disabled={!voice.supported}
          aria-label="Deschide Pago Voice"
          className="fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white shadow-lg shadow-violet-900/40 transition enabled:active:scale-95 disabled:opacity-50"
        >
          <Mic className="h-6 w-6" />
        </button>
      )}
      <VoiceOverlay
        open={voice.open}
        phase={voice.phase}
        messages={voice.messages}
        transcript={voice.transcript}
        error={voice.error}
        supported={voice.supported}
        onClose={voice.close}
        onMic={voice.tapMic}
      />
    </>
  );
}
