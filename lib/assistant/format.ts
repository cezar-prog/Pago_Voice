import type { BillCategory } from "./types";

/** 287.5 → "287,50 RON" (Romanian decimal comma). */
export const formatRon = (amount: number) =>
  `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;

/** "2026-11-20" → "20 nov." */
export const formatDateRo = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });

export const CATEGORY_LABEL_RO: Record<BillCategory, string> = {
  auto: "Auto",
  house: "Casă",
  utilities: "Utilități",
  telecom: "Telecom",
  other: "Altele",
};

/** Picks the Romanian singular or plural form: "1 factură", "3 facturi". */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
