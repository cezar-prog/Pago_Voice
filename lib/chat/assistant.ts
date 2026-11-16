import type { Bill, ChatReply, VoiceAction } from '@/lib/types';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const MAX_MESSAGES = 20;
const MAX_CONTENT = 1000;
const MAX_BILLS = 100;

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  bills: Bill[];
}

const SYSTEM_PROMPT = `You are Pago Voice, the assistant of the Pago app for paying bills. You are friendly and very concise.

Rules:
- Always answer in English.
- Use at most 2 short sentences. Do not use lists, emoji or markdown.
- You only know the bills listed below. Never invent bills, providers, amounts or dates.
- Answer the user's question using the bill list: totals, comparisons (most or least expensive), due dates, paid or unpaid status, and details such as notes.
- Amounts are in RON. Write amounts like 142.50 RON and dates like 15 December.
- If a bill is already paid, say so and do not offer to pay it.
- If the question is unclear or several bills match, ask a short clarifying question.

Actions:
- PREPARE_PAYMENT: only when the user clearly asks to pay or prepare a specific unpaid bill (for example "pay Enel"). Put the exact bill id from the list in billId and confirm briefly in reply that you are preparing the payment on the main card.
- CLOSE: when the user says goodbye or thanks you and ends the conversation. Reply with a short goodbye.
- NONE: in all other cases.
- billId must be null unless the action is PREPARE_PAYMENT.

Response format: return only a valid JSON object with the fields reply (text), action (NONE, PREPARE_PAYMENT or CLOSE) and billId (the bill id or null).`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    action: { type: 'string', enum: ['NONE', 'PREPARE_PAYMENT', 'CLOSE'] },
    billId: { type: ['string', 'null'] },
  },
  required: ['reply', 'action', 'billId'],
  additionalProperties: false,
} as const;

function isBill(value: unknown): value is Bill {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.provider === 'string' &&
    typeof b.amount === 'number' &&
    Number.isFinite(b.amount) &&
    typeof b.dueDate === 'string' &&
    (b.status === 'due' || b.status === 'paid') &&
    (b.note === undefined || typeof b.note === 'string')
  );
}

export function readChatRequest(body: unknown): ChatRequest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];
  const cleaned: ChatRequest['messages'] = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, MAX_CONTENT);
    if (!content) continue;
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${content}`.slice(0, MAX_CONTENT * 2);
    else cleaned.push({ role: m.role, content });
  }

  let messages = cleaned.slice(-MAX_MESSAGES);
  while (messages.length && messages[0].role !== 'user') messages = messages.slice(1);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;

  const bills = (Array.isArray(raw.bills) ? raw.bills : []).filter(isBill).slice(0, MAX_BILLS);
  return { messages, bills };
}

function describeBills(bills: Bill[]): string {
  if (!bills.length) return 'The user has no bills in the app.';
  return bills
    .map((b) => {
      const parts = [
        `id: ${b.id}`,
        `provider: ${b.provider}`,
        `amount: ${b.amount.toFixed(2)} RON`,
        `due date: ${b.dueDate}`,
        `status: ${b.status === 'paid' ? 'paid' : 'unpaid'}`,
      ];
      if (b.note) parts.push(`note: ${b.note}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
}

export function buildSystemPrompt(bills: Bill[], today: string): string {
  return `${SYSTEM_PROMPT}\n\nToday's date: ${today}\n\nThe user's bills:\n${describeBills(bills)}`;
}

export function parseAssistantReply(raw: string, bills: Bill[]): ChatReply | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;

  const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
  if (!reply) return null;

  let action: VoiceAction =
    data.action === 'PREPARE_PAYMENT' || data.action === 'CLOSE' ? data.action : 'NONE';
  let billId = typeof data.billId === 'string' ? data.billId : null;

  const bill = billId ? bills.find((b) => b.id === billId) : undefined;
  if (action === 'PREPARE_PAYMENT' && (!bill || bill.status === 'paid')) action = 'NONE';
  if (action !== 'PREPARE_PAYMENT') billId = null;

  return { reply, action, billId };
}
