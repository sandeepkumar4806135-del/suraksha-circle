"use client";

import type { CircleEvent, CircleEventType } from "@/lib/circle-events";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  HeartPulse,
  Home,
  MapPin,
  Mic,
  ShieldCheck,
  Siren,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

const EVENT_STYLES: Record<
  CircleEventType,
  { icon: LucideIcon; chip: string }
> = {
  checkin: { icon: CheckCircle2, chip: "bg-emerald-100 text-emerald-700" },
  sos: { icon: Siren, chip: "bg-red-100 text-red-700" },
  "sos-resolved": { icon: ShieldCheck, chip: "bg-emerald-100 text-emerald-700" },
  "share-start": { icon: MapPin, chip: "bg-sky-100 text-sky-700" },
  "share-end": { icon: Car, chip: "bg-sky-100 text-sky-700" },
  "member-added": { icon: UserPlus, chip: "bg-teal-100 text-teal-700" },
  cascade: { icon: AlertTriangle, chip: "bg-orange-100 text-orange-700" },
        "zone-arrival": { icon: Home, chip: "bg-violet-100 text-violet-700" },
  "zone-departure": { icon: MapPin, chip: "bg-amber-100 text-amber-700" },
  "audio-verification": { icon: Mic, chip: "bg-fuchsia-100 text-fuchsia-700" },
  "fall-detected": { icon: AlertTriangle, chip: "bg-orange-100 text-orange-700" },
  "abnormal-heart-rate": { icon: HeartPulse, chip: "bg-rose-100 text-rose-700" },
};

const LABELS = {
  en: {
    title: "Activity Log",
    subtitle: "Live feed of your Suraksha Circle",
    empty: "No activity yet. Check-ins, SOS alerts and location shares will appear here.",
    active: "ACTIVE",
  },
  hi: {
    title: "गतिविधि लॉग",
    subtitle: "आपके सर्कल की लाइव जानकारी",
    empty: "अभी कोई गतिविधि नहीं। चेक-इन, SOS और लोकेशन शेयर यहाँ दिखेंगे।",
    active: "सक्रिय",
  },
} as const;

function relativeTime(ts: number, lang: "en" | "hi"): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return lang === "hi" ? "अभी" : "just now";
  if (mins < 60) return lang === "hi" ? `${mins} मिनट पहले` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return lang === "hi" ? `${hours} घंटे पहले` : `${hours}h ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ActivityLog({
  events,
  circleId,
  elder = false,
  lang = "en",
}: {
  events: CircleEvent[];
  circleId: string;
  /** Elder Mode: high-contrast text and large touch targets */
  elder?: boolean;
  lang?: "en" | "hi";
}) {
  const t = LABELS[lang];
  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-label={t.title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h3 className={`${elder ? "text-2xl" : "text-lg"} font-extrabold text-slate-900`}>
            {elder ? `📜 ${t.title}` : t.title}
          </h3>
          <p className={`${elder ? "text-base" : "text-xs"} font-semibold text-slate-400`}>
            {t.subtitle} · Circle: {circleId}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
          {events.length} {lang === "hi" ? "इवेंट" : "events"}
        </span>
      </div>

      {events.length === 0 ? (
        <p
          className={`mt-4 rounded-2xl bg-slate-50 p-4 text-center font-semibold text-slate-500 ${
            elder ? "text-lg" : "text-sm"
          }`}
        >
          {t.empty}
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {events.map((e) => {
            const s = EVENT_STYLES[e.type] ?? EVENT_STYLES.checkin;
            const Icon = s.icon;
            return (
              <li
                key={e.id}
                className={`flex items-start gap-3 rounded-2xl border bg-white shadow-sm ${
                  elder ? "min-h-20 border-2 border-slate-300 p-4" : "border-slate-200 p-3"
                }`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-2xl ${s.chip} ${
                    elder ? "h-14 w-14" : "h-11 w-11"
                  }`}
                  aria-hidden
                >
                  <Icon className={elder ? "h-8 w-8" : "h-6 w-6"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p
                      className={`${elder ? "text-xl" : "text-base"} font-extrabold text-slate-900`}
                    >
                      {e.title}
                    </p>
                    <time
                      dateTime={new Date(e.timestamp).toISOString()}
                      className={`shrink-0 font-bold text-slate-400 ${elder ? "text-sm" : "text-xs"}`}
                    >
                      {relativeTime(e.timestamp, lang)}
                    </time>
                  </div>
                  <p
                    className={`font-semibold ${elder ? "text-lg text-slate-800" : "text-sm text-slate-500"}`}
                  >
                    {e.actorName}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                  {e.type === "sos" && e.active && (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-black tracking-wide text-white">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                      {t.active}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
