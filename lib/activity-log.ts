import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, type DocumentData } from "firebase/firestore";
import { getDb } from "./firebase";

export type ActivityLogType = "check_in" | "check_in_nudge" | "sos_triggered" | "sos_resolved" | "location_started" | "location_stopped" | "place_marked";

export interface ActivityLog {
  id: string;
  circleId: string;
  type: ActivityLogType;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

const COLLECTION = "activityLogs";
const DEMO_BASE = Date.now();

export const DEMO_ACTIVITY_LOGS: ActivityLog[] = [
  { id: "demo-log-1", circleId: "sharma-family-circle", type: "check_in", userId: "grandma", userName: "Grandma", message: "Grandma checked in — I'm Safe", timestamp: DEMO_BASE - 12 * 60_000 },
  { id: "demo-log-2", circleId: "sharma-family-circle", type: "location_started", userId: "brother", userName: "Brother", message: "Brother started live location sharing", timestamp: DEMO_BASE - 37 * 60_000 },
  { id: "demo-log-3", circleId: "sharma-family-circle", type: "place_marked", userId: "papa", userName: "Papa", message: "Papa marked a family place: Home", timestamp: DEMO_BASE - 65 * 60_000 },
  { id: "demo-log-4", circleId: "sharma-family-circle", type: "sos_resolved", userId: "papa", userName: "Papa", message: "SOS resolved — Grandma is safe", timestamp: DEMO_BASE - 5 * 3_600_000 },
  { id: "demo-log-5", circleId: "sharma-family-circle", type: "sos_triggered", userId: "grandma", userName: "Grandma", message: "SOS triggered by Grandma", timestamp: DEMO_BASE - 5.5 * 3_600_000 },
];

function normalizeLog(circleId: string, id: string, data: DocumentData): ActivityLog {
  const ts: unknown = data.timestamp;
  const rawType = data.type as string;
  const valid: ActivityLogType[] = ["check_in", "check_in_nudge", "sos_triggered", "sos_resolved", "location_started", "location_stopped", "place_marked"];
  return {
    id,
    circleId,
    type: valid.includes(rawType as ActivityLogType) ? (rawType as ActivityLogType) : "check_in",
    userId: (data.userId as string) ?? "unknown",
    userName: (data.userName as string) ?? "Family member",
    message: (data.message as string) ?? "Circle activity",
    timestamp: ts instanceof Timestamp ? ts.toMillis() : typeof ts === "number" ? ts : Date.now(),
  };
}

export interface LogActivityInput {
  circleId: string;
  type: ActivityLogType;
  userId: string;
  userName: string;
  message: string;
}

export async function logActivity(input: LogActivityInput): Promise<ActivityLog> {
  const local: ActivityLog = { ...input, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
  const db = getDb();
  if (!db) return local;
  try {
    await addDoc(collection(db, "circles", input.circleId, COLLECTION), {
      type: input.type,
      userId: input.userId,
      userName: input.userName,
      message: input.message,
      timestamp: serverTimestamp(),
    });
  } catch {
    // best-effort
  }
  return local;
}

export function subscribeToActivityLogs(circleId: string, onData: (logs: ActivityLog[]) => void, onError?: (err: unknown) => void): () => void {
  const db = getDb();
  if (!db) {
    onData([...DEMO_ACTIVITY_LOGS]);
    return () => undefined;
  }
  const q = query(collection(db, "circles", circleId, COLLECTION), orderBy("timestamp", "desc"), limit(100));
  // Skip local-only snapshots (pending writes) so optimistic entries appended
  // by the caller merge cleanly instead of flickering/duplicating on echo.
  return onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
    if (snap.metadata.hasPendingWrites) return;
    onData(snap.docs.map((d) => normalizeLog(circleId, d.id, d.data())));
  }, (err) => {
    onError?.(err);
    onData([...DEMO_ACTIVITY_LOGS]);
  });
}

// ---------------------------------------------------------------------------
// Missed-check-in / overdue-nudge helpers — Phase 5 (Beta Trust Foundation)
// ---------------------------------------------------------------------------

/**
 * Hours after the last check-in before a member counts as overdue.
 * Demo members carry only display strings ("Checked in 8:45 AM"), so the page
 * derives a `lastCheckInMs` per member; keep the threshold in one place.
 */
export const CHECKIN_OVERDUE_HOURS = 20;

const OVERDUE_MS = CHECKIN_OVERDUE_HOURS * 3_600_000;

/** True when the last check-in timestamp is older than the overdue window. */
export function isCheckInOverdue(lastCheckInMs: number, now: number = Date.now()): boolean {
  return now - lastCheckInMs > OVERDUE_MS;
}

/** Demo last-check-in timestamps for the bundled family fixtures. */
export const DEMO_LAST_CHECKIN_BY_MEMBER: Record<string, number> = {
  mummy: DEMO_BASE - 45 * 60_000,
  papa: DEMO_BASE - 5 * 3_600_000,
  grandma: DEMO_BASE - 26 * 3_600_000,
  brother: DEMO_BASE - 2 * 3_600_000,
};

export function formatRelativeTime(ts: number, lang: "en" | "hi"): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return lang === "hi" ? "अभी" : "just now";
  if (mins === 1) return lang === "hi" ? "1 मिनट पहले" : "1 min ago";
  if (mins < 60) return lang === "hi" ? `${mins} मिनट पहले` : `${mins} mins ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return lang === "hi" ? "1 घंटा पहले" : "1 hour ago";
  if (hours < 24) return lang === "hi" ? `${hours} घंटे पहले` : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return lang === "hi" ? "1 दिन पहले" : "1 day ago";
  if (days < 7) return lang === "hi" ? `${days} दिन पहले` : `${days} days ago`;
  return new Date(ts).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" });
}

