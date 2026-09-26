"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import ActivityLog from "@/components/ActivityLog";
import ActivityLogCard from "@/components/ActivityLogCard";
import { SosBanner } from "@/components/SosBanner";
import OfflineBanner from "@/components/OfflineBanner";
import CircleSwitcher from "@/components/CircleSwitcher";
import SafeZonesCard from "@/components/SafeZonesCard";
import VoiceAssistantButton from "@/components/VoiceAssistantButton";
import WearableMonitorCard from "@/components/WearableMonitorCard";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import CaretakerAccessManager from "@/components/CaretakerAccessManager";
import { subscribeToForegroundPush } from "@/lib/push-notifications";
import type { WearableAlert } from "@/lib/wearable-monitor";
import {
  addSafeZone,
  removeSafeZone,
  subscribeToSafeZones,
  useGeofenceWatcher,
  type SafeZone,
} from "@/lib/safe-zones";
import {
  loadJoinedCircles,
  saveJoinedCircles,
  type JoinedCircle,
} from "@/lib/circle-manager";
import { onAuthState } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  addInvitedMember,
  isCircleMember,
  joinCircleByInviteCode,
  listMemberCircles,
  markMemberCheckIn,
  setActiveCircleIdForUser,
  setMemberStatus,
  subscribeToCircleInvites,
  subscribeToCircleMembers,
  getUserCircleId,
  type CircleInvite,
  type CircleMember,
} from "@/lib/circle-membership";
import {
  pushCircleEvent,
  subscribeToCircleEvents,
  subscribeToActiveSos,
  raiseSos,
  resolveSos,
  type CircleEvent,
  type CircleEventType,
  type SosAlert,
} from "@/lib/circle-events";
import { type VoiceResult } from "@/lib/voice-assistant";
import {
  analyzeMessage,
  guardShareText,
  GUARD_SAMPLES,
  type GuardResult,
} from "@/lib/message-guard";
import { logActivity, subscribeToActivityLogs, isCheckInOverdue, DEMO_LAST_CHECKIN_BY_MEMBER, type ActivityLog as ActivityLogEntry } from "@/lib/activity-log";
import { reportSyncError, reportSyncOk } from "@/lib/connectivity";

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
  /** Epoch ms of the member's last check-in (drives overdue detection). */
  lastCheckInMs: number;
  /** Epoch ms when the coordinator last sent a nudge (null = never). */
  lastNudgedMs: number | null;
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
    lastCheckInMs: DEMO_LAST_CHECKIN_BY_MEMBER.mummy,
    lastNudgedMs: null,
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
    lastCheckInMs: DEMO_LAST_CHECKIN_BY_MEMBER.papa,
    lastNudgedMs: null,
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
    lastCheckInMs: DEMO_LAST_CHECKIN_BY_MEMBER.grandma,
    lastNudgedMs: null,
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
    lastCheckInMs: DEMO_LAST_CHECKIN_BY_MEMBER.brother,
    lastNudgedMs: null,
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

/** Last-known location used in alert copy until device GPS lands. */
const SOS_LOCATION_FALLBACK = "B-402 Shanti Apartments, Andheri West, Mumbai";

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

/** Demo-mode identity, used only when Firebase isn't configured. */
const DEMO_MY_ID = "mummy";
const DEMO_MY_NAME = "Mummy";

/** Avatar art for members that have a real account. */
const MEMBER_EMOJI_CYCLE = ["🧑", "👩", "👨", "👵", "👦"] as const;

/** Nudge markers, persisted per circle so "Nudged ✓" survives a reload. */
const NUDGE_KEY = "suraksha-circle:nudges";

function loadNudgeMap(): Record<string, Record<string, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NUDGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rememberNudge(circleId: string, memberId: string, ms: number): void {
  if (typeof window === "undefined" || !circleId) return;
  try {
    const all = loadNudgeMap();
    all[circleId] = { ...(all[circleId] ?? {}), [memberId]: ms };
    window.localStorage.setItem(NUDGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable — this session still shows the nudge marker
  }
}

/** Formats an epoch-ms timestamp as "8:45 am". */
function formatCheckInTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** True when the timestamp falls on today's date. */
function isToday(ms: number): boolean {
  const then = new Date(ms);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

/**
 * Firestore members-map entry → dashboard row. Status is derived from the
 * stored check-in timestamp (safe only for 20h after a real check-in), so no
 * device can claim safety without a persisted check-in.
 */
function memberFromRecord(record: CircleMember, index: number): Member {
  const avatarClass = AVATAR_CYCLE[index % AVATAR_CYCLE.length];
  if (record.invited) {
    return {
      id: record.uid,
      name: record.name,
      location: record.city || "Invite pending",
      emoji: "✉️",
      status: "safe",
      statusLabel: "Invite pending",
      detail: [record.role, record.city].filter(Boolean).join(" · ") || "Waiting for them to join",
      avatarClass,
      lastCheckInMs: Date.now(), // pending invites are never "overdue"
      lastNudgedMs: null,
    };
  }
  const checkInMs = record.lastCheckInMs;
  const overdue = checkInMs === null || isCheckInOverdue(checkInMs);
  const status: Member["status"] =
    record.status === "travel" ? "travel" : overdue ? "attention" : "safe";
  return {
    id: record.uid,
    name: record.name,
    location: record.city || record.phone || "Location off",
    emoji: MEMBER_EMOJI_CYCLE[index % MEMBER_EMOJI_CYCLE.length],
    status,
    statusLabel:
      status === "travel"
        ? "Travelling"
        : status === "safe"
          ? record.city
            ? `Safe at ${record.city}`
            : "Safe"
          : checkInMs === null
            ? "No check-in yet"
            : "Missed daily check-in",
    detail:
      checkInMs === null
        ? "No check-in yet — waiting for their first update"
        : `Checked in ${formatCheckInTime(checkInMs)}`,
    avatarClass,
    lastCheckInMs: checkInMs ?? 0,
    lastNudgedMs: null,
  };
}

/** Pending invitation (`circles/{id}/invites` doc) → dashboard row. */
function inviteRowFromRecord(invite: CircleInvite, index: number, offset: number): Member {
  return {
    id: `invite-${invite.id}`,
    name: invite.name,
    location: invite.city || "Invite pending",
    emoji: "✉️",
    status: "safe",
    statusLabel: "Invite pending",
    detail: [invite.role, invite.city].filter(Boolean).join(" · ") || "Waiting for them to join",
    avatarClass: AVATAR_CYCLE[(offset + index) % AVATAR_CYCLE.length],
    lastCheckInMs: Date.now(),
    lastNudgedMs: null,
  };
}

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
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("elder");
  const [lang, setLang] = useState<"en" | "hi">("en");
  // Live circle members. Seeded with the demo fixtures only when Firebase is
  // unconfigured; otherwise the list is rebuilt from the circles/{id} members
  // snapshot, keyed by real auth uid (see the members subscription below).
  const [members, setMembers] = useState<Member[]>(
    isFirebaseConfigured() ? [] : FAMILY_MEMBERS
  );
  const [pendingInvites, setPendingInvites] = useState<CircleInvite[]>([]);
  const [membersReady, setMembersReady] = useState(!isFirebaseConfigured());
  const [nudgeMap, setNudgeMap] = useState<Record<string, Record<string, number>>>({});
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState("8:45 AM");
  /** Epoch ms of this device's check-in today (drives the self row + overdue). */
  const [myCheckInMs, setMyCheckInMs] = useState<number | null>(null);
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
  const [auditLogs, setAuditLogs] = useState<ActivityLogEntry[]>([]);
  const [sharing, setSharing] = useState(false);
  const [sosAlert, setSosAlert] = useState<SosAlert | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("Good morning");
  const [dateStr, setDateStr] = useState("");
  // ---- Circle state ----
  // The joined-circles list backs the header switcher (localStorage); the
  // ACTIVE circle id comes from the signed-in user's users/{uid} doc and is
  // "" until the auth gate resolves it (see the auth effects below).
  const [joinedCircles, setJoinedCircles] = useState<JoinedCircle[]>([]);
  const [activeCircleId, setActiveCircleId] = useState("");
  const [switchingCircle, setSwitchingCircle] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // ---- Identity ----
  // Every write below is performed as the signed-in user. The demo persona is
  // used only when Firebase isn't configured at all (offline demo mode).
  const myUid = authUser?.uid ?? "";
  const myMemberKey = isFirebaseConfigured() ? myUid : DEMO_MY_ID;
  const myName = isFirebaseConfigured()
    ? (members.find((m) => m.id === myUid)?.name ??
      authUser?.displayName ??
      authUser?.phoneNumber ??
      "Family member")
    : DEMO_MY_NAME;
  // Ghost-update guard: circle-scoped feeds only accept snapshots for the
  // circle that was active when the listener attached. If the user switches
  // circles while a snapshot is in flight, the stale callback is dropped.
  const activeCircleRef = useRef(activeCircleId);
  activeCircleRef.current = activeCircleId;
  // Latest signed-in uid for async snapshot callbacks, so listeners attached
  // before auth resolves never re-subscribe (or read a stale identity).
  const myUidRef = useRef(myUid);
  myUidRef.current = myUid;
  // ---- Safe zones (geofencing) ----
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate the switcher's circle list after mount (SSR-safe: localStorage is
  // unavailable during SSR). The cached list is a convenience only — with
  // Firestore configured every entry is re-verified against the circles'
  // members maps and anything the user isn't really in is dropped.
  useEffect(() => {
    const cached = loadJoinedCircles();
    /* eslint-disable react-hooks/set-state-in-effect */
    setJoinedCircles(cached);
    setNudgeMap(loadNudgeMap());
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!authUser || !isFirebaseConfigured()) return;
    let cancelled = false;
    void (async () => {
      const verified = await listMemberCircles(
        authUser.uid,
        cached.map((c) => c.id)
      );
      if (cancelled || verified.length === 0) return;
      const next: JoinedCircle[] = verified.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: cached.find((cc) => cc.id === c.id)?.emoji ?? "🛡️",
      }));
      setJoinedCircles(next);
      saveJoinedCircles(next); // remove stale/unverified ids from the cache
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // Resolve the signed-in user (demo session included when Firebase isn't
  // configured). authReady only flips on the first callback so the render
  // gate below never redirects before Firebase has had a chance to answer.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthState((user) => {
      if (cancelled) return;
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Unauthenticated visitors go to the login flow instead of the app.
  useEffect(() => {
    if (authReady && !authUser) router.replace("/login");
  }, [authReady, authUser, router]);

  // Real circle id from users/{uid} — the ACTIVE circle is always the one the
  // signed-in user's profile points at. Authenticated users without a circle
  // are routed to the login flow's create-or-join step.
  useEffect(() => {
    if (!authReady || !authUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const circleId = await getUserCircleId(authUser.uid);
        if (cancelled) return;
        if (!circleId) {
          router.replace("/login");
          return;
        }
        setActiveCircleId(circleId);
      } catch (err) {
        console.warn("[Suraksha Circle] Could not load your circle:", err);
        if (!cancelled) router.replace("/login"); // login flow shows a retryable error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, authUser, router]);

  /** Applies a verified circle id to the UI (clears the previous circle's data). */
  function applyCircleSwitch(id: string) {
    setActiveCircleId(id);
    setMembers([]); // clear until the new circle's members snapshot arrives
    setPendingInvites([]);
    setMembersReady(false);
    setEvents([]);
    setSosAlert(null);
    setAuditLogs([]);
    showToast("Switched circle");
  }

  /**
   * Switches circles — only ever to a circle the signed-in user really belongs
   * to. The localStorage list is re-verified against Firestore before the
   * switch so a tampered id can never point the app at someone else's circle.
   */
  const handleSelectCircle = (id: string) => {
    if (!id || id === activeCircleId || switchingCircle) return;
    if (!joinedCircles.some((c) => c.id === id)) {
      showToast("⚠️ You can only switch to a circle you have joined");
      return;
    }
    if (!isFirebaseConfigured() || !myUid) {
      applyCircleSwitch(id);
      return;
    }
    setSwitchingCircle(true);
    void (async () => {
      try {
        if (!(await isCircleMember(id, myUid))) {
          setJoinedCircles((cs) => {
            const next = cs.filter((c) => c.id !== id);
            saveJoinedCircles(next);
            return next;
          });
          showToast("⚠️ You are not a member of that circle");
          return;
        }
        if (!(await setActiveCircleIdForUser(myUid, id))) {
          showToast("⚠️ Could not switch circle — please try again");
          return;
        }
        applyCircleSwitch(id);
      } finally {
        setSwitchingCircle(false);
      }
    })();
  };

  /**
   * Joins a circle from a real invite code. Returns an error message for the
   * switcher to display, or null on success. Verified by Firestore: the code is
   * the only way in, and the membership is written server-side.
   */
  async function handleJoinCircle(code: string): Promise<string | null> {
    if (!myUid) return "Please sign in again to join a circle.";
    try {
      const membership = await joinCircleByInviteCode(
        myUid,
        myName,
        authUser?.phoneNumber ?? "",
        code
      );
      if (!membership) return "No circle matches that invite code.";
      const circle: JoinedCircle = {
        id: membership.circleId,
        name: membership.circleName,
        emoji: "🛡️",
      };
      setJoinedCircles((cs) => {
        const next = cs.some((c) => c.id === circle.id)
          ? cs.map((c) => (c.id === circle.id ? { ...c, name: circle.name } : c))
          : [...cs, circle];
        saveJoinedCircles(next);
        return next;
      });
      applyCircleSwitch(circle.id);
      showToast(`✅ Joined ${circle.name}`);
      return null;
    } catch (err) {
      console.warn("[Suraksha Circle] Join failed:", err);
      return "Could not join that circle. Please check the code and try again.";
    }
  }

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
      const ts = typeof parsed.ts === "number" ? parsed.ts : Date.now();
      // Only a check-in from today counts — yesterday's "safe" must not carry over.
      if (parsed.checkedIn && isToday(ts)) {
        // Intentional client-only init: localStorage is unavailable during SSR.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCheckedIn(true);
         
        setCheckInTime(parsed.time);
        setMyCheckInMs(ts);
      }
    } catch {
      // corrupted storage — ignore and fall back to demo defaults
    }
  }, []);

  // Live activity feed from Firestore (filtered by the active Circle ID),
  // newest first; falls back to demo events when Firebase isn't configured.
  // Re-subscribes automatically whenever the active circle changes.
  // Cleanup safety: the returned cleanup unsubscribes events + audit feeds
  // BEFORE the new circle's listeners attach, so snapshots from the previous
  // circle can never overwrite the new circle's state (no ghost updates).
  useEffect(() => {
    if (!activeCircleId) return; // auth gate: wait for the real circle id
    const circleAtAttach = activeCircleId;
    const isCurrent = () => activeCircleRef.current === circleAtAttach;
    const unsubscribe = subscribeToCircleEvents(
      circleAtAttach,
      (feed) => {
        if (!isCurrent()) return;
        reportSyncOk("events");
        // Merge, don't replace: keep optimistic local entries (local-* ids)
        // that the server snapshot does not contain yet — no flicker.
        setEvents((prev) => {
          const pending = prev.filter(
            (p) => p.id.startsWith("local-") && !feed.some((f) => f.id === p.id)
          );
          return [...pending, ...feed].slice(0, 100);
        });
      },
      () => {
        reportSyncError("events");
        showToast("⚠️ Live feed unavailable — showing demo activity");
      }
    );
    const unsubAudit = subscribeToActivityLogs(
      circleAtAttach,
      (logs) => {
        if (!isCurrent()) return;
        reportSyncOk("activity");
        // Same merge strategy as the events feed: preserve optimistic
        // local-* entries across committed server snapshots.
        setAuditLogs((prev) => {
          const pending = prev.filter(
            (p) => p.id.startsWith("local-") && !logs.some((l) => l.id === p.id)
          );
          return [...pending, ...logs].slice(0, 100);
        });
      },
      () => {
        reportSyncError("activity");
        console.warn("[Suraksha Circle] Activity log unavailable");
      }
    );
    return () => {
      unsubscribe();
      unsubAudit();
    };
  }, [activeCircleId]);

  // Live circle members + pending invites.
  // The dashboard renders the REAL members map of circles/{activeCircleId},
  // keyed by auth uid; the hardcoded fixtures stay in play only when Firebase
  // is unconfigured (offline demo mode) or unreachable.
  useEffect(() => {
    if (!activeCircleId) return; // auth gate: wait for the real circle id
    if (!isFirebaseConfigured()) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMembers(FAMILY_MEMBERS);
      setMembersReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const circleAtAttach = activeCircleId;
    const isCurrent = () => activeCircleRef.current === circleAtAttach;
    const fallBackToDemoData = () => {
      if (!isCurrent()) return;
      setMembers(FAMILY_MEMBERS);
      setMembersReady(true);
    };

    const unsubscribe = subscribeToCircleMembers(
      circleAtAttach,
      (snapshot) => {
        if (!isCurrent()) return;
        if (!snapshot) {
          fallBackToDemoData(); // configured but unreadable — never render empty
          return;
        }
        reportSyncOk("members");
        setMembers(snapshot.members.map(memberFromRecord));
        // Reflect this user's own stored check-in (e.g. tapped on another phone).
        const mine = snapshot.members.find((m) => m.uid === myUidRef.current);
        if (mine?.lastCheckInMs && isToday(mine.lastCheckInMs)) {
          setCheckedIn(true);
          setCheckInTime(formatCheckInTime(mine.lastCheckInMs));
          setMyCheckInMs(mine.lastCheckInMs);
        }
        setMembersReady(true);
      },
      () => {
        if (!isCurrent()) return;
        reportSyncError("members");
        showToast("⚠️ Member list unavailable — showing demo data");
        fallBackToDemoData();
      }
    );

    const unsubInvites = subscribeToCircleInvites(circleAtAttach, (invites) => {
      if (isCurrent()) setPendingInvites(invites);
    });

    return () => {
      unsubscribe();
      unsubInvites();
    };
  }, [activeCircleId]);

  // Real-time active SOS listener for the circle.
  // Re-subscribes automatically whenever the active circle changes.
  useEffect(() => {
    if (!activeCircleId) return; // auth gate: wait for the real circle id
    const unsubscribe = subscribeToActiveSos(
      activeCircleId,
      (alert) => {
        reportSyncOk("sos");
        setSosAlert(alert);
      },
      (err) => {
        reportSyncError("sos");
        console.warn("[Suraksha Circle] SOS listener error:", err);
        setSosAlert(null);
      }
    );
    return unsubscribe;
  }, [activeCircleId]);

  // Foreground push (app open): show in-app toast for incoming alerts.
  // Background delivery is handled by /firebase-messaging-sw.js.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    subscribeToForegroundPush((title, body) => {
      showToast(`🔔 ${title} — ${body}`);
    }).then((u) => {
      if (cancelled) u();
      else unsubscribe = u;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      logEvent("sos-resolved", myName, "SOS alert resolved", "Marked safe — alert closed by user");
    }
    setSosOpen(false);
    setSosSent(false);
  }

  /** One-tap "I'm Safe": writes the real check-in for everyone in the circle. */
  async function handleCheckIn() {
    if (checkedIn) return;
    const now = Date.now();
    const time = formatCheckInTime(now);
    setCheckedIn(true);
    setCheckInTime(time);
    setMyCheckInMs(now);
    try {
      window.localStorage.setItem(
        CHECKIN_KEY,
        JSON.stringify({ checkedIn: true, time, ts: now })
      );
    } catch {
      // storage unavailable (private mode) — check-in still works for this session
    }
    logEvent("checkin", myName, "Daily check-in", "I'm Safe");
    void logActivity({
      circleId: activeCircleId,
      type: "check_in",
      userId: myUid || "demo-user",
      userName: myName,
      message: `${myName} checked in — I'm Safe`,
    });
    // Persist on the circle's members map so every device sees it live.
    if (isFirebaseConfigured() && myUid) {
      const saved = await markMemberCheckIn(activeCircleId, myUid);
      showToast(
        saved
          ? "Check-in recorded — your circle has been notified"
          : "Check-in saved on this device — we couldn't reach your circle"
      );
      return;
    }
    showToast("Check-in recorded");
  }

      function handleVoiceCheckIn(result: VoiceResult) {
    const time = new Date().toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });
    setCheckedIn(true);
    setCheckInTime(time);
    setMyCheckInMs(Date.now());
    try {
      window.localStorage.setItem(
        CHECKIN_KEY,
        JSON.stringify({ checkedIn: true, time, ts: Date.now() })
      );
    } catch {}
    logEvent(
      "audio-verification",
      myName,
      "Voice check-in: I am safe",
      `Recognised "${result.transcript}" · verified via voice · ${time}`
    );
    void logActivity({
      circleId: activeCircleId,
      type: "check_in",
      userId: myUid || "demo-user",
      userName: myName,
      message: `${myName} voice check-in — I'm Safe (${time})`,
    });
    if (isFirebaseConfigured() && myUid) {
      void markMemberCheckIn(activeCircleId, myUid);
    }
    showToast("Check-in recorded");
  }

  /** Reminds the most overdue member — or confirms everyone has checked in. */
  function remindCheckIn() {
    const target = overdueMembers[0];
    if (!target) {
      showToast("✅ Everyone in the circle has checked in");
      return;
    }
    sendNudge(target);
  }

  function triggerCascade() {
    setCascadeOpen(false);
    const count = memberRows.filter((m) => m.id !== myMemberKey).length;
    logEvent(
      "cascade",
      myName,
      "Family emergency cascade triggered",
      `All ${count} members alerted with live location`
    );
    showToast(
      count > 0
        ? `🚨 Emergency cascade sent to all ${count} members`
        : "🚨 Emergency cascade sent to your circle"
    );
  }

  /** Toggles live location sharing and writes the audit-trail entry. */
  function toggleLocationShare() {
    const next = !sharing;
    setSharing(next);
    logEvent(
      next ? "share-start" : "share-end",
      myName,
      next ? "Live location share started" : "Location share ended",
      next ? "Live location shared with the circle" : "Reached safely"
    );
    void logActivity({
      circleId: activeCircleId,
      type: next ? "location_started" : "location_stopped",
      userId: myUid || "demo-user",
      userName: myName,
      message: next
        ? `${myName} started live location sharing`
        : `${myName} stopped location sharing`,
    });
    // Mirror the presence change onto the circle's members map (presence only).
    if (isFirebaseConfigured() && myUid) {
      void setMemberStatus(activeCircleId, myUid, next ? "travel" : "safe");
    }
    showToast(next ? "📍 Live location sharing started" : "Location sharing stopped");
  }

  /** Sends a gentle check-in nudge to an overdue member (audit-logged). */
  function sendNudge(member: Member) {
    const now = Date.now();
    const message =
      lang === "hi"
        ? `${member.name} को चेक-इन याद दिलाया 🙏`
        : `Gentle check-in reminder sent to ${member.name}`;
    rememberNudge(activeCircleId, member.id, now);
    setNudgeMap((map) => ({
      ...map,
      [activeCircleId]: { ...(map[activeCircleId] ?? {}), [member.id]: now },
    }));
    logEvent("cascade", myName, `Nudged ${member.name} to check in`, message);
    void logActivity({
      circleId: activeCircleId,
      type: "check_in_nudge",
      userId: myUid || "demo-user",
      userName: myName,
      message,
    }).then((entry) =>
      setAuditLogs((prev) => (prev.some((p) => p.id === entry.id) ? prev : [entry, ...prev]).slice(0, 100))
    );
    showToast(
      lang === "hi"
        ? `${member.name} को याद दिलाया 🙏`
        : `Reminder sent to ${member.name}`
    );
  }

  /** Marks a family place and writes the audit-trail entry. */
  function markFamilyPlace() {
    logEvent("checkin", myName, "Family place marked", "🏠 Home — saved for the circle");
    void logActivity({
      circleId: activeCircleId,
      type: "place_marked",
      userId: myUid || "demo-user",
      userName: myName,
      message: `${myName} marked a family place: 🏠 Home`,
    });
    showToast("📍 Family place marked: Home");
  }

  /** Logs a circle event to Firestore (when configured) and renders it instantly.
   * Merge strategy: optimistic local entries are appended immediately and kept
   * when the next committed server snapshot arrives (matched by id), so the
   * feed never flickers or duplicates during multi-device sync.
   */
  function logEvent(
    type: CircleEventType,
    actorName: string,
    title: string,
    detail?: string,
    active = false
  ) {
    pushCircleEvent({ circleId: activeCircleId, type, actorName, title, detail, active }).then(
      (e) => setEvents((prev) => (prev.some((p) => p.id === e.id) ? prev : [e, ...prev]))
    );
  }

  /** Fire-and-forget call to /api/send-push — fans the emergency Web Push out
   * to every registered device in the circle via FCM (server-side). Never
   * blocks or fails the in-app SOS flow. */
  function notifyCircleDevices(title: string, body: string) {
    try {
      void fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // survive tab switch during the emergency
        body: JSON.stringify({
          circleId: activeCircleId,
          title,
          body,
          url: "/",
          tag: "suraksha-sos",
        }),
      }).catch(() => undefined);
    } catch {
      // dispatch is best-effort; the in-app SOS flow must never break
    }
  }

  /** Fire-and-forget call to /api/notify-sos — SMS/WhatsApp dispatch happens
   * server-side (Twilio) or as a simulated console preview when unconfigured. */
  function notifyEmergencyContacts(raisedByName: string, location: string) {
    try {
      void fetch("/api/notify-sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // survive tab switch during the emergency
        body: JSON.stringify({
          circleId: activeCircleId,
          raisedByName,
          location,
          recipients: CONTACTS.map((c) =>
            c.tel.replace("tel:", "").replace(/\s+/g, "")
          ),
        }),
      }).catch(() => undefined);
    } catch {
      // dispatch is best-effort; the in-app SOS flow must never break
    }
  }

  function sendSos() {
    setSosSent(true);
    logEvent("sos", myName, "🚨 SOS alert triggered", "Live location shared with circle", true);
    void logActivity({
      circleId: activeCircleId,
      type: "sos_triggered",
      userId: myUid || "demo-user",
      userName: myName,
      message: `🚨 SOS triggered by ${myName}`,
    });
    // Firestore-based: write real sos_events doc so the banner appears for everyone in the circle
    raiseSos(activeCircleId, myUid || "demo-user", myName, "Live location shared with circle").then(
      (alert) => setSosAlert(alert)
    );
    // Background SMS/WhatsApp dispatch via /api/notify-sos (fire-and-forget —
    // never blocks or fails the in-app emergency flow).
    notifyEmergencyContacts(myName, SOS_LOCATION_FALLBACK);
    // Web Push to all registered circle devices (also fire-and-forget).
    notifyCircleDevices(
      `🚨 SOS EMERGENCY — ${myName} needs help`,
      `${myName} triggered an SOS. Live location: ${SOS_LOCATION_FALLBACK}. Tap to open Suraksha Circle.`
    );
  }

  /** Dispatches the real SOS when a wearable fall / abnormal-heart-rate alert
   * was NOT cancelled within its window. Raises the circle-wide SOS event so
   * the banner appears for every member, and notifies emergency contacts. */
  function dispatchWearableSos(alert: WearableAlert) {
    const title =
      alert.kind === "fall"
        ? "🚨 Fall detected by smart wearable"
        : "🚨 Abnormal heart rate detected";
    logEvent(
      alert.kind === "fall" ? "fall-detected" : "abnormal-heart-rate",
      myName,
      title,
      `${alert.detail} · ${alert.heartRate} BPM`,
      true
    );
    raiseSos(activeCircleId, myUid || "demo-user", myName, alert.detail).then((sos) =>
      setSosAlert(sos)
    );
    void logActivity({
      circleId: activeCircleId,
      type: "sos_triggered",
      userId: myUid || "demo-user",
      userName: myName,
      message: `🚨 Wearable SOS — ${title}`,
    });
    notifyEmergencyContacts(myName, SOS_LOCATION_FALLBACK);
    notifyCircleDevices(
      title,
      `${alert.detail} — ${alert.heartRate} BPM. Tap to open Suraksha Circle.`
    );
    showToast("🚨 Wearable emergency — family alerted");
  }

  // Only the member who raised the alert may mark it safe.
  const isRaisedByMe = Boolean(myUid && sosAlert?.raisedBy === myUid);

  async function acknowledgeSos() {
    const text =
      "🚨 SOS EMERGENCY! " +
      (sosAlert?.raisedByName ?? "Family member") +
      ` needs help right now. Live location: ${SOS_LOCATION_FALLBACK}. Please call immediately. — Sent via Suraksha Circle`;
    await handleShare(text);
  }

  async function resolveSosAlert() {
    if (!sosAlert) return;
    await resolveSos(sosAlert, myName);
    setSosAlert(null);
    logEvent("sos-resolved", myName, "SOS alert resolved", "Marked safe — alert resolved by user");
    void logActivity({
      circleId: activeCircleId,
      type: "sos_resolved",
      userId: myUid || "demo-user",
      userName: myName,
      message: `SOS resolved — ${myName} is safe`,
    });
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

  /** Adds a pending invitation that appears live on every device in the circle. */
  async function handleAddMember() {
    const name = newName.trim();
    if (!name) return;
    const city = newCity.trim();
    const invite = await addInvitedMember(activeCircleId, myUid, name, newRole, city);
    if (!invite) {
      showToast("⚠️ Couldn't add that member — please try again");
      return;
    }
    // Optimistic: the invites snapshot confirms it (demo mode keeps it local).
    setPendingInvites((list) => (list.some((i) => i.id === invite.id) ? list : [invite, ...list]));
    logEvent(
      "member-added",
      myName,
      "Invited to the circle",
      `${name} · ${newRole}${city ? ` · ${city}` : ""}`
    );
    setAddOpen(false);
    setNewName("");
    setNewRole("Mom");
    setNewCity("");
    showToast(`✅ ${name} invited — share your circle code so they can join`);
  }

  // Rows rendered on the dashboard: live circle members plus pending invites,
  // with local nudge markers and this device's own check-in applied on top.
  const memberRows = useMemo(() => {
    const nudges = nudgeMap[activeCircleId] ?? {};
    return members.map((m) => {
      const lastNudgedMs = nudges[m.id] ?? m.lastNudgedMs;
      if (m.id !== myMemberKey || !checkedIn || m.status === "travel") {
        return { ...m, lastNudgedMs };
      }
      return {
        ...m,
        lastNudgedMs,
        status: "safe" as const,
        statusLabel: m.location ? `Safe at ${m.location}` : "Safe",
        detail: `Checked in ${checkInTime}`,
        lastCheckInMs: myCheckInMs ?? Date.now(),
      };
    });
  }, [members, nudgeMap, activeCircleId, myMemberKey, checkedIn, checkInTime, myCheckInMs]);
  const rows = useMemo(
    () => [
      ...memberRows,
      ...pendingInvites.map((invite, i) => inviteRowFromRecord(invite, i, memberRows.length)),
    ],
    [memberRows, pendingInvites]
  );
  const attention = memberRows.filter((m) => m.status === "attention").length;
  const travel = memberRows.filter((m) => m.status === "travel").length;
  const safe = rows.length - attention - travel;
  // Overdue members: last check-in older than 20h (unknown/overdue state).
  const overdueMembers = memberRows.filter((m) => isCheckInOverdue(m.lastCheckInMs));
  // Names of everyone else in the circle (used in alert copy).
  const notifyNames = memberRows.filter((m) => m.id !== myMemberKey).map((m) => m.name);
  const isElder = view === "elder";
  const t = ELDER_TEXT[lang];

  // ---- Auth gate ----
  // Until the signed-in user, their circle AND that circle's real member list
  // resolve, show a warm splash: unauthenticated visitors get redirected to
  // /login above, while signed-in users wait here instead of seeing a
  // half-loaded app or a stale member list.
  if (!authReady || !authUser || !activeCircleId || !membersReady) {
    const signedOut = authReady && !authUser;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-emerald-50 via-white to-white px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <ShieldCheck className="h-9 w-9" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-extrabold text-slate-900">
            {signedOut
              ? lang === "hi"
                ? "साइन इन पर भेजा जा रहा है…"
                : "Taking you to sign in…"
              : lang === "hi"
                ? "आपका घेरा लोड हो रहा है…"
                : "Loading your circle…"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {lang === "hi"
              ? "परिवार की सुरक्षा के लिए तैयार हो रहा है"
              : "Preparing your family’s safety space"}
          </p>
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" aria-hidden />
      </div>
    );
  }

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
          <div className="flex shrink-0 items-center gap-2">
            <CircleSwitcher
              circles={joinedCircles}
              activeCircleId={activeCircleId}
              onSelect={handleSelectCircle}
              onJoin={handleJoinCircle}
              elder={isElder}
            />
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
        <OfflineBanner elder={isElder} lang={lang} />
        {/* ===== Real-time SOS Emergency Banner ===== */}
        <SosBanner
          alert={sosAlert}
          onAcknowledge={acknowledgeSos}
          onResolve={resolveSosAlert}
                    isRaisedByMe={isRaisedByMe}
          elder={isElder}
          lang={lang}
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
              <span className="text-rose-500">{isFirebaseConfigured() ? myName : "Mummy ji"}</span> <span aria-hidden>❤️</span>
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
                  {checkedIn ? `Today ${checkInTime}` : "Not yet today"}
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

            {/* Voice-activated check-in */}
            <div className="flex justify-center">
              <VoiceAssistantButton
                lang={lang}
                elder={isElder}
                onSafeVoice={handleVoiceCheckIn}
              />
            </div>

            {/* Wearable monitor & fall detection (Elder Mode) */}
            <PushNotificationToggle
              circleId={activeCircleId}
              elder={isElder}
              lang={lang}
              memberName={myName}
              onStatusChange={showToast}
            />
            <WearableMonitorCard
              elder={isElder}
              lang={lang}
              onDispatch={dispatchWearableSos}
              onCancel={() => showToast("✅ False alarm cancelled — you are safe")}
            />

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
            {logOpen && <ActivityLog events={events} circleId={activeCircleId} elder lang={lang} />}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={toggleLocationShare}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-sky-200 bg-white p-3 text-center shadow-sm transition hover:border-sky-400 active:scale-[0.98]"
              >
                <MapPin className="h-6 w-6 text-sky-600" aria-hidden />
                <span className="text-sm font-extrabold text-slate-800">
                  {sharing
                    ? lang === "hi"
                      ? "लोकेशन बंद करें"
                      : "Stop Sharing"
                    : lang === "hi"
                      ? "लाइव लोकेशन"
                      : "Share Location"}
                </span>
              </button>
              <button
                onClick={markFamilyPlace}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-violet-200 bg-white p-3 text-center shadow-sm transition hover:border-violet-400 active:scale-[0.98]"
              >
                <span className="text-2xl" aria-hidden>
                  📍
                </span>
                <span className="text-sm font-extrabold text-slate-800">
                  {lang === "hi" ? "जगह जोड़ें" : "Mark Place"}
                </span>
              </button>
            </div>
            <ActivityLogCard logs={auditLogs} elder lang={lang} />

            <footer className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-400">
                Suraksha Circle MVP · demo data only
              </p>
              <p className="mt-1.5 text-xs font-bold text-slate-500">
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-emerald-700"
                >
                  Privacy Policy
                </Link>
                <span aria-hidden> · </span>
                <Link
                  href="/terms"
                  className="underline underline-offset-2 hover:text-emerald-700"
                >
                  Terms of Service
                </Link>
              </p>
            </footer>

            <p className="pt-2 text-center text-xs font-medium text-slate-400">
              Suraksha Circle MVP · demo data only
            </p>
          </div>
        ) : (
          /* ===== FAMILY DASHBOARD ===== */
          <div className="space-y-4">
            <p className="text-base font-semibold text-slate-500">{dateStr}</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Hi {myName} 👋 <span className="text-slate-400">·</span>{" "}
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
                {attention > 0 ? `${safe} of ${rows.length} safe` : "All members safe"}
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

            {/* Missed check-in / overdue nudges (coordinator view) */}
            {overdueMembers.length > 0 && (
              <section
                aria-label={lang === "hi" ? "छूटे हुए चेक-इन" : "Missed check-ins"}
                className="rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm"
              >
                <div className="flex items-center gap-2.5 px-1">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white"
                    aria-hidden
                  >
                    <BellRing className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-extrabold text-amber-900">
                      {lang === "hi"
                        ? `⏰ ${overdueMembers.length} सदस्य का चेक-इन छूटा`
                        : `⏰ ${overdueMembers.length} missed check-in${overdueMembers.length > 1 ? "s" : ""}`}
                    </h3>
                    <p className="text-xs font-semibold text-amber-700">
                      {lang === "hi"
                        ? "20 घंटे से कोई चेक-इन नहीं — प्यार से याद दिलाएँ"
                        : "No check-in for 20+ hours — send a gentle reminder"}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {overdueMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white p-3 shadow-sm"
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl ${m.avatarClass}`}
                        aria-hidden
                      >
                        {m.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-slate-900">
                          {lang === "hi"
                            ? `${m.name} ने आज चेक-इन नहीं किया। याद दिलाएँ?`
                            : `${m.name} hasn't checked in today. Send a quick reminder?`}
                        </p>
                        <p className="text-xs font-semibold text-slate-400">
                          {m.lastNudgedMs
                            ? lang === "hi"
                              ? "याद दिलाया ✓"
                              : "Nudged ✓"
                            : lang === "hi"
                              ? "अभी तक याद नहीं दिलाया"
                              : "Not nudged yet"}
                        </p>
                      </div>
                      <button
                        onClick={() => sendNudge(m)}
                        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-amber-600 active:scale-95"
                      >
                        <BellRing className="h-4 w-4" aria-hidden />
                        {lang === "hi" ? "याद दिलाएँ" : "Send Nudge"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
                {rows.map((m) => (
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
                            m.emoji === "✉️"
                              ? "bg-slate-100 text-slate-600"
                              : m.status === "safe"
                                ? "bg-emerald-100 text-emerald-700"
                                : m.status === "attention"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {m.emoji === "✉️"
                            ? "✉️"
                            : m.status === "safe"
                              ? "🟢"
                              : m.status === "attention"
                                ? "⚠️"
                                : "🚗"}{" "}
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

            {/* Push notification opt-in — family sees Mummy's alert settings */}
            <PushNotificationToggle
              circleId={activeCircleId}
              elder={isElder}
              lang={lang}
              memberName={myName}
              onStatusChange={showToast}
            />

            {/* Caretaker / doctor access manager — generate read-only codes */}
            <CaretakerAccessManager
              circleId={activeCircleId}
              lang={lang}
              onStatusChange={showToast}
            />

            {/* Wearable monitor — family sees Mummy's live band vitals */}
            <WearableMonitorCard
              elder={isElder}
              lang={lang}
              onDispatch={dispatchWearableSos}
              onCancel={() => showToast("✅ False alarm cancelled — you are safe")}
            />

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
            <ActivityLog events={events} circleId={activeCircleId} />
            <ActivityLogCard logs={auditLogs} lang={lang} />

            <footer className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-400">
                Suraksha Circle MVP · demo data only
              </p>
              <p className="mt-1.5 text-xs font-bold text-slate-500">
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-emerald-700"
                >
                  Privacy Policy
                </Link>
                <span aria-hidden> · </span>
                <Link
                  href="/terms"
                  className="underline underline-offset-2 hover:text-emerald-700"
                >
                  Terms of Service
                </Link>
              </p>
            </footer>

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
              Alert will be sent to all {rows.length} family members with live location in:
            </p>
            <div className="relative mx-auto mt-4 flex h-28 w-28 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" aria-hidden />
              <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-600 text-5xl font-black text-white shadow-xl">
                {countdown}
              </span>
            </div>
            <ul className="mt-5 space-y-2 text-left text-sm font-semibold text-slate-700">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-red-600" aria-hidden /> Auto-call{" "}
                {notifyNames.length > 0 ? notifyNames.join(" → ") : "your circle"}
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
              {(notifyNames.length > 0 ? notifyNames : ["Your circle"]).map((name) => (
                <li key={name}>✅ {name} notified — phone ringing</li>
              ))}
              <li>📍 Live location shared with the circle</li>
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
          This will immediately alert the entire circle with {`${myName}'s live location`}:
        </p>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
          <li>📞 Call &amp; notify all {rows.length} members</li>
          <li>📍 Share {`${myName}'s live location`}</li>
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
            They appear as ✉️ Invite pending until they join with your circle code.
          </p>
        </div>
      </Modal>
    </div>
  );
}



