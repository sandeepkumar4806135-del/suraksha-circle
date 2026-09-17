"use client";

import { Mic, MicOff } from "lucide-react";
import { useState } from "react";
import {
  isSpeechSupported,
  speakPrompt,
  startVoiceCheckIn,
  type VoiceLang,
  type VoiceResult,
  type VoiceState,
} from "@/lib/voice-assistant";

interface VoiceAssistantButtonProps {
  /** Current UI language for phrase matching + spoken prompts. */
  lang: VoiceLang;
  /** Elder Mode: extra-large button and text. */
  elder?: boolean;
  /** Called when a safe-check phrase is recognised. Should trigger the check-in flow. */
  onSafeVoice: (result: VoiceResult) => void;
}

const PROMPT_TEXT: Record<VoiceLang, string> = {
  en: "Say I am safe",
  hi: "मैं ठीक हूँ कहें",
};

export default function VoiceAssistantButton({
  lang,
  elder = false,
  onSafeVoice,
}: VoiceAssistantButtonProps) {
    const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");

  const handleClick = () => {
    if (state === "listening") {
      return; // already listening
    }
    if (!isSpeechSupported()) {
      setState("unsupported");
      speakPrompt(
        lang === "hi"
          ? "भाषण मानन समर्थित नहीं है"
          : "Speech recognition is not supported in this browser.",
        lang
      );
      return;
    }

    speakPrompt(PROMPT_TEXT[lang], lang);
    setState("listening");

    const stop = startVoiceCheckIn(
      lang,
      (result: VoiceResult) => {
        if (result.matchedLang) {
          onSafeVoice(result);
          setState("recognized");
          setTranscript(result.transcript);
        } else {
          setState("idle");
          setTranscript("");
        }
      },
      (s: VoiceState, t?: string) => {
        setState(s);
        setTranscript(t ?? "");
      }
    );

        // Ensure we always clean up after the recognition session ends.
    setTimeout(stop, 16000);
  };

  const isListening = state === "listening";
  const Icon = isListening ? MicOff : Mic;
  const iconSize = elder ? "h-10 w-10" : "h-6 w-6";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        aria-label={
          isListening
            ? lang === "hi"
              ? "बंद करने के लिए हमेशा दबाएं"
              : "Hold to stop listening"
            : lang === "hi"
              ? "सुरक्षित हूँ कहने के लिए बोलें"
              : "Tap to say I am safe"
        }
        className={`relative flex items-center justify-center rounded-full shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          elder ? "h-28 w-28" : "h-16 w-16"
        } ${
          isListening
            ? "animate-pulse bg-red-500 text-white hover:bg-red-600 focus:ring-red-500"
            : "bg-white text-slate-600 ring-2 ring-slate-300 hover:bg-slate-100 hover:text-emerald-600 focus:ring-emerald-500"
        }`}
      >
                <Icon
          className={`${iconSize} transition-all`}
          style={isListening ? { animation: "none" } : undefined}
          aria-hidden
        />
        {isListening && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow:
                "0 0 0 4px rgba(254,252,252,0.8), 0 0 0 8px rgba(239,68,68,0.4), 0 0 0 12px rgba(239,68,68,0.2)",
              animation: "pulseRing 1.5s infinite",
            }}
            aria-hidden
          />
        )}
      </button>

      {state === "listening" && (
        <span
          className={`font-medium ${
            elder ? "text-lg text-red-700" : "text-xs text-red-600"
          }`}
        >
          🎙️ {transcript || (lang === "hi" ? "सुन रहा हूँ…" : "Listening…")}
        </span>
      )}
      {!isSpeechSupported() && state === "unsupported" && (
        <span
          className={`font-medium ${
            elder ? "text-base text-amber-700" : "text-xs text-amber-600"
          }`}
        >
          ⚠️{" "}
          {lang === "hi"
            ? "भाषण मानन समर्थित नहीं"
            : "Speech not supported"}
        </span>
      )}
    </div>
  );
}
