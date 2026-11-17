import { CATEGORY_KEYWORDS } from "./bills";
import { normalizeSpeech } from "./text";
import type { Bill } from "./types";

/** The AI's marker for "all bills". */
const ALL_MARKER = "TOT";

/** True when the AI's entity list means every bill ("TOT"). */
export function meansAll(entities: string[]): boolean {
  return entities.some((e) => e.trim().toUpperCase() === ALL_MARKER);
}

/**
 * Bills named by the AI's target entities. A company name (full name or its first word)
 * wins; a category word such as "utilitati" is used only when no company matches.
 * Entities are plain text from the model, so nothing is guessed beyond these matches.
 */
export function resolveEntities(entities: string[], bills: Bill[]): Bill[] {
  const found = new Map<string, Bill>();

  for (const entity of entities) {
    const e = normalizeSpeech(entity);
    if (!e || e.toUpperCase() === ALL_MARKER) continue;
    const words = new Set(e.split(" "));

    const byName = bills.filter((b) => {
      const name = normalizeSpeech(b.provider);
      return e.includes(name) || words.has(name.split(" ")[0]);
    });
    const matches =
      byName.length > 0
        ? byName
        : bills.filter((b) => CATEGORY_KEYWORDS[b.category].some((k) => words.has(k)));

    for (const bill of matches) found.set(bill.id, bill);
  }

  return [...found.values()];
}
