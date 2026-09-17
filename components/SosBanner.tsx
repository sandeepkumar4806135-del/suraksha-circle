"use client";

import { useState, useEffect } from "react";
import { Siren, Phone, MapPin, CheckCircle } from "lucide-react";
import { SosAlert } from "@/lib/circle-events";

interface SosBannerProps {
  alert: SosAlert | null;
  onAcknowledge: () => void;
  onResolve: () => void;
  isRaisedByMe: boolean;
  elder: boolean;
  lang: string;
}

export function SosBanner({
  alert,
  onAcknowledge,
  onResolve,
  isRaisedByMe,
  elder,
}: SosBannerProps) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!alert) return;
    const id = setInterval(() => setPulse((p) => (p + 1) % 4), 400);
    return () => clearInterval(id);
  }, [alert]);

  if (!alert) return null;

  const safeText = elder
    ? "मैं सुरक्षित हूँ / SOS समाप्त करें"
    : "I am safe / Resolve SOS";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`relative mx-3 mb-4 overflow-hidden rounded-2xl border-2 bg-red-600 px-4 py-3 text-white shadow-2xl ${
        elder ? "border-red-900" : "border-red-800"
      }`}
    >
      {/* Pulsing red glow ring */}
      <div
        className={`absolute inset-0 -m-3 rounded-3xl border-2 border-red-400/60 animate-pulse ${
          pulse >= 2 ? "opacity-100" : "opacity-40"
        }`}
        aria-hidden
      />
      <div
        className={`absolute inset-0 -m-6 rounded-4xl border-2 border-red-300/40 ${pulse >= 2 ? "animate-ping" : ""}`}
        aria-hidden
      />

      <div className="relative flex min-h-24 items-center gap-4">
        {/* Siren icon */}
        <div
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-500 shadow-lg ${
            elder ? "h-16 w-16" : ""
          }`}
        >
          <Siren className={`h-7 w-7 ${elder ? "h-9 w-9" : ""}`} aria-hidden />
          <span
            className={`absolute top-0 right-0 block h-3 w-3 rounded-full bg-yellow-300 animate-ping`}
            aria-hidden
          />
        </div>

        {/* Alert text */}
        <div className="flex flex-1 flex-col gap-1">
          <p
            className={`text-lg font-black ${
              elder ? "text-2xl" : "text-xl"
            } leading-tight`}
          >
            {elder ? "🚨 आपातकालीन संकेत!" : "🚨 EMERGENCY ALERT!"}
          </p>
          <p
            className={`font-extrabold ${
              elder ? "text-xl text-red-100" : "text-lg text-red-100"
            }`}
          >
            {alert.raisedByName}ने SOS ट्रिगर किया है{" "}
            {elder ? "(Emergency triggered by)".concat("") : "triggered an SOS"}
          </p>
          {alert.note && (
            <p
              className={`max-w-md font-semibold ${
                elder ? "text-base" : "text-sm"
              } text-red-100`}
            >
              {elder ? "नोट: " : "Note: "}
              {alert.note}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onAcknowledge}
            className="flex min-h-12 w-36 items-center justify-center gap-2 rounded-xl bg-white font-black shadow-lg transition hover:bg-red-50 active:scale-95"
            aria-label={elder ? "SOS को मान्यता दें / कॉल करें" : "Acknowledge / Call Now"}
          >
            <Phone className="h-5 w-5" aria-hidden />
            {elder ? "माना / कॉल करें" : "Acknowledge / Call Now"}
          </button>
          {isRaisedByMe && (
            <button
              onClick={onResolve}
              className="flex min-h-12 w-36 items-center justify-center gap-2 rounded-xl bg-emerald-500 font-black shadow-lg transition hover:bg-emerald-400 active:scale-95"
              aria-label={elder ? "मैं सुरक्षित हूँ — SOS समाप्त करें" : "I am safe — resolve SOS"}
            >
              <CheckCircle className="h-5 w-5" aria-hidden />
              {safeText}
            </button>
          )}
        </div>
      </div>

      {/* Bottom bar with member info */}
      <div
        className={`relative mt-2 flex items-center gap-2 ${
          elder ? "text-base" : "text-xs"
        } font-semibold uppercase tracking-wide text-red-100`}
      >
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          {elder
            ? "परिवार सर्कल — सभी सदस्य सूचित होंगे"
            : "All circle members notified"}
        </span>
      </div>
    </div>
  );
}
