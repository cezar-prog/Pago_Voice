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
