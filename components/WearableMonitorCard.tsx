"use client";

import {
  BatteryLow,
  BatteryMedium,
  Footprints,
  HeartPulse,
  Siren,
  Watch,
} from "lucide-react";
import {
  useWearableMonitor,
  type WearableAlert,
} from "@/lib/wearable-monitor";

interface WearableMonitorCardProps {
  /** Elder Mode: huge vitals, high contrast, one-touch cancel. */
  elder?: boolean;
  lang?: "en" | "hi";
  /** Invoked when a pending alert was NOT cancelled — dispatches the SOS. */
  onDispatch: (alert: WearableAlert) => void;
  /** Invoked when the user cancels with "I am okay / False Alarm". */
  onCancel?: () => void;
}

export default function WearableMonitorCard({
  elder = false,
  lang = "en",
  onDispatch,
  onCancel,
}: WearableMonitorCardProps) {
  const {
    stats,
    fallDetection,
    toggleFallDetection,
    pending,
    countdown,
    simulateFall,
    simulateAbnormalHeartRate,
    cancelAlert,
    vitalsAbnormal,
  } = useWearableMonitor(onDispatch);

  const hi = lang === "hi";
  const t = {
    title: hi ? "⌚ स्मार्ट हेल्थ बैंड" : "⌚ Smart Health Band",
    subtitle: hi ? "लाइव वाइटल्स और गिरने का पता" : "Live vitals & fall detection",
    bpm: hi ? "बीपीएम" : "BPM",
    steps: hi ? "कदम" : "steps",
    fallDetection: hi ? "गिरने का पता चलाना" : "Fall Detection",
    on: hi ? "चालू" : "ON",
    off: hi ? "बंद" : "OFF",
    simFall: hi ? "गिरना सिम्युलेट करें" : "Simulate Fall",
    simHr: hi ? "असामान्य हृदय गति" : "Simulate Abnormal HR",
    dangerHr: hi ? "🚨 असामान्य हृदय गति!" : "🚨 Abnormal heart rate!",
    normalHr: hi ? "सामान्य" : "Normal",
    areYouOk: hi ? "क्या आप ठीक हैं?" : "Are you okay?",
    sosIn: hi ? "SOS भेजा जाएगा:" : "SOS dispatches in:",
    imOkay: hi ? "मैं ठीक हूँ — झूठा अलार्म" : "I'M OKAY — FALSE ALARM",
  };

  const handleCancel = () => {
    cancelAlert();
    onCancel?.();
  };

  const BatteryIcon = stats.battery < 30 ? BatteryLow : BatteryMedium;
  const hrTone = vitalsAbnormal ? "text-red-600" : "text-emerald-600";

  return (
    <section
      className="relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-sm"
      aria-label={hi ? "स्मार्ट हेल्थ बैंड" : "Smart health band"}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex items-center justify-center rounded-2xl bg-teal-100 text-teal-700 ${
              elder ? "h-12 w-12" : "h-10 w-10"
            }`}
            aria-hidden
          >
            <Watch className={elder ? "h-7 w-7" : "h-5 w-5"} />
          </span>
          <div>
            <h3 className={`${elder ? "text-2xl" : "text-lg"} font-extrabold text-slate-900`}>
              {t.title}
            </h3>
            <p className={`${elder ? "text-base" : "text-xs"} font-semibold text-slate-400`}>
              {t.subtitle}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
          <BatteryIcon
            className={`h-4 w-4 ${stats.battery < 30 ? "text-red-600" : "text-emerald-600"}`}
            aria-hidden
          />
          {stats.battery}%
        </span>
      </div>

      {/* Live vitals */}
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <HeartPulse
            className={`h-10 w-10 shrink-0 ${hrTone} ${vitalsAbnormal ? "animate-pulse" : ""}`}
            aria-hidden
          />
          <div>
            <p className={`font-black leading-none ${elder ? "text-6xl" : "text-4xl"} ${hrTone}`}>
              {stats.heartRate}
              <span className={`${elder ? "text-xl" : "text-base"} font-extrabold text-slate-400`}>
                {" "}
                {t.bpm}
              </span>
            </p>
            <p
              className={`mt-1 font-bold ${vitalsAbnormal ? "text-red-600" : "text-emerald-600"} ${
                elder ? "text-lg" : "text-xs"
              }`}
            >
              {vitalsAbnormal ? t.dangerHr : `✅ ${t.normalHr}`}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
          <Footprints className="h-4 w-4 text-slate-500" aria-hidden />
          {stats.steps.toLocaleString("en-IN")}
          <span className="font-semibold text-slate-400">{t.steps}</span>
        </span>
      </div>

      {/* Fall-detection toggle */}
      <button
        type="button"
        onClick={() => toggleFallDetection(!fallDetection)}
        aria-pressed={fallDetection}
        className={`flex w-full items-center justify-between gap-3 border-t-2 px-4 py-3 text-left transition active:scale-[0.99] ${
          fallDetection
            ? "border-emerald-100 bg-emerald-50 hover:bg-emerald-100"
            : "border-slate-100 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        <span
          className={`font-extrabold ${elder ? "text-xl text-slate-900" : "text-sm text-slate-700"}`}
        >
          {t.fallDetection}
        </span>
        <span
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-black text-white shadow ${
            elder ? "text-lg" : "text-xs"
          } ${fallDetection ? "bg-emerald-600" : "bg-slate-400"}`}
        >
          <span
            className={`h-2 w-2 rounded-full bg-white ${fallDetection ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {fallDetection ? t.on : t.off}
        </span>
      </button>

      {/* Simulation triggers (demo controls) */}
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
        <button
          type="button"
          onClick={simulateFall}
          className={`rounded-2xl border-2 border-orange-200 bg-orange-50 font-extrabold text-orange-800 transition hover:border-orange-400 active:scale-[0.98] ${
            elder ? "min-h-14 text-base" : "min-h-11 text-xs"
          }`}
        >
          🧪 {t.simFall}
        </button>
        <button
          type="button"
          onClick={simulateAbnormalHeartRate}
          className={`rounded-2xl border-2 border-rose-200 bg-rose-50 font-extrabold text-rose-800 transition hover:border-rose-400 active:scale-[0.98] ${
            elder ? "min-h-14 text-base" : "min-h-11 text-xs"
          }`}
        >
          🧪 {t.simHr}
        </button>
      </div>

      {/* Pending alert overlay — cancel window before SOS dispatch */}
      {pending && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-red-600/95 p-4 text-center backdrop-blur-sm"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <Siren className="h-9 w-9 animate-pulse text-white" aria-hidden />
          </span>
          <p className={`${elder ? "text-2xl" : "text-lg"} font-black text-white`}>
            {t.areYouOk}
          </p>
          <p
            className={`max-w-xs font-bold leading-snug text-red-100 ${
              elder ? "text-lg" : "text-sm"
            }`}
          >
            ⚠️ {pending.detail}
          </p>
          <p className="flex items-baseline gap-2 text-white">
            <span className="text-sm font-bold opacity-90">{t.sosIn}</span>
            <span className={`${elder ? "text-6xl" : "text-5xl"} font-black tabular-nums`}>
              {countdown}
            </span>
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className={`w-full rounded-2xl bg-emerald-500 font-black text-white shadow-xl transition hover:bg-emerald-600 active:scale-[0.98] ${
              elder ? "min-h-20 text-2xl" : "min-h-14 text-base"
            }`}
          >
            ✅ {t.imOkay}
          </button>
        </div>
      )}
    </section>
  );
}