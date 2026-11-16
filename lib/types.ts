export type BillStatus = 'due' | 'paid';

export interface Bill {
  id: string;
  provider: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  note?: string;
}

export type VoiceAction = 'NONE' | 'PREPARE_PAYMENT' | 'CLOSE';

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
  const actionOk = v.action === 'NONE' || v.action === 'PREPARE_PAYMENT' || v.action === 'CLOSE';
  const billOk = v.billId === null || typeof v.billId === 'string';
  return typeof v.reply === 'string' && actionOk && billOk;
}
