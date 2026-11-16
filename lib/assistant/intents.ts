// Intent recognition for the local (mock) assistant.
//
// Each entry is one intent. Keywords are matched against the message after normalizeSpeech():
// lowercase, no diacritics, no punctuation. A keyword is either a plain string (substring match)
// or a RegExp. Entries are checked in order and the first match wins, so put more specific
// intents first.
//
// `local: true` means the message is handled here and never sent to the AI endpoint
// (cart, checkout and invoice actions must always change the app state).

export type IntentName =
  | "CHECKOUT"
  | "OPEN_INVOICE"
  | "CLEAR_CART"
  | "REMOVE_FROM_CART"
  | "ADD_TO_CART"
  | "VIEW_CART"
  | "VIEW_MONTH_BILLS";

export type Keyword = string | RegExp;

export interface IntentDefinition {
  intent: IntentName;
  description: string;
  keywords: Keyword[];
  local: boolean;
}

export const INTENT_DICTIONARY: IntentDefinition[] = [
  {
    intent: "CHECKOUT",
    description: "Deschide plata pentru facturile din coș.",
    keywords: [
      "hai sa le platim",
      "plateste le",
      /\bplateste\b/,
      /\bplatim\b/,
      "checkout",
      "pay now",
      "pay them",
      "pay all",
    ],
    local: true,
  },
  {
    intent: "OPEN_INVOICE",
    description: "Deschide factura unei companii, de exemplu „vreau să văd factura Enel”.",
    keywords: [
      "vreau sa vad factura",
      "vreau factura",
      /\b(vezi|vad|arata|arata mi|deschide)\b.*\bfactura\b/,
    ],
    local: true,
  },
  {
    intent: "CLEAR_CART",
    description: "Golește coșul de plată.",
    keywords: ["goleste cosul", /\bgoleste\b/, "clear cart", "empty cart"],
    local: true,
  },
  {
    intent: "REMOVE_FROM_CART",
    description: "Scoate o factură din coș.",
    keywords: [/\bscoate\b/, /\belimina\b/, /\bremove\b/],
    local: true,
  },
  {
    intent: "ADD_TO_CART",
    description: "Adaugă o factură în coș, de exemplu „adaugă Enel”.",
    keywords: [/\badauga\b/, "pune in cos", "add to cart", /\badd\b/, "hai sa platim"],
    local: true,
  },
  {
    intent: "VIEW_CART",
    description: "Arată ce este în coș și totalul.",
    keywords: [/\b(cos|cart)\b/],
    local: true,
  },
  {
    intent: "VIEW_MONTH_BILLS",
    description: "Arată facturile scadente luna aceasta.",
    keywords: ["luna asta", "luna aceasta", "this month"],
    local: false,
  },
];

const matches = (text: string, keyword: Keyword) =>
  typeof keyword === "string" ? text.includes(keyword) : keyword.test(text);

/** Returns the first dictionary entry that matches the normalized text, or null. */
export function detectIntent(normalizedText: string): IntentDefinition | null {
  for (const entry of INTENT_DICTIONARY) {
    if (entry.keywords.some((k) => matches(normalizedText, k))) return entry;
  }
  return null;
}
