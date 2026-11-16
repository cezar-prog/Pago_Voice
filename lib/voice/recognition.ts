export interface SpeechAlternative {
  transcript: string;
}

export interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternative;
}

export interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}

export interface SpeechResultEvent {
  readonly results: SpeechResultList;
}

export interface SpeechErrorEvent {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function joinResults(results: SpeechResultList): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    parts.push(results[i][0]?.transcript ?? '');
  }
  return parts.join(' ');
}
