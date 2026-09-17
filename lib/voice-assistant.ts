/**
 * Voice-Activated Check-In and Assistant
 * ========================================
 * Client-side utility wrapping the browser SpeechRecognition API.
 *
 * Detects two "I am safe" utterances:
 *   - English:  "i am safe"
 *   - Hindi:    "मैं ठीक हूँ"  (romanised form also accepted: "main theek hoon")
 *
 * Graceful fallback when the API is unavailable (SSR / unsupported browsers):
 *   - `isSpeechSupported()` returns `false`
 *   - `startVoiceCheckIn` calls `onResult` never and `onError` with an
 *     "unsupported" reason so the UI can show a toast.
 */

export type VoiceLang = "en" | "hi";

export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "recognized"
  | "unsupported";

export interface VoiceResult {
  /** The recognised transcript (normalised to lowercase, trimmed). */
  transcript: string;
  /** Which language matched, or null if nothing matched. */
  matchedLang: VoiceLang | null;
}

/** Phrases that signal a safe check-in, keyed by language. */
const SAFE_PHRASES: Record<VoiceLang, RegExp[]> = {
  en: [/^i\s+am\s+safe\b/i, /^im\s+safe\b/i, /^i\s+am\s+okay\b/i, /^im\s+okay\b/i],
  hi: [/मैं\s*ठीक\s*हूँ/i, /main\s+theek\s+houn/i, /main\s+theek\s+hai/i, /^मैं\s+ठीक\s*हूँ/i],
};

/* Minimal structural types for the Web Speech API (avoids `any` and keeps
 * zero runtime dependencies — these only describe what we use). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

/** True when the browser exposes a SpeechRecognition / webkitSpeechRecognition constructor. */
export function isSpeechSupported(): boolean {
  return getRecognitionCtor() !== null;
}

function getRecognition(): SpeechRecognitionLike {
  const Ctor = getRecognitionCtor();
  return Ctor ? new Ctor() : (null as unknown as SpeechRecognitionLike);
}

/**
 * Starts listening for a safe-check voice command.
 *
 * @param lang   UI language hint ("en" | "hi") — picks the matching phrase list.
 * @param onResult Called once with the matched VoiceResult when a phrase is detected.
 * @param onState   Called on every state transition (listening → thinking → recognized).
 * @param timeoutMs  Auto-stop listening after this many ms (default 15s).
 * @returns a stop function; call it to abort listening early.
 */
export function startVoiceCheckIn(
  lang: VoiceLang,
  onResult: (result: VoiceResult) => void,
  onState: (state: VoiceState, transcript?: string) => void,
  timeoutMs = 15000
): () => void {
  if (!isSpeechSupported()) {
    onState("unsupported");
    return () => undefined;
  }

  const recog = getRecognition();
  recog.lang = lang === "hi" ? "hi-IN" : "en-US";
  recog.interimResults = false;
  recog.continuous = false;
  recog.maxAlternatives = 3;

  let stopped = false;

  const stop = () => {
    stopped = true;
    try {
      recog.stop();
    } catch {}
  };

  const timer = setTimeout(() => {
    if (!stopped) stop();
  }, timeoutMs);

    recog.onresult = (e: SpeechRecognitionEventLike) => {
    if (stopped) return;
    onState("thinking");
    let transcript = "";
    for (let i = 0; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    transcript = transcript.trim();
    onState("recognized", transcript);

    const phrases = SAFE_PHRASES[lang] ?? SAFE_PHRASES.en;
    const matched = phrases.some((r) => r.test(transcript));
    const matchedLang = matched ? lang : null;

    onResult({ transcript, matchedLang });
    stop();
  };

      recog.onerror = () => {
    if (stopped) return;
    stop();
    onState("unsupported"); // treat API errors as unsupported for simplicity
  };

  recog.onend = () => {
    clearTimeout(timer);
  };

  onState("listening");
  try {
    recog.start();
  } catch {
    onState("unsupported");
  }

  return stop;
}

/** Speaks a short voice prompt via the Web Speech API (graceful no-op if unavailable). */
export function speakPrompt(text: string, lang: VoiceLang): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    speechSynthesis?: {
      speak: (utterance: {
        lang: string;
        rate: number;
      }) => void;
    };
    SpeechSynthesisUtterance?: new (text: string) => {
      lang: string;
      rate: number;
    };
  };
  if (!w.speechSynthesis || !w.SpeechSynthesisUtterance) return;
  const utter = new w.SpeechSynthesisUtterance(text);
  utter.lang = lang === "hi" ? "hi-IN" : "en-US";
  utter.rate = 0.9;
  w.speechSynthesis.speak(utter);
}
