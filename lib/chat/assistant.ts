import type { Bill, ChatReply, VoiceAction } from '@/lib/types';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const MAX_MESSAGES = 20;
const MAX_CONTENT = 1000;
const MAX_BILLS = 100;

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  bills: Bill[];
}

const SYSTEM_PROMPT = `Esti Pago Voice, asistentul vocal al aplicatiei Pago pentru plata facturilor. Esti prietenos, cald si foarte concis.

Reguli:
- Raspunde intotdeauna in limba romana, strict fara diacritice (scrie a, i, s, t in loc de litere cu diacritice).
- Maximum 2 propozitii scurte per raspuns. Raspunsul este citit cu voce tare, asa ca nu folosi liste, emoji, markdown sau simboluri speciale.
- Cunosti doar facturile din lista primita mai jos. Nu inventa facturi, furnizori, sume sau date.
- Cand utilizatorul intreaba de o factura, spune-i suma, data scadentei si nota, daca exista (de exemplu o regularizare la gaz), apoi intreaba-l daca vrea sa o pregatesti pentru plata cu cardul principal.
- Spune sumele natural, de exemplu 142,50 lei, iar datele ca 15 decembrie.
- Daca o factura este deja platita, spune asta si nu propune plata ei.
- Daca intrebarea nu este clara sau se potrivesc mai multe facturi, cere o clarificare scurta.

Actiuni:
- PREPARE_PAYMENT: doar cand utilizatorul confirma clar ca vrea sa plateasca sau sa pregateasca o anumita factura neplatita (de exemplu: da, da te rog, plateste-o, pregateste-o). Pune in billId id-ul exact al facturii din lista si confirma scurt in reply ca o pregatesti pe cardul principal.
- CLOSE: cand utilizatorul isi ia la revedere sau multumeste si incheie conversatia. Raspunde cu un salut scurt.
- NONE: in toate celelalte cazuri.
- billId este null cand actiunea nu este PREPARE_PAYMENT.

Formatul raspunsului: returneaza strict un obiect JSON valid, cu campurile reply (text), action (NONE, PREPARE_PAYMENT sau CLOSE) si billId (id-ul facturii sau null).`;

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

function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

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
  if (!bills.length) return 'Utilizatorul nu are nicio factura in aplicatie.';
  return bills
    .map((b) => {
      const parts = [
        `id: ${b.id}`,
        `furnizor: ${b.provider}`,
        `suma: ${b.amount.toFixed(2)} lei`,
        `scadenta: ${b.dueDate}`,
        `status: ${b.status === 'paid' ? 'platita' : 'neplatita'}`,
      ];
      if (b.note) parts.push(`nota: ${b.note}`);
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

  const reply = stripDiacritics(typeof data.reply === 'string' ? data.reply.trim() : '');
  if (!reply) return null;

  let action: VoiceAction =
    data.action === 'PREPARE_PAYMENT' || data.action === 'CLOSE' ? data.action : 'NONE';
  let billId = typeof data.billId === 'string' ? data.billId : null;

  const bill = billId ? bills.find((b) => b.id === billId) : undefined;
  if (action === 'PREPARE_PAYMENT' && (!bill || bill.status === 'paid')) action = 'NONE';
  if (action !== 'PREPARE_PAYMENT') billId = null;

  return { reply, action, billId };
}
