import type { Bill, ChatReply, VoiceAction } from '@/lib/types';
import { INTENT_DICTIONARY } from '@/lib/assistant/intents';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const MAX_MESSAGES = 20;
const MAX_CONTENT = 1000;
const MAX_BILLS = 100;

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  bills: Bill[];
}

const ACTION_NAMES: VoiceAction[] = [
  'NONE',
  'CLOSE',
  'PREPARE_PAYMENT',
  ...INTENT_DICTIONARY.map((entry) => entry.intent),
];

// Actions that must carry a bill id in `target`. Every other action gets target = null.
const BILL_TARGET_ACTIONS = new Set<VoiceAction>([
  'PREPARE_PAYMENT',
  'OPEN_INVOICE',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
]);

const ACTION_LINES = [
  '- NONE: în toate celelalte cazuri.',
  '- CLOSE: când utilizatorul spune la revedere sau mulțumește și încheie conversația.',
  '- PREPARE_PAYMENT: doar când utilizatorul cere clar să plătești o factură anume neplătită (de exemplu „plătește Enel”). target = id-ul facturii.',
  ...INTENT_DICTIONARY.map(
    (entry) =>
      `- ${entry.intent}: ${entry.description}${BILL_TARGET_ACTIONS.has(entry.intent) ? ' target = id-ul facturii.' : ' target = null.'}`,
  ),
].join('\n');

const SYSTEM_PROMPT = `Ești Pago Voice, asistentul aplicației Pago pentru plata facturilor. Ești prietenos și foarte concis.

Reguli:
- Răspunde întotdeauna în limba română, chiar dacă utilizatorul scrie în altă limbă.
- Folosește cel mult 2 propoziții scurte în text. Fără liste, emoji sau markdown.
- Cunoști doar facturile de mai jos. Nu inventa facturi, furnizori, sume sau date.
- Răspunde la întrebări folosind lista de facturi: totaluri, comparații (cea mai scumpă sau cea mai ieftină), scadențe, starea plătită sau neplătită și detalii precum notele.
- Sumele sunt în RON. Scrie sumele ca 142,50 RON și datele ca 15 decembrie.
- Dacă o factură este deja plătită, spune asta și nu oferi să o plătești din nou.
- Dacă întrebarea nu e clară sau mai multe facturi se potrivesc, pune o întrebare scurtă de clarificare și folosește action NONE.

Acțiuni (câmpul action, exact una din listă):
${ACTION_LINES}

Format de răspuns OBLIGATORIU: returnează DOAR un obiect JSON valid, fără markdown, fără ghilimele de cod și fără text în afara JSON-ului, cu exact aceste chei:
{ "text": "răspunsul vorbit, în română conversațională", "action": "ACTION_NAME", "target": "id-ul facturii sau null" }`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    action: { type: 'string', enum: ACTION_NAMES },
    target: { type: ['string', 'null'] },
  },
  required: ['text', 'action', 'target'],
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
  return `${SYSTEM_PROMPT}\n\nData de azi: ${today}\n\nFacturile utilizatorului:\n${describeBills(bills)}`;
}

/**
 * Parses the model output `{ text, action, target }` and maps it to the ChatReply
 * shape the client consumes (`reply`, `action`, `billId`).
 */
export function parseAssistantReply(raw: string, bills: Bill[]): ChatReply | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;

  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) return null;

  const requested = ACTION_NAMES.find((name) => name === data.action) ?? 'NONE';
  const target = typeof data.target === 'string' ? data.target : null;
  const bill = target ? bills.find((b) => b.id === target) : undefined;

  let action: VoiceAction = requested;
  if (BILL_TARGET_ACTIONS.has(action) && !bill) action = 'NONE';
  if (action === 'PREPARE_PAYMENT' && bill?.status === 'paid') action = 'NONE';

  const billId = BILL_TARGET_ACTIONS.has(action) && bill ? bill.id : null;
  return { reply: text, action, billId };
}
