"use client";

import { BarChart3, Volume2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMemo } from "react";
import { useWeeklyHealthMetrics, speakHealthSummary } from "@/lib/health-insights";
import type { WearableStats } from "@/lib/wearable-monitor";
import type { ScheduleItem } from "@/lib/medication-schedule";
import type { GeoPosition } from "@/lib/safe-zones";

interface HealthInsightsCardProps {
  elder?: boolean;
  lang?: "en" | "hi";
  stats: WearableStats;
  schedules: ScheduleItem[];
  position: GeoPosition | null;
  elderName?: string;
  onSpeakSummary?: () => void;
}

export default function HealthInsightsCard({
  elder = false,
  lang = "en",
  stats,
  schedules,
  position,
  elderName = "Mummy",
  onSpeakSummary,
}: HealthInsightsCardProps) {
  const metrics = useWeeklyHealthMetrics(stats, schedules, position);

  const hi = lang === "hi";
  const t = {
    title: hi ? "📊 स्वास्थ्य जानकारी" : "📊 Health Insights",
    subtitle: hi ? "पिछले ७ दिन का स्वास्थ्य विश्लेषण" : "Weekly health summary",
    avgHeartRate: hi ? "औसत हृदय गति" : "Avg Heart Rate",
    totalSteps: hi ? "कुल कदम" : "Total Steps",
    medAdherence: hi ? "दवा पालन" : "Medication Adherence",
    avgSleep: hi ? "औसत नींद" : "Avg Sleep",
    activeDays: hi ? "सक्रिय दिन" : "Active Days",
    trendUp: hi ? "बढ़ रही" : "Trending Up",
    trendDown: hi ? "घट रही" : "Trending Down",
    trendStable: hi ? "स्थिर" : "Stable",
    speakSummary: hi ? "आवाज़ सारांश सुनें" : "Listen to Voice Summary",
    bpm: hi ? "बीपीएम" : "BPM",
    steps: hi ? "कदम" : "steps",
    hours: hi ? "घंटे" : "hours",
    days: hi ? "दिन" : "days",
    percent: hi ? "प्रतिशत" : "%",
    today: hi ? "आज" : "Today",
    thisWeek: hi ? "इस सप्ताह" : "This Week",
  };

  const trendColor =
    metrics.heartRateTrend === "up"
      ? "text-rose-600"
      : metrics.heartRateTrend === "down"
        ? "text-emerald-600"
        : "text-slate-500";

  const TrendIcon =
    metrics.heartRateTrend === "up"
      ? TrendingUp
      : metrics.heartRateTrend === "down"
        ? TrendingDown
        : Minus;

  const barColor = elder ? "bg-rose-500" : "bg-teal-500";
  const maxSteps = useMemo(() => Math.max(...metrics.days.map((d) => d.steps), 1), [metrics.days]);
  const maxHeartRate = useMemo(() => Math.max(...metrics.days.map((d) => d.heartRate), 1), [metrics.days]);

  const handleSpeak = () => {
    speakHealthSummary(metrics, elderName, lang);
    onSpeakSummary?.();
  };

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm ${elder ? "p-6" : ""}`}
      aria-label={t.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`flex items-center justify-center rounded-2xl bg-teal-100 text-teal-700 ${elder ? "h-14 w-14" : "h-10 w-10"}`} aria-hidden>
              <BarChart3 className={elder ? "h-8 w-8" : "h-5 w-5"} />
            </span>
            <div>
              <h3 className={`${elder ? "text-2xl" : "text-lg"} font-extrabold text-slate-900`}>{t.title}</h3>
              <p className={`${elder ? "text-base" : "text-xs"} font-semibold text-slate-400`}>{t.subtitle}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSpeak}
          className={`flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 ${elder ? "text-base px-5 py-3" : ""}`}
          aria-label={t.speakSummary}
        >
          <Volume2 className={`h-4 w-4 ${elder ? "h-5 w-5" : ""}`} aria-hidden />
          {t.speakSummary}
        </button>
      </div>
      <div className={`mt-5 grid gap-4 ${elder ? "grid-cols-2 gap-4" : "grid-cols-2 gap-3"}`}>
        <div className={`rounded-2xl border border-slate-100 bg-slate-50 p-4 ${elder ? "p-5" : ""}`}>
          <p className={`flex items-center gap-2 ${elder ? "text-base" : "text-xs"} font-semibold text-slate-500`}>
            <span className="h-2 w-2 rounded-full bg-rose-400" aria-hidden />
            {t.avgHeartRate}
          </p>
          <p className={`mt-1 flex items-baseline gap-2 ${elder ? "text-4xl" : "text-2xl"} font-black text-slate-900`}>
            {metrics.avgHeartRate}
            <span className="text-sm font-semibold text-slate-400">{t.bpm}</span>
          </p>
          <p className={`mt-1 flex items-center gap-1.5 font-bold ${trendColor} ${elder ? "text-base" : "text-sm"}`}>
            <TrendIcon className={`h-4 w-4 ${elder ? "h-5 w-5" : ""}`} aria-hidden />
            {metrics.heartRateTrend === "up" ? t.trendUp : metrics.heartRateTrend === "down" ? t.trendDown : t.trendStable}
          </p>
        </div>

        <div className={`rounded-2xl border border-slate-100 bg-slate-50 p-4 ${elder ? "p-5" : ""}`}>
          <p className={`flex items-center gap-2 ${elder ? "text-base" : "text-xs"} font-semibold text-slate-500`}>
            <span className="h-2 w-2 rounded-full bg-teal-400" aria-hidden />
            {t.totalSteps}
          </p>
          <p className={`mt-1 flex items-baseline gap-2 ${elder ? "text-4xl" : "text-2xl"} font-black text-slate-900`}>
            {metrics.totalSteps.toLocaleString()}
            <span className="text-sm font-semibold text-slate-400">{t.steps}</span>
          </p>
          <p className={`mt-1 font-semibold text-slate-500 ${elder ? "text-base" : "text-sm"}`}>
            {metrics.activeDays} / 7 {t.activeDays}
          </p>
        </div>

        <div className={`rounded-2xl border border-slate-100 bg-slate-50 p-4 ${elder ? "p-5" : ""}`}>
          <p className={`flex items-center gap-2 ${elder ? "text-base" : "text-xs"} font-semibold text-slate-500`}>
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
            {t.medAdherence}
          </p>
          <p className={`mt-1 flex items-baseline gap-2 ${elder ? "text-4xl" : "text-2xl"} font-black text-slate-900`}>
            {metrics.medicationAdherencePct}
            <span className="text-sm font-semibold text-slate-400">{t.percent}</span>
          </p>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${metrics.medicationAdherencePct}%` }} aria-label={`${metrics.medicationAdherencePct} percent`} />
          </div>
        </div>

        <div className={`rounded-2xl border border-slate-100 bg-slate-50 p-4 ${elder ? "p-5" : ""}`}>
          <p className={`flex items-center gap-2 ${elder ? "text-base" : "text-xs"} font-semibold text-slate-500`}>
            <span className="h-2 w-2 rounded-full bg-indigo-400" aria-hidden />
            {t.avgSleep}
          </p>
          <p className={`mt-1 flex items-baseline gap-2 ${elder ? "text-4xl" : "text-2xl"} font-black text-slate-900`}>
            {metrics.avgSleepHours.toFixed(1)}
            <span className="text-sm font-semibold text-slate-400">{t.hours}</span>
          </p>
          <p className={`mt-1 font-semibold text-slate-500 ${elder ? "text-base" : "text-sm"}`}>
            ~{Math.round(metrics.avgSleepHours)} hrs/night
          </p>
        </div>
      </div>

      <div className={`mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 ${elder ? "p-5" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`font-bold ${elder ? "text-base" : "text-sm"} text-slate-700`}>{t.thisWeek}</p>
          <p className={`text-xs font-semibold text-slate-400 ${elder ? "text-sm" : ""}`}>{t.steps} / day</p>
        </div>
        <div className="flex items-end gap-2" style={{ height: elder ? "120px" : "80px" }}>
          {metrics.days.map((day, index) => {
            const barHeight = (day.steps / maxSteps) * 100;
            const isToday = index === 6;
            return (
              <div key={day.date} className={`flex flex-1 flex-col items-center gap-1 ${isToday ? "opacity-100" : "opacity-70"}`}>
                <span className={`text-xs font-bold ${isToday ? "text-rose-600" : "text-slate-400"} ${elder ? "text-sm" : ""}`}>
                  {day.dayLabel.slice(0, 3)}
                </span>
                <div className={`w-full rounded-t-lg ${barColor} transition-all duration-300`} style={{ height: `${Math.max(barHeight, 4)}%` }} aria-label={`${day.steps} ${t.steps} on ${day.dayLabel}`} />
                {isToday && <span className="text-xs font-bold text-rose-600">●</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 ${elder ? "p-5" : ""}`}>
        <p className={`mb-3 font-bold ${elder ? "text-base" : "text-sm"} text-slate-700`}>{t.avgHeartRate} ({t.bpm})</p>
        <div className="flex items-end gap-2" style={{ height: elder ? "100px" : "60px" }}>
          {metrics.days.map((day, index) => {
            const barHeight = (day.heartRate / maxHeartRate) * 100;
            const isToday = index === 6;
            const isNormal = day.heartRate >= 70 && day.heartRate <= 90;
            const barColorClass = isNormal ? "bg-emerald-400" : "bg-rose-400";
            return (
              <div key={day.date} className={`flex flex-1 flex-col items-center gap-1 ${isToday ? "opacity-100" : "opacity-60"}`}>
                <span className={`text-xs font-bold ${isToday ? "text-rose-600" : "text-slate-400"} ${elder ? "text-sm" : ""}`}>
                  {day.dayLabel.slice(0, 3)}
                </span>
                <div className={`w-full rounded-t-lg ${barColorClass} transition-all duration-300`} style={{ height: `${Math.max(barHeight, 4)}%` }} aria-label={`${day.heartRate} ${t.bpm} on ${day.dayLabel}`} />
              </div>
            );
          })}
        </div>
      </div>

      {elder && (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4 border border-emerald-200">
          <p className="text-lg font-extrabold text-emerald-800">{hi ? "✅ आपका स्वास्थ्य अच्छा है" : "✅ Your health looks good"}</p>
          <p className="mt-2 text-sm font-semibold text-emerald-700">
            {hi ? `हृदय गति ${metrics.avgHeartRate} बीपीएम, ${metrics.activeDays} सक्रिय दिन, और ${metrics.medicationAdherencePct}% दवा पालन` : `Heart rate ${metrics.avgHeartRate} BPM, ${metrics.activeDays} active days, and ${metrics.medicationAdherencePct}% medication adherence`}
          </p>
        </div>
      )}
    </section>
  );
}
