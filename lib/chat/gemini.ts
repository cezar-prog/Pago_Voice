import { GoogleGenAI } from '@google/genai';
import type { ChatRequest } from './assistant';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export async function askGemini(
  apiKey: string,
  system: string,
  input: ChatRequest['messages'],
  schema: object,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: input.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  });
  return response.text ?? '';
}
