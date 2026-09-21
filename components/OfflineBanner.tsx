"use client";

import { WifiOff, Phone } from "lucide-react";

import { useConnectivity } from "@/lib/connectivity";

interface OfflineBannerProps {
  /** Elder Mode: larger text, higher contrast, bigger icons. */
  elder?: boolean;
  lang?: "en" | "hi";
}

/** Prominent amber banner shown whenever the browser reports offline.
 * Non-blocking: sits at the top of the page flow without covering content.
 */
export default function OfflineBanner({ elder = false, lang = "en" }: OfflineBannerProps) {
  const { online, syncDegraded } = useConnectivity();
  const hi = lang === "hi";

  if (online && !syncDegraded) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-3 mb-4 flex items-center gap-3 rounded-2xl border-2 bg-amber-50 text-amber-950 shadow-sm ${
        elder ? "border-amber-700 px-5 py-4" : "border-amber-400 px-4 py-3"
      }`}
    >
      <WifiOff
        aria-hidden
        className={`shrink-0 text-amber-700 ${elder ? "h-9 w-9" : "h-6 w-6"}`}
      />
      <p className={elder ? "text-xl font-extrabold leading-snug" : "text-sm font-bold leading-snug"}>
        ⚠️{" "}
        {online
          ? hi
            ? "सिंक में दिक्कत आ रही है — ताज़ा जानकारी में देरी हो सकती है।"
            : "Having trouble syncing — your view may be slightly out of date."
          : hi
            ? "आप वर्तमान में ऑफ़लाइन हैं। दोबारा जुड़ने तक चेक-इन और अलर्ट में देरी हो सकती है।"
            : "You are currently offline. Check-ins and alerts may be delayed until reconnected."}{" "}
        {hi ? "तुरंत मदद के लिए डायल करें" : "For immediate emergencies, dial"}{" "}
        <a
          href="tel:112"
          className={`inline-flex items-center gap-1 rounded-lg bg-amber-600 text-white underline-offset-2 ${
            elder ? "px-2 py-0.5 text-xl font-black" : "px-1 font-black"
          }`}
        >
          <Phone aria-hidden className={elder ? "h-5 w-5" : "h-4 w-4"} />
          112
        </a>
      </p>
    </div>
  );
}
