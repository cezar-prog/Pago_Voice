export type BillStatus = 'due' | 'paid';

export interface Bill {
  id: string;
  provider: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  note?: string;
}

import type { IntentName } from '@/lib/assistant/intents';

export type VoiceAction = 'NONE' | 'CLOSE' | 'PREPARE_PAYMENT' | IntentName;

export const VOICE_ACTIONS: readonly VoiceAction[] = [
  'NONE',
  'CLOSE',
  'PREPARE_PAYMENT',
  'CHECKOUT',
  'OPEN_INVOICE',
  'CLEAR_CART',
  'REMOVE_FROM_CART',
  'ADD_TO_CART',
  'VIEW_CART',
  'VIEW_MONTH_BILLS',
];

export interface ChatReply {
  reply: string;
  action: VoiceAction;
  billId: string | null;
}

export type VoiceRole = 'user' | 'assistant';

export interface VoiceMessage {
  id: string;
  role: VoiceRole;
  content: string;
}

export type VoicePhase = 'idle' | 'wake' | 'listening' | 'thinking' | 'speaking';

export function isChatReply(value: unknown): value is ChatReply {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const actionOk = VOICE_ACTIONS.includes(v.action as VoiceAction);
  const billOk = v.billId === null || typeof v.billId === 'string';
  return typeof v.reply === 'string' && actionOk && billOk;
}
