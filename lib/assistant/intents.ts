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
  | "PAY_ALL"
  | "CHECKOUT"
  | "UNPAID_BILLS"
  | "OPEN_INVOICE"
  | "CLEAR_CART"
  | "REMOVE_FROM_CART"
  | "ADD_TO_CART"
  | "VIEW_CART"
  | "VIEW_MONTH_BILLS";

export type Keyword = string | RegExp;

/** Shown when no intent or answer matches, so the assistant never stays silent. */
export const FALLBACK_REPLY =
  "Bună, sunt asistentul tău vocal Pago. Te pot ajuta să vizualizezi sau să plătești facturile. Cu ce te pot ajuta?";

/** Words that mean "everything", used only right after the payment follow-up question. */
export const ALL_WORDS = ["tot", "toate", "toate facturile", "tot le"];

export interface IntentDefinition {
  intent: IntentName;
  description: string;
  keywords: Keyword[];
  local: boolean;
}

export const INTENT_DICTIONARY: IntentDefinition[] = [
  {
    // Must come before CHECKOUT, which also matches "plateste".
    intent: "PAY_ALL",
    description: "Selectează toate facturile neplătite, le adaugă în coș și deschide plata imediat.",
    keywords: [
      /\b(plateste|platesc|platim|plati) (tot|toate)\b/,
      "pay everything",
      "pay all",
    ],
    local: true,
  },
  {
    intent: "CHECKOUT",
    description: "Deschide plata pentru facturile din coș.",
    keywords: [
      "hai sa le platim",
      "plateste le",
      /\bplateste\b/,
      /\bplatim\b/,
      "hai sa platim",
      "checkout",
      "pay now",
      "pay them",
    ],
    local: true,
  },
  {
    intent: "UNPAID_BILLS",
    description: "Arată doar facturile neplătite (de plată, restante) și întreabă dacă vrea să plătească.",
    keywords: ["de plata", "de achitat", "restant", "neplatit", "neachitat", "unpaid", "overdue"],
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
    description: "Adaugă una sau mai multe facturi în coș, de exemplu „adaugă Enel și Digi” sau „plătesc Digi, Engie”.",
    keywords: [/\badauga\b/, /\bplatesc\b/, "pune in cos", "add to cart", /\badd\b/],
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
