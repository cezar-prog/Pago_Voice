const CLOSE_PHRASE = "multumesc pago";

/** Lowercases, strips diacritics (ț → t, ă → a) and punctuation. */
export function normalizeSpeech(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the user says "Mulțumesc Pago" (any casing, accents or punctuation). */
export function isClosePhrase(text: string): boolean {
  return normalizeSpeech(text).includes(CLOSE_PHRASE);
}

// Greeting + "pago", with common recognizer mishearings of both words.
const WAKE_RE =
  /\b(?:hei|hai|hey|hay|ehi|hi|hello|hallo|hullo|salut|buna)\s+(?:pago|bago|pagu|pogo|pa go)\b/;

/**
 * If the text starts a wake phrase ("hello pago", "hi pago", "salut pago"...), returns
 * whatever the user said after it (may be ""). Returns null when there is no wake phrase.
 */
export function extractWakeRest(text: string): string | null {
  const normalized = normalizeSpeech(text);
  const match = WAKE_RE.exec(normalized);
  if (!match) return null;
  return normalized.slice(match.index + match[0].length).trim();
}
