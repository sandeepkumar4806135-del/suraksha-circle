"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermission,
  isPushEnabled,
  isPushSupported,
  type PushEnableResult,
} from "@/lib/push-notifications";
import { isMessagingConfigured } from "@/lib/firebase";

interface PushNotificationToggleProps {
  circleId: string;
  /** Elder Mode: large text, huge touch target, high contrast. */
  elder?: boolean;
  lang?: "en" | "hi";
  /** Device owner name saved with the token (e.g. "Mummy"). */
  memberName?: string;
  /** Fired after a successful opt-in/out so parents can toast the result. */
  onStatusChange?: (msg: string) => void;
}

/**
 * Emergency-alert opt-in card. Explains *why* the permission is needed before
 * the browser prompt fires, then registers the FCM token under the circle so
 * SOS alerts reach this device even when the app is closed.
 */
export default function PushNotificationToggle({
  circleId,
  elder = false,
  lang = "en",
  memberName = "Family member",
  onStatusChange,
}: PushNotificationToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const hi = lang === "hi";
  const supported = isPushSupported();
  const configured = isMessagingConfigured();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isPushEnabled(circleId));
  }, [circleId]);

  const t = {
    title: hi ? "🔔 आपातकालीन अलर्ट" : "🔔 Emergency Alerts",
    subtitle: hi
      ? "SOS आने पर ऐप बंद होने पर भी सूचना पाएं"
      : "Get SOS alerts even when the app is closed",
    enable: hi ? "सूचनाएँ चालू करें" : "Enable Alerts",
    disable: hi ? "सूचनाएँ बंद करें" : "Turn Off",
    on: hi ? "चालू" : "ON",
    off: hi ? "बंद" : "OFF",
    why: hi
      ? "परिवार के किसी सदस्य को संकट में देखकर तुरंत सूचित किया जाएगा।"
      : "You'll be notified instantly if a family member triggers an SOS.",
    denied: hi
      ? "ब्राउज़र सेटिंग्स में सूचनाएँ ब्लॉक हैं — कृपया अनुमति दें।"
      : "Notifications are blocked in browser settings — please allow them.",
  };

  const finishEnable = useCallback(
    (res: PushEnableResult) => {
      if (res.status === "enabled") {
        setEnabled(true);
        setProblem(null);
        onStatusChange?.(
          hi ? "✅ आपातकालीन अलर्ट चालू" : "✅ Emergency alerts enabled"
        );
      } else if (res.status === "denied") {
        setProblem(t.denied);
      } else if (res.reason) {
        setProblem(res.reason);
      }
    },
    [hi, onStatusChange, t.denied]
  );

  const handleEnable = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await enablePushNotifications(circleId, memberName);
      finishEnable(res);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await disablePushNotifications(circleId);
      setEnabled(false);
      onStatusChange?.(hi ? "सूचनाएँ बंद कर दी गईं" : "Notifications turned off");
    } finally {
      setBusy(false);
    }
  };

  // Permission revoked from browser settings while we thought it was on.
  useEffect(() => {
    if (enabled && getNotificationPermission() === "denied") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(false);
      setProblem(t.denied);
    }
  }, [enabled, t.denied]);

  const sizeCls = elder
    ? {
        card: "p-5",
        icon: "h-14 w-14",
        iconInner: "h-8 w-8",
        text: "text-2xl",
        sub: "text-base",
        btn: "min-h-16 text-lg",
      }
    : {
        card: "p-4",
        icon: "h-11 w-11",
        iconInner: "h-6 w-6",
        text: "text-lg",
        sub: "text-xs",
        btn: "min-h-12 text-sm",
      };

  const Icon = problem && !enabled ? BellOff : enabled ? BellRing : Bell;

  return (
    <section
      className={`rounded-3xl border-2 shadow-sm ${
        enabled
          ? "border-emerald-200 bg-emerald-50"
          : problem
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white"
      } ${sizeCls.card}`}
      aria-label={t.title}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex shrink-0 items-center justify-center rounded-2xl ${
            enabled ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
          } ${sizeCls.icon}`}
          aria-hidden
        >
          <Icon className={sizeCls.iconInner} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`${sizeCls.text} font-extrabold text-slate-900`}>
              {t.title}
            </h3>
            <span
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
                enabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full bg-white ${enabled ? "animate-pulse" : ""}`}
                aria-hidden
              />
              {enabled ? t.on : t.off}
            </span>
          </div>
          <p className={`mt-0.5 ${sizeCls.sub} font-semibold text-slate-500`}>
            {t.subtitle}
          </p>
          {!enabled && !problem && (
            <p className={`mt-2 ${sizeCls.sub} font-semibold text-slate-500`}>
              {t.why}
            </p>
          )}
          {problem && (
            <p
              role="alert"
              className={`mt-2 ${sizeCls.sub} font-bold text-amber-800`}
            >
              ⚠️ {problem}
            </p>
          )}

          <button
            type="button"
            onClick={enabled ? handleDisable : handleEnable}
            disabled={busy || !supported || !configured}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50 ${
              enabled
                ? "border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            } ${sizeCls.btn}`}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : enabled ? (
              <BellOff className="h-5 w-5" aria-hidden />
            ) : (
              <BellRing className="h-5 w-5" aria-hidden />
            )}
            {enabled ? t.disable : t.enable}
          </button>
        </div>
      </div>
    </section>
  );
}
