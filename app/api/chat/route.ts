import Anthropic from '@anthropic-ai/sdk';
import { answerBillQuestion, MOCK_BILLS } from '@/lib/assistant/bills';
import type { ChatReply } from '@/lib/types';
import {
  buildSystemPrompt,
  MODEL,
  parseAssistantReply,
  readChatRequest,
  RESPONSE_SCHEMA,
} from '@/lib/chat/assistant';

const FALLBACK_REPLY = 'Scuze, a aparut o problema. Mai incearca o data.';
const NOT_UNDERSTOOD = 'Scuze, nu am inteles. Poti repeta?';
const REFUSAL_REPLY = 'Scuze, nu te pot ajuta cu asta. Te pot ajuta cu facturile tale.';

function reply(body: ChatReply, status = 200) {
  return Response.json(body, { status });
}

function failure(text: string, status: number) {
  return reply({ reply: text, action: 'NONE', billId: null }, status);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('Cererea nu este valida.', 400);
  }

  const input = readChatRequest(body);
  if (!input) return failure('Nu am primit nicio intrebare.', 400);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const question = input.messages[input.messages.length - 1].content;
    return reply({ reply: answerBillQuestion(question, MOCK_BILLS), action: 'NONE', billId: null });
  }

  const today = new Date().toISOString().slice(0, 10);
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(input.bills, today),
      messages: input.messages,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
    });

    if (response.stop_reason === 'refusal') return failure(REFUSAL_REPLY, 200);

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    const parsed = parseAssistantReply(text, input.bills);
    return parsed ? reply(parsed) : failure(NOT_UNDERSTOOD, 200);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return failure('Sunt putin aglomerat acum. Incearca din nou in cateva secunde.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Pago Voice API error', error.status, error.message);
      return failure(FALLBACK_REPLY, 502);
    }
    console.error('Pago Voice error', error);
    return failure(FALLBACK_REPLY, 500);
  }
}
