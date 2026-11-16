import Anthropic from '@anthropic-ai/sdk';
import type { ChatReply } from '@/lib/types';
import {
  buildSystemPrompt,
  MODEL,
  parseAssistantReply,
  readChatRequest,
  RESPONSE_SCHEMA,
  type ChatRequest,
} from '@/lib/chat/assistant';
import { askGemini } from '@/lib/chat/gemini';

const FALLBACK_REPLY = 'Sorry, something went wrong. Please try again.';
const NOT_UNDERSTOOD = 'Sorry, I did not understand. Could you repeat?';
const REFUSAL_REPLY = 'Sorry, I cannot help with that. I can help with your bills.';
const KEY_REJECTED_REPLY =
  'The AI rejected the API key. Check the key and its line in .env.local, then restart the server.';
const NOT_CONNECTED_REPLY =
  'The AI is not connected. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env.local and restart the server.';

type Provider = 'gemini' | 'anthropic' | 'none';

function reply(body: ChatReply, status = 200) {
  return Response.json(body, { status });
}

function failure(text: string, status: number) {
  return reply({ reply: text, action: 'NONE', billId: null }, status);
}

function pickProvider(): Provider {
  const forced = process.env.LLM_PROVIDER;
  if (forced === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (forced === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

async function askClaude(apiKey: string, system: string, input: ChatRequest['messages']) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: input,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
    },
  });
  if (response.stop_reason === 'refusal') return null;
  return response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('The request is not valid.', 400);
  }

  const input = readChatRequest(body);
  if (!input) return failure('No question received.', 400);

  const provider = pickProvider();
  if (provider === 'none') return failure(NOT_CONNECTED_REPLY, 503);

  const today = new Date().toISOString().slice(0, 10);
  const system = buildSystemPrompt(input.bills, today);

  try {
    const text =
      provider === 'gemini'
        ? await askGemini(process.env.GEMINI_API_KEY ?? '', system, input.messages, RESPONSE_SCHEMA)
        : await askClaude(process.env.ANTHROPIC_API_KEY ?? '', system, input.messages);

    if (text === null) return failure(REFUSAL_REPLY, 200);

    const parsed = parseAssistantReply(text, input.bills);
    return parsed ? reply(parsed) : failure(NOT_UNDERSTOOD, 200);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return failure('The service is busy. Please try again in a few seconds.', 429);
    }
    const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 0;
    console.error(`Pago Voice ${provider} error`, status, error instanceof Error ? error.message : error);
    if (status === 401 || status === 403) return failure(KEY_REJECTED_REPLY, 502);
    return failure(FALLBACK_REPLY, 502);
  }
}
