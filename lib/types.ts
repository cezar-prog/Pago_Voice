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

/** Legacy reply shape used by the (unmounted) voice controller. */
export interface ChatReply {
  reply: string;
  action: VoiceAction;
  /** First bill id of `targets`, kept for the voice controller. */
  billId: string | null;
  /** Every bill id the action applies to (several for a multi-company request). */
  targets?: string[];
  triage?: AssistantTriage;
}

/** How the AI classified the message. Only TRANSACTIONAL with an action may change the app. */
export type AssistantTriage = 'TRANSACTIONAL' | 'INFORMATIONAL' | 'UNKNOWN';

export type AssistantAction = 'PAY_ALL' | 'ADD_SPECIFIC' | 'SHOW_ALL' | 'SHOW_SPECIFIC' | 'NONE';

/**
 * The strict JSON the AI returns for every message. The app shows and speaks `responseText`
 * always, and acts only when triage is TRANSACTIONAL and action is not NONE.
 */
export interface AssistantReply {
  /** The model's reasoning. Logged or kept, never shown or spoken. */
  thinking: string;
  triage: AssistantTriage;
  action: AssistantAction;
  /** Company names, categories, or 'TOT' (everything). */
  targetEntities: string[];
  responseText: string;
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
