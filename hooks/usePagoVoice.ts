'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Bill, VoiceMessage, VoicePhase } from '@/lib/types';
import { createVoiceController, type VoiceController } from '@/lib/voice/controller';
import { getSpeechRecognitionConstructor } from '@/lib/voice/recognition';

interface UsePagoVoiceOptions {
  bills: Bill[];
  onPreparePayment: (billId: string) => void;
}

const subscribeNothing = () => () => {};

export function usePagoVoice({ bills, onPreparePayment }: UsePagoVoiceOptions) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const supported = useSyncExternalStore(
    subscribeNothing,
    () => getSpeechRecognitionConstructor() !== null,
    () => false,
  );

  const latest = useRef({ bills, onPreparePayment });
  const controllerRef = useRef<VoiceController | null>(null);

  useEffect(() => {
    latest.current = { bills, onPreparePayment };
  });

  useEffect(() => {
    const controller = createVoiceController({
      getBills: () => latest.current.bills,
      onOpenChange: setOpen,
      onPhase: setPhase,
      onTranscript: setTranscript,
      onMessages: setMessages,
      onError: setError,
      onPreparePayment: (billId) => latest.current.onPreparePayment(billId),
    });
    controllerRef.current = controller;
    controller.start();
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  const tapMic = useCallback(() => controllerRef.current?.tapMic(), []);
  const close = useCallback(() => controllerRef.current?.close(), []);

  return { open, phase, messages, transcript, error, supported, tapMic, close };
}
