"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Languages,
  LogOut,
  MapPin,
  Pill,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import {
  ACTIVE_CIRCLE_ID,
  subscribeToCircleEvents,
  subscribeToActiveSos,
  type CircleEvent,
  type SosAlert,
} from "@/lib/circle-events";
import { DEMO_SCHEDULES, type ScheduleItem } from "@/lib/medication-schedule";
import { subscribeToSafeZones, type SafeZone } from "@/lib/safe-zones";
import { useWearableMonitor } from "@/lib/wearable-monitor";
import {
  endCaretakerSession,
  restoreCaretakerSession,
  ROLE_META,
  ROLE_PERMISSIONS,
  validateCaretakerAccess,
  type CaretakerSession,
} from "@/lib/caretaker-access";
import { getDb } from "@/lib/firebase";

/** Login screen copy (EN/HI). */
const GATE_TEXT = {
  en: {
    title: "🔒 Restricted Access",
    subtitle: "Caretaker / Doctor Portal — read-only snapshot",
    prompt: "Enter the access code shared by the family",
    placeholder: "e.g. DR-7K2M9X4Q",
    submit: "Unlock Portal",
    checking: "Verifying access code…",
    invalid: "Invalid access code. Please check and try again.",
    revoked: "This access code has been revoked by the family.",
    expired: "This access code has expired. Ask the family for a new one.",
    hint: "Codes look like DR-… (doctor) or CT-… (caretaker). All views are strictly read-only.",
  },
  hi: {
    title: "🔒 प्रतिबंधित पहुँच",
    subtitle: "केयरटेकर / डॉक्टर पोर्टल — केवल पढ़ने के लिए",
    prompt: "परिवार द्वारा साझा किया गया एक्सेस कोड दर्ज करें",
    placeholder: "जैसे: DR-7K2M9X4Q",
    submit: "पोर्टल खोलें",
    checking: "एक्सेस कोड सत्यापित हो रहा है…",
    invalid: "अमान्य एक्सेस कोड। कृपया जाँचकर पुनः प्रयास करें।",
    revoked: "यह एक्सेस कोड परिवार द्वारा रद्द कर दिया गया है।",
    expired: "यह एक्सेस कोड समाप्त हो गया है। कृपया परिवार से नया कोड लें।",
    hint: "कोड ऐसे दिखते हैं: DR-… (डॉक्टर) या CT-… (केयरटेकर)। सभी विचार केवल पढ़ने के लिए हैं।",
  },
} as const;

/** Portal copy for the unlocked view (EN/HI). */
const PORTAL_TEXT = {
  en: {
    badgeSuffix: "Portal",
    readOnly: "READ-ONLY ACCESS",
    elderVitals: "Elder Vitals",
    safeZones: "Safe Zones",
    medCompliance: "Medication Compliance",
    activity: "Recent Activity",
    noActivity: "No recent activity.",
    noZones: "No safe zones configured.",
    complianceSummary: (taken: number, total: number, pct: number) =>
      `${taken} of ${total} doses taken today (${pct}% compliance)`,
    taken: "Taken",
    pending: "Pending",
    bpm: "BPM",
    steps: "steps",
    battery: "battery",
    lastSync: "Last sync",
    hrNormal: "Normal",
    hrHigh: "High",
    welcome: (name: string) => `Welcome, ${name}`,
    expires: "Access expires",
    signOut: "Sign Out",
    sosActive: "🚨 An SOS alert is ACTIVE for this elder — contact the family immediately.",
    radius: "Radius",
    denied: "Not included in your access level.",
  },
  hi: {
    badgeSuffix: "पोर्टल",
    readOnly: "केवल-पढ़ने की पहुँच",
    elderVitals: "वृद्ध के वाइटल्स",
    safeZones: "सुरक्षित क्षेत्र",
    medCompliance: "दवा अनुपालन",
    activity: "हाल की गतिविधि",
    noActivity: "कोई हाल की गतिविधि नहीं।",
    noZones: "कोई सुरक्षित क्षेत्र कॉन्फ़िगर नहीं है।",
    complianceSummary: (taken: number, total: number, pct: number) =>
      `आज ${total} में से ${taken} खुराकें ली गईं (${pct}% अनुपालन)`,
    taken: "ली गई",
    pending: "बाकी",
    bpm: "बीपीएम",
    steps: "कदम",
    battery: "बैटरी",
    lastSync: "अंतिम सिंक",
    hrNormal: "सामान्य",
    hrHigh: "उच्च",
    welcome: (name: string) => `स्वागत है, ${name}`,
    expires: "पहुँच समाप्ति",
    signOut: "साइन आउट",
    sosActive: "🚨 इस वृद्ध के लिए एक SOS अलर्ट सक्रिय है — कृपया तुरंत परिवार से संपर्क करें।",
    radius: "त्रिज्या",
    denied: "आपके एक्सेस स्तर में शामिल नहीं है।",
  },
} as const;

export default function CaretakerPortalPage() {
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [session, setSession] = useState<CaretakerSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Circle id from the stored session (defaults to the Sharma demo circle).
  const [circleId, setCircleId] = useState(ACTIVE_CIRCLE_ID);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    const s = restoreCaretakerSession();
    if (s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(s);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCircleId(s.circleId);
    }
  }, []);

  const hi = lang === "hi";
  const gt = GATE_TEXT[lang];

  const handleUnlock = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setGateError(null);
    try {
      const result = await validateCaretakerAccess(circleId, code);
      if (result.ok) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSession(result.session);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCircleId(result.session.circleId);
        setCode("");
      } else {
        const reasonText =
          result.reason === "not-found"
            ? gt.invalid
            : result.reason === "revoked"
              ? gt.revoked
              : gt.expired;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGateError(reasonText);
      }
    } finally {
      setChecking(false);
    }
  };

  if (!hydrated) {
    return <div className="min-h-dvh bg-slate-100" aria-busy="true" />;
  }

  if (!session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="flex items-start justify-between gap-2">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white"
              aria-hidden
            >
              <Stethoscope className="h-8 w-8" />
            </span>
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="flex items-center gap-1.5 rounded-full border-2 border-emerald-300 px-3 py-1.5 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50"
            >
              <Languages className="h-4 w-4" aria-hidden />
              {hi ? "English" : "हिंदी"}
            </button>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
            {gt.title}
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {gt.subtitle}
          </p>

          <label
            htmlFor="access-code"
            className="mt-6 block text-xs font-extrabold uppercase tracking-wide text-slate-500"
          >
            {gt.prompt}
          </label>
          <input
            id="access-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleUnlock();
            }}
            placeholder={gt.placeholder}
            autoComplete="off"
            className="mt-1.5 min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-lg font-black tracking-widest text-slate-800 placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
          />
          {gateError && (
            <p
              role="alert"
              className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800"
            >
              ⚠️ {gateError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={checking || !code.trim()}
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-extrabold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
          >
            <ShieldCheck className="h-5 w-5" aria-hidden />
            {checking ? gt.checking : gt.submit}
          </button>
          <p className="mt-4 text-center text-xs font-medium text-slate-400">
            {gt.hint}
          </p>
        </section>
      </main>
    );
  }

  return (
    <CaretakerPortalView
      session={session}
      lang={lang}
      onToggleLang={() => setLang(lang === "en" ? "hi" : "en")}
      onSignOut={() => {
        endCaretakerSession();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSession(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Unlocked read-only portal view
// ---------------------------------------------------------------------------

function CaretakerPortalView({
  session,
  lang,
  onToggleLang,
  onSignOut,
}: {
  session: CaretakerSession;
  lang: "en" | "hi";
  onToggleLang: () => void;
  onSignOut: () => void;
}) {
  const hi = lang === "hi";
  const pt = PORTAL_TEXT[lang];
  const meta = ROLE_META[session.role];
  const perms = ROLE_PERMISSIONS[session.role];

  const { stats } = useWearableMonitor(() => undefined);
  const [zones, setZones] = useState<SafeZone[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(DEMO_SCHEDULES);
  const [events, setEvents] = useState<CircleEvent[]>([]);
  const [sos, setSos] = useState<SosAlert | null>(null);

  // Safe zones — read-only subscription (falls back to demo zones offline).
  useEffect(() => {
    const unsubscribe = subscribeToSafeZones(
      session.circleId,
      (z) => setZones(z),
      () => undefined
    );
    return unsubscribe;
  }, [session.circleId]);

  // Medication schedules — own read-only Firestore listener (no writes here).
  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const q = query(
      collection(db, "circles", session.circleId, "schedules"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        setSchedules(
          snap.docs.map((d) => {
            const v = d.data() as DocumentData;
            const created = v.createdAt;
            const takenAt = v.takenAt;
            return {
              id: d.id,
              circleId: session.circleId,
              kind: v.kind === "appointment" ? "appointment" : "medication",
              name: (v.name as string) ?? "Reminder",
              dosage: v.dosage ? (v.dosage as string) : undefined,
              emoji: (v.emoji as string) ?? "💊",
              time: (v.time as string) ?? "08:00",
              elderName: (v.elderName as string) ?? "Mummy",
              status: v.status === "taken" ? "taken" : "pending",
              takenAt:
                takenAt instanceof Timestamp
                  ? takenAt.toMillis()
                  : typeof takenAt === "number"
                    ? takenAt
                    : null,
              createdAt:
                created instanceof Timestamp
                  ? created.toMillis()
                  : typeof created === "number"
                    ? created
                    : now,
            } satisfies ScheduleItem;
          })
        );
      },
      () => undefined
    );
    return unsubscribe;
  }, [session.circleId]);

  // Activity feed (caretaker role only — doctors don't get this section).
  useEffect(() => {
    if (!perms.viewActivity) return;
    const unsubscribe = subscribeToCircleEvents(
      session.circleId,
      (e) => setEvents(e.slice(0, 10)),
      () => undefined
    );
    return unsubscribe;
  }, [session.circleId, perms.viewActivity]);

  // Active SOS banner (read-only awareness).
  useEffect(() => {
    const unsubscribe = subscribeToActiveSos(
      session.circleId,
      (a) => setSos(a),
      () => undefined
    );
    return unsubscribe;
  }, [session.circleId]);

  const compliance = useMemo(() => {
    const meds = schedules.filter((s) => s.kind === "medication");
    const taken = meds.filter((s) => s.status === "taken").length;
    const pct = meds.length === 0 ? 100 : Math.round((taken / meds.length) * 100);
    return { meds, taken, pct, total: meds.length };
  }, [schedules]);

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(hi ? "hi-IN" : "en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl bg-slate-100 px-4 pb-10 pt-6">
      {/* Header with role badge + language + sign-out */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl ${meta.tone}`}
            aria-hidden
          >
            {meta.emoji}
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              {hi ? meta.hi : `${meta.en.split(" ")[0]} ${pt.badgeSuffix}`}
            </h1>
            <p className="text-sm font-semibold text-slate-500">
              {pt.welcome(session.visitorName)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLang}
            className="flex items-center gap-1.5 rounded-full border-2 border-emerald-300 bg-white px-3 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50"
          >
            <Languages className="h-4 w-4" aria-hidden />
            {hi ? "English" : "हिंदी"}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-1.5 rounded-full border-2 border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {pt.signOut}
          </button>
        </div>
      </header>

      {/* Read-only + expiry notice */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
          🔒 {pt.readOnly}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
          {pt.expires}{" "}
          {new Date(session.expiresAt).toLocaleDateString(
            hi ? "hi-IN" : "en-IN",
            { day: "numeric", month: "short" }
          )}
        </span>
      </div>

      {/* Active SOS awareness (read-only — visitors cannot resolve it) */}
      {sos && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm font-extrabold text-red-800"
        >
          {pt.sosActive}
        </div>
      )}

      {/* Vitals */}
      <section className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <Activity className="h-5 w-5 text-teal-600" aria-hidden />
          {pt.elderVitals}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={pt.bpm}
            value={String(stats.heartRate)}
            sub={stats.heartRate > 100 ? `⚠️ ${pt.hrHigh}` : `✅ ${pt.hrNormal}`}
            tone={stats.heartRate > 100 ? "text-rose-600" : "text-emerald-600"}
          />
          <StatCard
            label={pt.steps}
            value={stats.steps.toLocaleString()}
            tone="text-slate-900"
          />
          <StatCard
            label={pt.battery}
            value={`${stats.battery}%`}
            tone="text-slate-900"
          />
          <StatCard
            label={pt.lastSync}
            value={fmtTime(stats.lastSync)}
            tone="text-slate-900"
          />
        </div>
      </section>

      {/* Safe zones */}
      <section className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <MapPin className="h-5 w-5 text-violet-600" aria-hidden />
          {pt.safeZones}
        </h2>
        {zones.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-slate-400">
            {pt.noZones}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center gap-3 py-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-lg"
                  aria-hidden
                >
                  {z.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-slate-900">
                    {z.name}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    {pt.radius}: {z.radiusM} m
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Medication compliance */}
      <section className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <Pill className="h-5 w-5 text-rose-600" aria-hidden />
          {pt.medCompliance}
        </h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {pt.complianceSummary(compliance.taken, compliance.total, compliance.pct)}
        </p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${compliance.pct}%` }}
            role="progressbar"
            aria-valuenow={compliance.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {compliance.meds.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <span className="text-xl" aria-hidden>
                {m.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-slate-900">
                  {m.name}
                  {m.dosage ? (
                    <span className="ml-1 text-xs font-semibold text-slate-400">
                      · {m.dosage}
                    </span>
                  ) : null}
                </p>
                <p className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                  <Clock className="h-3 w-3" aria-hidden />
                  {m.time} · {m.elderName}
                </p>
              </div>
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-black ${
                  m.status === "taken"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {m.status === "taken" ? (
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                ) : null}
                {m.status === "taken" ? pt.taken : pt.pending}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Recent activity (caretaker role only) */}
      {perms.viewActivity && (
        <section className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Activity className="h-5 w-5 text-sky-600" aria-hidden />
            {pt.activity}
          </h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-slate-400">
              {pt.noActivity}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {events.map((e) => (
                <li key={e.id} className="py-2.5">
                  <p className="text-sm font-extrabold text-slate-900">
                    {e.title}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    {e.actorName} · {fmtTime(e.timestamp)}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-6 text-center text-xs font-medium text-slate-400">
        Suraksha Circle ·{" "}
        {hi ? "केवल-पढ़ने का पोर्टल" : "read-only caretaker portal"} ·{" "}
        {hi ? "डेमो डेटा" : "demo data"}
      </p>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs font-bold text-slate-500">{sub}</p>}
    </div>
  );
}



