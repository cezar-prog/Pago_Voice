import type { AssistantAction, AssistantReply, AssistantTriage, Bill } from '@/lib/types';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const MAX_MESSAGES = 20;
const MAX_CONTENT = 1000;
const MAX_BILLS = 100;

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  bills: Bill[];
}

const TRIAGE_VALUES: AssistantTriage[] = ['TRANSACTIONAL', 'INFORMATIONAL', 'UNKNOWN'];
const ACTION_VALUES: AssistantAction[] = ['PAY_ALL', 'ADD_SPECIFIC', 'SHOW_ALL', 'SHOW_SPECIFIC', 'NONE'];

/** The fixed reply for unrelated questions. */
export const UNKNOWN_REPLY =
  'Sunt asistentul tău pentru plăți Pago. Te pot ajuta cu facturile, taxele auto sau reîncărcări. Cum te pot asista cu acestea?';

const SYSTEM_PROMPT = `You are Pago Voice, an elite, ultra-precise financial AI assistant.
The user talks to you in Romanian. Your responseText is always in natural, spoken Romanian, short (at most 2 sentences), with no lists, emoji or markdown.

Rule 1: Always analyze the user's intent in the "thinking" field first. In "thinking", list the entities you found (company names, categories, or "TOT"), then decide the triage and the action. "thinking" comes before every other field.
Rule 2: If the user asks "Cât costă rovinieta", the action is SHOW_SPECIFIC and targetEntities is ["rovinieta"]. Answer the price in responseText from the bill list.
Rule 3: If the user asks an informational question (for example "Am nevoie de rovinietă în Budapesta?"), triage is INFORMATIONAL, action is NONE, targetEntities is [], and responseText is a helpful answer. Use general knowledge about the trip, and mention a matching bill from the list when it is relevant (for example "Rovinieta ta în Pago este de 150 RON, scadentă la 15 ianuarie 2027"). If you are not sure of a travel rule, say so and recommend the official source.
Rule 4: If the user says "Plătește tot", action is PAY_ALL, triage is TRANSACTIONAL, and targetEntities is ["TOT"].
Rule 5: NEVER guess. If the message is unrelated to Pago, its bills or payments, triage is UNKNOWN, action is NONE, targetEntities is [], and responseText is exactly: "${UNKNOWN_REPLY}"

Other actions:
- ADD_SPECIFIC: TRANSACTIONAL, the user wants to add one or more named bills to the cart ("adaugă Digi și Electrica", "plătesc Digi, Engie și Orange"). targetEntities lists the company names, one per company. Only unpaid bills are added; say in responseText when a bill is already paid.
- SHOW_ALL: TRANSACTIONAL, the user wants the list of all bills this month ("ce facturi am luna asta?"). targetEntities is [].
- SHOW_SPECIFIC: TRANSACTIONAL, the user wants to see one bill ("arată factura Enel"). targetEntities lists that bill.
- The answer for "ce facturi am de plată?" (unpaid bills) is a TRANSACTIONAL SHOW_ALL, and responseText lists only the unpaid bills and ends with exactly: "Vrei să plătim ceva acum? Dacă da, ce?"

Only TRANSACTIONAL messages with an action other than NONE change the app. Never add a paid bill. Never invent bills, companies, amounts or dates.

Return ONLY one JSON object, with no markdown, no code fences and no text outside it, with exactly these keys, in this order:
{"thinking": "...", "triage": "TRANSACTIONAL | INFORMATIONAL | UNKNOWN", "action": "PAY_ALL | ADD_SPECIFIC | SHOW_ALL | SHOW_SPECIFIC | NONE", "targetEntities": ["..."], "responseText": "..."}`;

/**
 * Strict JSON Schema for the AI reply. Every key is required, nothing extra is allowed,
 * and the enums are closed. Providers enforce it; parseStructuredReply checks it again.
 */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    thinking: { type: 'string' },
    triage: { type: 'string', enum: TRIAGE_VALUES },
    action: { type: 'string', enum: ACTION_VALUES },
    targetEntities: { type: 'array', items: { type: 'string' } },
    responseText: { type: 'string' },
  },
  required: ['thinking', 'triage', 'action', 'targetEntities', 'responseText'],
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
  if (!bills.length) return 'Utilizatorul nu are facturi în aplicație.';
  return bills
    .map((b) => {
      const parts = [
        `id: ${b.id}`,
        `furnizor: ${b.provider}`,
        `sumă: ${b.amount.toFixed(2)} RON`,
        `scadență: ${b.dueDate}`,
        `stare: ${b.status === 'paid' ? 'plătită' : 'neplătită'}`,
      ];
      if (b.note) parts.push(`notă: ${b.note}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
}

export function buildSystemPrompt(bills: Bill[], today: string): string {
  return `${SYSTEM_PROMPT}\n\nToday: ${today}\n\nThe user's bills:\n${describeBills(bills)}`;
}

/**
 * Strict check of the model output. Returns the reply only when every key is present with
 * the right type and an allowed value; anything else returns null (the caller answers with
 * the offline fallback). Invalid triage or action values are never guessed.
 */
export function parseStructuredReply(raw: string): AssistantReply | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;

  const allowed = ['thinking', 'triage', 'action', 'targetEntities', 'responseText'];
  if (Object.keys(data).some((k) => !allowed.includes(k))) return null;
  if (typeof data.thinking !== 'string') return null;
  if (!TRIAGE_VALUES.includes(data.triage as AssistantTriage)) return null;
  if (!ACTION_VALUES.includes(data.action as AssistantAction)) return null;
  if (!Array.isArray(data.targetEntities) || !data.targetEntities.every((e) => typeof e === 'string')) {
    return null;
  }
  if (typeof data.responseText !== 'string' || !data.responseText.trim()) return null;

  return {
    thinking: data.thinking,
    triage: data.triage as AssistantTriage,
    action: data.action as AssistantAction,
    targetEntities: data.targetEntities as string[],
    responseText: data.responseText.trim(),
  };
}
