"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  Car,
  CheckCircle2,
  Clock,
  Heart,
  HeartPulse,
  Languages,
  LifeBuoy,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Phone,
  Pill,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  Siren,
  Users,
  X,
} from "lucide-react";
import ActivityLog from "@/components/ActivityLog";
import { SosBanner } from "@/components/SosBanner";
import OfflineBanner from "@/components/OfflineBanner";
import {
  ACTIVE_CIRCLE_ID,
  pushCircleEvent,
  subscribeToCircleEvents,
  subscribeToActiveSos,
  raiseSos,
  resolveSos,
  type CircleEvent,
  type CircleEventType,
  type SosAlert,
} from "@/lib/circle-events";
import {
  analyzeMessage,
  guardShareText,
  GUARD_SAMPLES,
  type GuardResult,
} from "@/lib/message-guard";

type ViewMode = "elder" | "family";

type Member = {
  id: string;
  name: string;
  location: string;
  emoji: string;
  status: "safe" | "attention" | "travel";
  statusLabel: string;
  detail: string;
  avatarClass: string;
};

const FAMILY_MEMBERS: Member[] = [
  {
    id: "mummy",
    name: "Mummy",
    location: "Andheri West, Mumbai",
    emoji: "👩",
    status: "safe",
    statusLabel: "Safe at Home",
    detail: "Checked in 8:45 AM",
    avatarClass: "bg-rose-100 text-rose-700",
  },
  {
    id: "papa",
    name: "Papa",
    location: "Andheri Office",
    emoji: "👨",
    status: "safe",
    statusLabel: "At Work",
    detail: "Reached office at 9:20 AM",
    avatarClass: "bg-sky-100 text-sky-700",
  },
  {
    id: "grandma",
    name: "Grandma",
    location: "Pune",
    emoji: "👵",
    status: "attention",
    statusLabel: "Missed daily check-in",
    detail: "Escalation in progress — calling her phone, then yours",
    avatarClass: "bg-amber-100 text-amber-700",
  },
  {
    id: "brother",
    name: "Brother",
    location: "Mumbai → Thane",
    emoji: "👦",
    status: "travel",
    statusLabel: "Travelling",
    detail: "Share active for 20 mins · ETA 6:10 PM",
    avatarClass: "bg-violet-100 text-violet-700",
  },
];

type Contact = { name: string; relation: string; phone: string; tel: string };

const CONTACTS: Contact[] = [
  { name: "Rahul", relation: "Son · Mumbai", phone: "+91 98200 12345", tel: "tel:+919820012345" },
  { name: "Priya", relation: "Daughter · Bengaluru", phone: "+91 99870 76543", tel: "tel:+919987076543" },
  { name: "Papa", relation: "Andheri Office", phone: "+91 98200 11111", tel: "tel:+919820011111" },
  { name: "Dr. Mehta", relation: "Family Doctor", phone: "+91 98204 55555", tel: "tel:+919820455555" },
];

const MEDICAL = {
  name: "Sunita Sharma (Mummy ji)",
  age: 62,
  bloodGroup: "B+",
  allergies: ["Penicillin", "Sulfa drugs", "Peanuts"],
  conditions: ["Type 2 Diabetes", "High Blood Pressure"],
  medications: ["Metformin 500mg — after breakfast", "Amlodipine 5mg — after dinner"],
  hospital: "Lilavati Hospital, Bandra West, Mumbai",
  doctor: "Dr. Mehta — +91 98204 55555",
  insurance: "Star Health · Policy SH-4452-8890",
};

const CHECKIN_KEY = "suraksha-circle:checkin";

const SOS_SHARE_TEXT =
  "🚨 SOS EMERGENCY! Mummy needs help right now. Live location: B-402 Shanti Apartments, Andheri West, Mumbai. Please call her immediately. — Sent via Suraksha Circle";

function checkinShareText(time: string): string {
  return `✅ Mummy has checked in safely at ${time} via Suraksha Circle — she is safe at home. 🙏`;
}

const MEMBER_ROLES = ["Mom", "Dad", "Grandparent", "Sibling", "Spouse", "Other"] as const;

const AVATAR_CYCLE = [
  "bg-emerald-100 text-emerald-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
] as const;

const ELDER_TEXT = {
  en: {
    langBtn: "हिंदी में देखें",
    statusTitle: "You are SAFE ✅",
    statusNote: "B-402 Shanti Apartments, Andheri West, Mumbai — family can see you are okay",
    statusLocal: "आप सुरक्षित हैं 🙏 · Aap poora surakshit hain",
    lastCheckIn: "Last check-in:",
    autoAlerts: "🔔 Auto-alerts ON",
    locationOn: "📍 Location ON",
    checkTitle: "✅ I’M OKAY",
    checkSub: "Daily Check-in — one tap and your family is notified",
    checkDoneTitle: "YOU ARE CHECKED IN ✓",
    callTitle: "📞 CALL FAMILY",
    callSub: "Rahul · Priya · Papa — one tap dial",
    sosTitle: "🚨 SOS EMERGENCY",
    sosSub: "Alert everyone + share live location",
    healthCard: "My Health Card",
    scamCheck: "Check a Message",
  },
  hi: {
    langBtn: "View in English",
    statusTitle: "आप सुरक्षित हैं ✅",
    statusNote: "B-402 शांती अपार्टमेंट्स, अंधेरी पश्चिम, मुंबई — परिवार देख सकता है कि आप ठीक हैं",
    statusLocal: "You are safe 🙏 · Family ko dikhta hai",
    lastCheckIn: "आख़िरी चेक-इन:",
    autoAlerts: "🔔 ऑटो-अलर्ट चालू",
    locationOn: "📍 लोकेशन चालू",
    checkTitle: "✅ मैं ठीक हूँ (दैनिक चेक-इन)",
    checkSub: "एक टैप में परिवार को सूचना मिल जाएगी",
    checkDoneTitle: "आपने चेक-इन कर लिया ✓",
    callTitle: "📞 परिवार को कॉल करें",
    callSub: "राहुल · प्रिया · पापा — एक टैप में कॉल",
    sosTitle: "🚨 आपातकालीन SOS",
    sosSub: "सभी को अलर्ट + लाइव लोकेशन शेयर",
    healthCard: "मेरा स्वास्थ्य कार्ड",
    scamCheck: "संदेश की जाँच करें (स्कैम गार्ड)",
  },
} as const;

const GUARD_STYLES = {
  safe: {
    emoji: "✅",
    box: "border-emerald-300 bg-emerald-50",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  moderate: {
    emoji: "⚠️",
    box: "border-amber-300 bg-amber-50",
    text: "text-amber-700",
    bar: "bg-amber-500",
  },
  high: {
    emoji: "🚨",
    box: "border-red-300 bg-red-50",
    text: "text-red-700",
    bar: "bg-red-500",
  },
} as const;

function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  dismissable = true,
  tone = "slate",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  dismissable?: boolean;
  tone?: "slate" | "red";
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-slate-950/60 backdrop-blur-sm ${dismissable ? "cursor-pointer" : ""}`}
        onClick={() => dismissable && onClose()}
      />
      <div
        className={`relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:max-w-md sm:rounded-3xl ${
          tone === "red" ? "bg-red-50" : "bg-white"
        }`}
      >
        <div
          className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${
            tone === "red" ? "border-red-200 bg-red-600" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5 text-lg font-extrabold">
            {icon}
            <span className={tone === "red" ? "text-white" : "text-slate-900"}>{title}</span>
          </div>
          {dismissable && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-slate-600 transition hover:bg-black/10 active:scale-90"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [view, setView] = useState<ViewMode>("elder");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [members, setMembers] = useState<Member[]>(FAMILY_MEMBERS);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState("8:45 AM");
  const [sosOpen, setSosOpen] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [sosSent, setSosSent] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [medicalOpen, setMedicalOpen] = useState(false);
  const [scamOpen, setScamOpen] = useState(false);
  const [scamText, setScamText] = useState("");
  const [guardScanning, setGuardScanning] = useState(false);
  const [guardResult, setGuardResult] = useState<GuardResult | null>(null);
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<(typeof MEMBER_ROLES)[number]>("Mom");
  const [newCity, setNewCity] = useState("");
  const [events, setEvents] = useState<CircleEvent[]>([]);
  const [sosAlert, setSosAlert] = useState<SosAlert | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("Good morning");
  const [dateStr, setDateStr] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Intentional client-only init: server render can't know local time.
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
     
    setDateStr(
      new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    );
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Restore persisted check-in state (syncs Elder Mode and Family Dashboard)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKIN_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { checkedIn: boolean; time: string; ts: number };
      if (parsed.checkedIn) {
        // Intentional client-only init: localStorage is unavailable during SSR.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCheckedIn(true);
         
        setCheckInTime(parsed.time);
        setMembers((ms) =>
          ms.map((m) => (m.id === "mummy" ? { ...m, detail: `Checked in ${parsed.time}` } : m))
        );
      }
    } catch {
      // corrupted storage — ignore and fall back to demo defaults
    }
  }, []);

  // Live activity feed from Firestore (filtered by the active Circle ID),
  // newest first; falls back to demo events when Firebase isn't configured.
  useEffect(() => {
    const unsubscribe = subscribeToCircleEvents(
      ACTIVE_CIRCLE_ID,
      (feed) => setEvents(feed),
      () => showToast("⚠️ Live feed unavailable — showing demo activity")
    );
    return unsubscribe;
  }, []);

  // Real-time active SOS listener for the circle
  useEffect(() => {
    const unsubscribe = subscribeToActiveSos(
      ACTIVE_CIRCLE_ID,
      setSosAlert,
      (err) => {
        console.warn("[Suraksha Circle] SOS listener error:", err);
        setSosAlert(null);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!sosOpen || sosSent || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [sosOpen, sosSent, countdown]);

  useEffect(() => {
    if (sosOpen && !sosSent && countdown === 0) sendSos();
    // sendSos is stable for the lifetime of this screen (reads only state);
    // re-running on its identity would double-fire the emergency alert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sosOpen, sosSent, countdown]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function openSos() {
    setSosSent(false);
    setCountdown(10);
    setSosOpen(true);
  }

  function closeSos() {
    if (sosSent) {
      logEvent("sos-resolved", "Mummy", "SOS alert resolved", "Marked safe — alert closed by user");
    }
    setSosOpen(false);
    setSosSent(false);
  }

  function handleCheckIn() {
    if (checkedIn) return;
    const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    setCheckedIn(true);
    setCheckInTime(time);
    setMembers((ms) => ms.map((m) => (m.id === "mummy" ? { ...m, detail: "Checked in just now" } : m)));
    try {
      window.localStorage.setItem(
        CHECKIN_KEY,
        JSON.stringify({ checkedIn: true, time, ts: Date.now() })
      );
    } catch {
      // storage unavailable (private mode) — check-in still works for this session
    }
    logEvent("checkin", "Mummy", "Daily check-in", "Safe at Home, Andheri West");
    showToast("💚 Check-in recorded — family notified");
  }

  function remindCheckIn() {
    setMembers((ms) =>
      ms.map((m) =>
        m.id === "grandma" ? { ...m, detail: "Reminder sent just now — waiting for check-in" } : m
      )
    );
    showToast("📱 Reminder sent to Grandma (Pune)");
  }

  function triggerCascade() {
    setCascadeOpen(false);
    logEvent("cascade", "Rahul", "Family emergency cascade triggered", "All members alerted with live location");
    showToast("🚨 Emergency cascade sent to all 4 members");
  }

  /** Logs a circle event to Firestore (when configured) and renders it instantly. */
  function logEvent(
    type: CircleEventType,
    actorName: string,
    title: string,
    detail?: string,
    active = false
  ) {
    pushCircleEvent({ circleId: ACTIVE_CIRCLE_ID, type, actorName, title, detail, active }).then(
      (e) => setEvents((prev) => [e, ...prev])
    );
  }

  function sendSos() {
    setSosSent(true);
    logEvent("sos", "Mummy", "🚨 SOS alert triggered", "Live location shared with circle", true);
    // Firestore-based: write real sos_events doc so the banner appears for everyone in the circle
    raiseSos(ACTIVE_CIRCLE_ID, "user-0", "Mummy", "Live location shared with circle").then(
      (alert) => setSosAlert(alert)
    );
  }

  const isRaisedByMe = sosAlert !== null;

  async function acknowledgeSos() {
    const text =
      "🚨 SOS EMERGENCY! " +
      (sosAlert?.raisedByName ?? "Family member") +
      " needs help right now. Live location: B-402 Shanti Apartments, Andheri West, Mumbai. Please call immediately. — Sent via Suraksha Circle";
    await handleShare(text);
  }

  async function resolveSosAlert() {
    if (!sosAlert) return;
    await resolveSos(sosAlert, "Mummy");
    setSosAlert(null);
    logEvent("sos-resolved", "Mummy", "SOS alert resolved", "Marked safe — alert resolved by user");
    showToast("✅ SOS alert resolved — you are safe");
  }

  // Native Web Share API with wa.me fallback
  async function handleShare(text: string) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Suraksha Circle", text });
        showToast("📤 Shared with your family");
      } catch {
        // user cancelled the native sheet — nothing to do
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    showToast("💬 Opening WhatsApp to share…");
  }

  function runGuardCheck() {
    if (!scamText.trim()) return;
    setGuardScanning(true);
    setGuardResult(null);
    window.setTimeout(() => {
      setGuardResult(analyzeMessage(scamText));
      setGuardScanning(false);
    }, 700);
  }

  function handleAddMember() {
    const name = newName.trim();
    if (!name) return;
    const city = newCity.trim() || "India";
    setMembers((ms) => [
      ...ms,
      {
        id: `member-${Date.now()}`,
        name,
        location: city,
        emoji: "🧑",
        status: "safe",
        statusLabel: "Safe",
        detail: `Added just now · ${newRole} · awaiting first check-in`,
        avatarClass: AVATAR_CYCLE[ms.length % AVATAR_CYCLE.length],
      },
    ]);
    logEvent("member-added", name, "Added to the circle", `${newRole} · ${city} · status: Safe`);
    setAddOpen(false);
    setNewName("");
    setNewRole("Mom");
    setNewCity("");
    showToast(`✅ ${name} added to your Suraksha Circle`);
  }

  const attention = members.filter((m) => m.status === "attention").length;
  const travel = members.filter((m) => m.status === "travel").length;
  const safe = members.length - attention - travel;
  const isElder = view === "elder";
  const t = ELDER_TEXT[lang];

  return (
    <div
      className={`min-h-dvh pb-10 text-slate-900 transition-colors ${
        isElder ? "bg-gradient-to-b from-rose-50 via-white to-emerald-50" : "bg-slate-50"
      }`}
    >
      {/* ===== Top Navbar ===== */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="truncate text-sm font-extrabold leading-tight tracking-tight sm:text-base">
              Suraksha Circle <span className="text-slate-400">|</span>{" "}
              <span className="text-slate-500">FamilyOS India</span>
            </h1>
          </div>
          <button
            onClick={() => setView(isElder ? "family" : "elder")}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-95"
          >
            {isElder ? (
              <Users className="h-4 w-4" aria-hidden />
            ) : (
              <Heart className="h-4 w-4 text-rose-500" aria-hidden />
            )}
            <span className="max-w-[7.5rem] truncate sm:max-w-none">
              {isElder ? "Switch to Family Dashboard" : "Switch to Elder Mode"}
            </span>
          </button>
        </div>
      </header>

      {/* ===== Toast ===== */}
      {toast && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl bg-slate-900 px-5 py-3 text-center text-sm font-bold text-white shadow-2xl">
            {toast}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-lg px-4 pt-6">
        {/* ===== Offline status banner (global connection tracking) ===== */}
        <OfflineBanner elder={isElder} />
        {/* ===== Real-time SOS Emergency Banner ===== */}
        <SosBanner
          alert={sosAlert}
          onAcknowledge={acknowledgeSos}
          onResolve={resolveSosAlert}
          isRaisedByMe={isRaisedByMe}
          elder={isElder}
        />
        {isElder ? (
          /* ===== ELDER MODE ===== */
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-slate-500">{dateStr}</p>
              <button
                onClick={() => setLang(lang === "en" ? "hi" : "en")}
                className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-emerald-300 bg-white px-4 py-2 text-sm font-extrabold text-emerald-700 shadow-sm transition hover:bg-emerald-50 active:scale-95"
                aria-label={lang === "en" ? "Switch to Hindi" : "Switch to English"}
              >
                <Languages className="h-4 w-4" aria-hidden />
                {t.langBtn}
              </button>
            </div>
            <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900">
              {lang === "hi" ? "नमस्ते" : greeting},{" "}
              <span className="text-rose-500">Mummy ji</span> <span aria-hidden>❤️</span>
            </h2>

            {/* Large localized safety status */}
            <section aria-live="polite" className="rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md">
                  <ShieldCheck className="h-8 w-8" aria-hidden />
                  {checkedIn && (
                    <span className="absolute -right-1 -top-1 h-4 w-4 animate-ping rounded-full bg-emerald-400" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-extrabold text-emerald-800">{t.statusTitle}</p>
                  <p className="mt-1 flex items-start gap-1 text-sm font-semibold leading-snug text-emerald-700 sm:text-base">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    {t.statusNote}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm">
                  <Clock className="h-4 w-4 text-slate-400" aria-hidden /> {t.lastCheckIn}{" "}
                  {checkedIn ? `Today ${checkInTime}` : "8:45 AM"}
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm">
                  {t.autoAlerts}
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm">
                  {t.locationOn}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-emerald-700">{t.statusLocal}</p>
            </section>

            {/* One-tap daily check-in */}
            <button
              onClick={handleCheckIn}
              disabled={checkedIn}
              className={`relative flex min-h-32 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-3xl text-white shadow-lg transition active:scale-[0.98] ${
                checkedIn ? "bg-emerald-600" : "bg-green-500 hover:bg-green-600"
              }`}
              aria-label="Daily check-in"
            >
              {checkedIn && (
                <span className="absolute inset-0 animate-ping rounded-3xl bg-emerald-400 opacity-25" aria-hidden />
              )}
              <CheckCircle2 className="relative h-12 w-12" aria-hidden />
              <span className="relative text-3xl font-extrabold">
                {checkedIn ? t.checkDoneTitle : t.checkTitle}
              </span>
              <span className="relative px-4 text-center text-sm font-semibold opacity-90">
                {checkedIn
                  ? lang === "hi"
                    ? `दैनिक चेक-इन ${checkInTime} बजे पूरा हुआ — परिवार को सूचित किया गया`
                    : `Daily check-in done at ${checkInTime} — family notified`
                  : t.checkSub}
              </span>
            </button>

            {/* Call family */}
            <button
              onClick={() => setCallOpen(true)}
              className="flex min-h-24 w-full items-center gap-4 rounded-3xl bg-sky-500 px-6 text-left text-white shadow-lg transition hover:bg-sky-600 active:scale-[0.98]"
              aria-label="Call family"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                <Phone className="h-8 w-8" aria-hidden />
              </span>
              <span>
                <span className="block text-3xl font-extrabold">{t.callTitle}</span>
                <span className="text-sm font-semibold opacity-90">{t.callSub}</span>
              </span>
            </button>

            {/* SOS emergency */}
            <button
              onClick={openSos}
              className="flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-3xl bg-red-600 text-white shadow-xl transition hover:bg-red-700 active:scale-[0.98]"
              aria-label="SOS emergency"
            >
              <Siren className="h-12 w-12 animate-pulse" aria-hidden />
              <span className="text-3xl font-extrabold">{t.sosTitle}</span>
              <span className="text-sm font-semibold opacity-90">{t.sosSub}</span>
            </button>

            {/* Quick cards */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMedicalOpen(true)}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-teal-200 bg-white p-3 text-center shadow-sm transition hover:border-teal-400 active:scale-[0.98]"
              >
                <HeartPulse className="h-8 w-8 text-teal-600" aria-hidden />
                <span className="text-base font-extrabold text-slate-800">{t.healthCard}</span>
              </button>
              <button
                onClick={() => setScamOpen(true)}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-violet-200 bg-white p-3 text-center shadow-sm transition hover:border-violet-400 active:scale-[0.98]"
              >
                <MessageSquareWarning className="h-8 w-8 text-violet-600" aria-hidden />
                <span className="text-base font-extrabold text-slate-800">{t.scamCheck}</span>
              </button>
            </div>

            {/* Activity log (Elder Mode: high contrast, large targets) */}
            <button
              onClick={() => setLogOpen((o) => !o)}
              aria-expanded={logOpen}
              className="flex min-h-20 w-full items-center gap-3 rounded-3xl border-2 border-slate-200 bg-white px-5 text-left shadow-sm transition hover:border-slate-400 active:scale-[0.98]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl" aria-hidden>
                📜
              </span>
              <span className="text-xl font-extrabold text-slate-800">
                {lang === "hi" ? "गतिविधि लॉग देखें" : "View Activity Log"}
              </span>
            </button>
            {logOpen && <ActivityLog events={events} circleId={ACTIVE_CIRCLE_ID} elder lang={lang} />}

            <p className="pt-2 text-center text-xs font-medium text-slate-400">
              Suraksha Circle MVP · demo data only
            </p>
          </div>
        ) : (
          /* ===== FAMILY DASHBOARD ===== */
          <div className="space-y-4">
            <p className="text-base font-semibold text-slate-500">{dateStr}</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Hi Rahul 👋 <span className="text-slate-400">·</span>{" "}
              <span className="text-slate-600">Family Dashboard</span>
            </h2>

            {/* Summary bar */}
            <section
              className={`rounded-3xl p-5 text-white shadow-lg ${
                attention > 0
                  ? "bg-gradient-to-br from-amber-500 to-orange-600"
                  : "bg-gradient-to-br from-emerald-500 to-teal-600"
              }`}
            >
              <p className="flex items-center gap-2 text-3xl font-extrabold">
                {attention > 0 ? (
                  <AlertTriangle className="h-8 w-8" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-8 w-8" aria-hidden />
                )}
                {attention > 0 ? `${safe} of ${members.length} safe` : "All members safe"}
              </p>
              <p className="mt-1 text-sm font-semibold opacity-90 sm:text-base">
                Circle: {safe} safe · {travel} travelling · {attention} needs attention
              </p>
              <button
                onClick={() => handleShare(checkinShareText(checkInTime))}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/20 text-sm font-extrabold text-white shadow-sm transition hover:bg-white/30 active:scale-[0.98]"
              >
                <Share2 className="h-5 w-5" aria-hidden /> Share via WhatsApp / SMS
              </button>
            </section>

            {/* Family members list */}
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-lg font-extrabold text-slate-900">Family Members</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddOpen(true)}
                    className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Add Member
                  </button>
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden /> LIVE
                  </span>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-slate-100">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className={`flex items-start gap-3 py-4 ${
                      m.status === "attention" ? "-mx-2 rounded-2xl bg-amber-50/80 px-2" : ""
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${m.avatarClass}`}
                      aria-hidden
                    >
                      {m.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <p className="text-base font-extrabold text-slate-900">
                          {m.name}{" "}
                          <span className="text-sm font-semibold text-slate-400">({m.location})</span>
                        </p>
                        <span
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                            m.status === "safe"
                              ? "bg-emerald-100 text-emerald-700"
                              : m.status === "attention"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {m.status === "safe" ? "🟢" : m.status === "attention" ? "⚠️" : "🚗"}{" "}
                          {m.statusLabel}
                        </span>
                      </div>
                      <p
                        className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${
                          m.status === "attention" ? "text-amber-700" : "text-slate-500"
                        }`}
                      >
                        {m.status === "attention" && (
                          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden />
                        )}
                        {m.status === "travel" && <Car className="h-4 w-4 shrink-0" aria-hidden />}
                        {m.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Quick actions */}
            <section>
              <h3 className="px-1 pb-2 text-lg font-extrabold text-slate-900">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={remindCheckIn}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 text-left shadow-sm transition hover:border-amber-400 active:scale-[0.98]"
                >
                  <BellRing className="h-6 w-6 shrink-0 text-amber-600" aria-hidden />
                  <span className="text-base font-extrabold text-amber-900">
                    Send Safety Check-in Reminder
                  </span>
                </button>
                <button
                  onClick={() => setCascadeOpen(true)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-red-600 px-4 text-left text-white shadow-md transition hover:bg-red-700 active:scale-[0.98]"
                >
                  <Siren className="h-6 w-6 shrink-0" aria-hidden />
                  <span className="text-base font-extrabold">Trigger Family Emergency Cascade</span>
                </button>
                <button
                  onClick={() => setMedicalOpen(true)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-teal-200 bg-teal-50 px-4 text-left shadow-sm transition hover:border-teal-400 active:scale-[0.98]"
                >
                  <HeartPulse className="h-6 w-6 shrink-0 text-teal-700" aria-hidden />
                  <span className="text-base font-extrabold text-teal-900">
                    View Medical Emergency Card
                  </span>
                </button>
              </div>
            </section>

            {/* Scam protection */}
            <section className="rounded-3xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">
                  <MessageSquareWarning className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-extrabold text-violet-900">Scam Protection</h3>
                  <p className="mt-0.5 text-sm font-semibold text-violet-700">
                    Forward a suspicious WhatsApp/SMS message to check for safety — before anyone
                    clicks or pays.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setScamOpen(true)}
                className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 font-extrabold text-white shadow transition hover:bg-violet-700 active:scale-[0.98]"
              >
                <Send className="h-5 w-5" aria-hidden /> Check a Message Now
              </button>
            </section>

            {/* Activity & History Log */}
            <ActivityLog events={events} circleId={ACTIVE_CIRCLE_ID} />

            <p className="pb-2 text-center text-xs font-medium text-slate-400">
              Suraksha Circle MVP · demo data only
            </p>
          </div>
        )}
      </main>

      {/* ===== Modals ===== */}
      <Modal
        open={sosOpen}
        onClose={closeSos}
        title={sosSent ? "SOS ALERT SENT" : "Emergency SOS"}
        dismissable={!sosSent}
        tone="red"
        icon={<Siren className={`h-6 w-6 ${sosSent ? "" : "animate-pulse"}`} aria-hidden />}
      >
        {!sosSent ? (
          <div className="text-center">
            <p className="font-semibold text-red-800">
              Alert will be sent to all 4 family members with live location in:
            </p>
            <div className="relative mx-auto mt-4 flex h-28 w-28 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" aria-hidden />
              <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-600 text-5xl font-black text-white shadow-xl">
                {countdown}
              </span>
            </div>
            <ul className="mt-5 space-y-2 text-left text-sm font-semibold text-slate-700">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-red-600" aria-hidden /> Auto-call Rahul → Priya → Papa
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-600" aria-hidden /> Share live location with circle
              </li>
              <li className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-red-600" aria-hidden /> Loud siren on every family phone
              </li>
            </ul>
            <button
              onClick={sendSos}
              className="mt-5 min-h-14 w-full rounded-2xl bg-red-600 font-extrabold text-white shadow-lg transition hover:bg-red-700 active:scale-[0.98]"
            >
              SEND NOW IMMEDIATELY
            </button>
            <button
              onClick={closeSos}
              className="mt-3 min-h-14 w-full rounded-2xl border-2 border-slate-300 bg-white font-extrabold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
            >
              I’M FINE — CANCEL SOS
            </button>
          </div>
        ) : (
          <div className="text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
              <LifeBuoy className="h-8 w-8 animate-pulse" aria-hidden />
            </span>
            <p className="mt-3 text-2xl font-black text-red-700">🚨 EMERGENCY ALERT SENT</p>
            <ul className="mt-4 space-y-2 text-left text-sm font-semibold text-slate-700">
              <li>✅ Rahul notified — phone ringing</li>
              <li>✅ Priya notified — SMS + call</li>
              <li>✅ Papa notified — phone ringing</li>
              <li>✅ Grandma (Pune) notified — SMS</li>
              <li>📍 Live location shared: Andheri West, Mumbai</li>
            </ul>
            <button
              onClick={() => handleShare(SOS_SHARE_TEXT)}
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-300 bg-white font-extrabold text-red-700 shadow-sm transition hover:bg-red-50 active:scale-[0.98]"
            >
              <Share2 className="h-5 w-5" aria-hidden /> Share via WhatsApp / SMS
            </button>
            <a
              href="tel:112"
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 font-extrabold text-white shadow-lg transition hover:bg-red-700"
            >
              <Phone className="h-5 w-5" aria-hidden /> Call Emergency 112
            </a>
            <button
              onClick={closeSos}
              className="mt-3 min-h-12 w-full rounded-2xl border-2 border-slate-300 bg-white font-bold text-slate-600 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        title="Call Family"
        icon={<Phone className="h-6 w-6 text-sky-600" aria-hidden />}
      >
        <ul className="space-y-3">
          {CONTACTS.map((c) => (
            <li key={c.name}>
              <a
                href={c.tel}
                onClick={() => showToast(`📞 Calling ${c.name}…`)}
                className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98]"
              >
                <span>
                  <span className="block text-base font-extrabold text-slate-900">{c.name}</span>
                  <span className="text-sm font-semibold text-slate-500">{c.relation}</span>
                </span>
                <span className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white">
                  <Phone className="h-4 w-4" aria-hidden /> Call
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={medicalOpen}
        onClose={() => setMedicalOpen(false)}
        title="Medical Emergency Card"
        icon={<HeartPulse className="h-6 w-6 text-teal-600" aria-hidden />}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-teal-50 p-4">
            <p className="text-base font-extrabold text-slate-900">{MEDICAL.name}</p>
            <p className="text-sm font-semibold text-slate-500">
              Age {MEDICAL.age} · Andheri West, Mumbai
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-xl font-black text-white">
              {MEDICAL.bloodGroup}
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Blood Group</p>
              <p className="text-sm font-semibold text-slate-600">
                Show this card at the hospital reception
              </p>
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wide text-slate-500">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden /> Allergies
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MEDICAL.allergies.map((a) => (
                <span key={a} className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
                  {a}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide text-slate-500">Conditions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MEDICAL.conditions.map((c) => (
                <span key={c} className="rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-800">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wide text-slate-500">
              <Pill className="h-4 w-4 text-teal-600" aria-hidden /> Current Medications
            </p>
            <ul className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
              {MEDICAL.medications.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            <p>
              🏥 Preferred hospital:{" "}
              <span className="font-extrabold text-slate-900">{MEDICAL.hospital}</span>
            </p>
            <p className="mt-1">🩺 {MEDICAL.doctor}</p>
            <p className="mt-1">💳 Insurance: {MEDICAL.insurance}</p>
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
              Emergency Contacts
            </p>
            <ul className="mt-2 space-y-2">
              {CONTACTS.map((c) => (
                <li key={c.name}>
                  <a
                    href={c.tel}
                    className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    <span>
                      {c.name} · {c.relation}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-700">
                      <Phone className="h-4 w-4" aria-hidden />
                      {c.phone}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>

      <Modal
        open={scamOpen}
        onClose={() => {
          setScamOpen(false);
          setScamText("");
          setGuardResult(null);
          setGuardScanning(false);
        }}
        title="Message Guard 🛡️"
        icon={<ShieldCheck className="h-6 w-6 text-violet-600" aria-hidden />}
      >
        <p className="text-sm font-semibold text-slate-500">
          {lang === "hi"
            ? "कोई भी संदिग्ध WhatsApp/SMS संदेश यहाँ पेस्ट करें — हम आपके लिए जाँच करेंगे।"
            : "Paste or forward any suspicious WhatsApp/SMS message here — we will check it for you."}
        </p>
        <textarea
          value={scamText}
          onChange={(e) => setScamText(e.target.value)}
          rows={5}
          placeholder={
            lang === "hi" ? "संदेश यहाँ पेस्ट करें…" : "Paste the suspicious message here…"
          }
          className="mt-3 w-full rounded-2xl border-2 border-violet-200 bg-violet-50/50 p-3 text-base font-medium text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {GUARD_SAMPLES.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setScamText(s);
                setGuardResult(null);
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-violet-400 hover:text-violet-700"
            >
              {lang === "hi" ? `नमूना ${i + 1}` : `Try sample ${i + 1}`}
            </button>
          ))}
        </div>
        <button
          onClick={runGuardCheck}
          disabled={!scamText.trim() || guardScanning}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 font-extrabold text-white shadow transition hover:bg-violet-700 active:scale-[0.98] disabled:opacity-40"
        >
          {guardScanning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              {lang === "hi" ? "जाँच हो रही है…" : "Checking message…"}
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" aria-hidden />
              {lang === "hi" ? "संदेश की जाँच करें" : "Check Message Safety"}
            </>
          )}
        </button>

        {guardResult && (
          <div
            className={`mt-4 rounded-2xl border-2 p-4 ${GUARD_STYLES[guardResult.level].box}`}
          >
            <p
              className={`text-xl font-black ${GUARD_STYLES[guardResult.level].text}`}
            >
              {GUARD_STYLES[guardResult.level].emoji} {guardResult.headline[lang]}
            </p>

            {/* Risk score meter */}
            <div
              className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200"
              role="img"
              aria-label={`Risk score ${guardResult.score} of 100`}
            >
              <div
                className={`h-full rounded-full transition-all ${GUARD_STYLES[guardResult.level].bar}`}
                style={{ width: `${Math.max(8, guardResult.score)}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400">
              {lang === "hi" ? "जोखिम स्कोर" : "Risk score"}: {guardResult.score}/100
            </p>

            <p className="mt-3 text-base font-bold leading-snug text-slate-800">
              {guardResult.reassurance[lang]}
            </p>

            {guardResult.flags.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm font-semibold text-slate-700">
                {guardResult.flags.map((f) => (
                  <li key={f.code} className="flex items-start gap-1.5">
                    <span aria-hidden>⚠️</span>
                    <span>{lang === "hi" ? f.labelHi : f.label}</span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="mt-3 space-y-1.5 rounded-xl bg-white/70 p-3 text-sm font-semibold text-slate-600">
              {guardResult.advice.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span aria-hidden>👉</span>
                  <span>{a[lang]}</span>
                </li>
              ))}
            </ul>

            {/* Ask Family — share flagged message into the circle chat */}
            <button
              onClick={() => handleShare(guardShareText(guardResult, scamText))}
              className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-extrabold text-white shadow-lg transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              <Users className="h-5 w-5" aria-hidden />
              {lang === "hi" ? "परिवार से पूछें" : "Ask Family"}
            </button>
            <p className="mt-1.5 text-center text-xs font-semibold text-slate-400">
              {lang === "hi"
                ? "यह संदेश परिवार सर्कल चैट में भेजा जाएगा — कोई न कोई तुरंत मदद करेगा।"
                : "Sends the flagged message to your family circle chat for a second opinion."}
            </p>

            {guardResult.level === "high" && (
              <a
                href="tel:1930"
                className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 font-extrabold text-white transition hover:bg-red-700"
              >
                <Phone className="h-4 w-4" aria-hidden />
                {lang === "hi" ? "साइबर हेल्पलाइन 1930 पर रिपोर्ट करें" : "Report to Cyber Helpline 1930"}
              </a>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={cascadeOpen}
        onClose={() => setCascadeOpen(false)}
        title="Emergency Cascade"
        tone="red"
        icon={<Siren className="h-6 w-6 animate-pulse" aria-hidden />}
      >
        <p className="text-sm font-semibold text-slate-700">
          This will immediately alert the entire circle with Mummy ji’s live location:
        </p>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
          <li>📞 Call &amp; notify all 4 members</li>
          <li>📍 Share Mummy ji’s live location</li>
          <li>🔔 Loud siren on every phone</li>
        </ul>
        <button
          onClick={triggerCascade}
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 font-extrabold text-white shadow-lg transition hover:bg-red-700 active:scale-[0.98]"
        >
          <Send className="h-5 w-5" aria-hidden /> Yes, alert everyone now
        </button>
        <button
          onClick={() => setCascadeOpen(false)}
          className="mt-3 min-h-12 w-full rounded-2xl border-2 border-slate-300 bg-white font-bold text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Family Member"
        icon={<Users className="h-6 w-6 text-emerald-600" aria-hidden />}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="member-name" className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
              Name
            </label>
            <input
              id="member-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Chachu, Tai ji…"
              className="mt-1.5 min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="member-role" className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
              Role / Relationship
            </label>
            <select
              id="member-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as (typeof MEMBER_ROLES)[number])}
              className="mt-1.5 min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-base font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
            >
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="member-city" className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
              City
            </label>
            <input
              id="member-city"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              placeholder="e.g. Jaipur"
              className="mt-1.5 min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddMember}
            disabled={!newName.trim()}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-extrabold text-white shadow-lg transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-40"
          >
            <Plus className="h-5 w-5" aria-hidden /> Add to Circle
          </button>
          <p className="text-center text-xs font-medium text-slate-400">
            New members start with a 🟢 Safe status and appear instantly on the dashboard.
          </p>
        </div>
      </Modal>
    </div>
  );
}



