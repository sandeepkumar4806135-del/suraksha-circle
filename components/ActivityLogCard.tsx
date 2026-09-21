"use client";

import { CheckCircle2, MapPin, Navigation, Pin, Siren, ShieldCheck, BellRing, type LucideIcon } from "lucide-react";
import { formatRelativeTime, type ActivityLog, type ActivityLogType } from "@/lib/activity-log";

const STYLES: Record<ActivityLogType, { icon: LucideIcon; chip: string }> = {
  check_in: { icon: CheckCircle2, chip: "bg-emerald-100 text-emerald-700" },
  check_in_nudge: { icon: BellRing, chip: "bg-amber-100 text-amber-700" },
  sos_triggered: { icon: Siren, chip: "bg-red-100 text-red-700" },
  sos_resolved: { icon: ShieldCheck, chip: "bg-emerald-100 text-emerald-700" },
  location_started: { icon: Navigation, chip: "bg-sky-100 text-sky-700" },
  location_stopped: { icon: MapPin, chip: "bg-sky-100 text-sky-700" },
  place_marked: { icon: Pin, chip: "bg-violet-100 text-violet-700" },
};

export default function ActivityLogCard({ logs, elder, lang }: { logs: ActivityLog[]; elder?: boolean; lang?: "en" | "hi" }) {
  const hi = lang === "hi";
  const title = hi ? "गतिविधि इतिहास" : "Activity History";
  const sub = hi ? "सर्कल की सभी गतिविधियाँ" : "Everything happening in your circle";
  const empty = hi ? "अभी कोई गतिविधि नहीं।" : "No activity yet.";
  const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h3 className={`${elder ? "text-2xl" : "text-lg"} font-extrabold text-slate-900`}>{elder ? `📜 ${title}` : title}</h3>
          <p className={`${elder ? "text-base" : "text-xs"} font-semibold text-slate-400`}>{sub}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{sorted.length} {hi ? "इवेंट" : "events"}</span>
      </div>
      {sorted.length === 0 ? (
        <p className={`mt-4 rounded-2xl bg-slate-50 p-4 text-center font-semibold text-slate-500 ${elder ? "text-lg" : "text-sm"}`}>{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {sorted.map((l) => {
            const s = STYLES[l.type] ?? STYLES.check_in;
            const Icon = s.icon;
            return (
              <li key={l.id} className={`flex items-start gap-3 rounded-2xl border bg-white shadow-sm ${elder ? "min-h-20 border-2 border-slate-300 p-4" : "border-slate-200 p-3"}`}>
                <span className={`flex shrink-0 items-center justify-center rounded-2xl ${s.chip} ${elder ? "h-14 w-14" : "h-11 w-11"}`} aria-hidden>
                  <Icon className={elder ? "h-8 w-8" : "h-6 w-6"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className={`${elder ? "text-xl" : "text-base"} font-extrabold text-slate-900`}>{l.message}</p>
                    <time dateTime={new Date(l.timestamp).toISOString()} className={`shrink-0 font-bold text-slate-400 ${elder ? "text-sm" : "text-xs"}`}>{formatRelativeTime(l.timestamp, hi ? "hi" : "en")}</time>
                  </div>
                  <p className={`font-semibold ${elder ? "text-lg text-slate-800" : "text-sm text-slate-500"}`}>{l.userName}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
