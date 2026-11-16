import type { Bill, ChatReply, VoiceAction } from '@/lib/types';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const MAX_MESSAGES = 20;
const MAX_CONTENT = 1000;
const MAX_BILLS = 100;

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  bills: Bill[];
}

const SYSTEM_PROMPT = `Ești Pago Voice, asistentul aplicației Pago pentru plata facturilor. Ești prietenos și foarte concis.

Reguli:
- Răspunde întotdeauna în limba română, chiar dacă utilizatorul scrie în altă limbă.
- Folosește cel mult 2 propoziții scurte. Fără liste, emoji sau markdown.
- Cunoști doar facturile de mai jos. Nu inventa facturi, furnizori, sume sau date.
- Răspunde la întrebări folosind lista de facturi: totaluri, comparații (cea mai scumpă sau cea mai ieftină), scadențe, starea plătită sau neplătită și detalii precum notele.
- Sumele sunt în RON. Scrie sumele ca 142,50 RON și datele ca 15 decembrie.
- Dacă o factură este deja plătită, spune asta și nu oferi să o plătești din nou.
- Dacă întrebarea nu e clară sau mai multe facturi se potrivesc, pune o întrebare scurtă de clarificare.

Acțiuni:
- PREPARE_PAYMENT: doar când utilizatorul cere clar să plătești sau să pregătești o factură anume neplătită (de exemplu „plătește Enel”). Pune id-ul exact al facturii din listă în billId și confirmă scurt în reply că pregătești plata pe cardul salvat.
- CLOSE: când utilizatorul spune la revedere sau mulțumește și încheie conversația. Răspunde cu un scurt la revedere.
- NONE: în toate celelalte cazuri.
- billId trebuie să fie null, decât dacă acțiunea este PREPARE_PAYMENT.

Format de răspuns: returnează doar un obiect JSON valid cu câmpurile reply (text), action (NONE, PREPARE_PAYMENT sau CLOSE) și billId (id-ul facturii sau null).`;

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
