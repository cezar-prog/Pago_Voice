export function normalizeSpeech(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function capitalize(input: string): string {
  return input ? input.charAt(0).toUpperCase() + input.slice(1) : input;
}

export const WAKE_RE = /\b(?:hei|hai|hey|hay|ehi|hi)\s+(?:pago|bago|pagu|pogo|pa go)\b/;

export const CLOSE_RE =
  /\b(?:multumesc|multumim|multam|mersi|merci|mutumesc)\s+(?:frumos\s+)?(?:pago|bago|pagu|pogo|pa go)\b/;
