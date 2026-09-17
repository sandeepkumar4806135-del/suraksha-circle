import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { getDb } from "./firebase";

/**
 * Smart Family Schedule & Medication Reminders
 * ============================================
 * Persists medications and appointments per circle (localStorage for instant
 * offline use + Firestore `circles/{id}/schedules` for the whole family) and
 * exposes a browser speech-synthesis nudge helper for gentle voice reminders.
 */

export type ScheduleKind = "medication" | "appointment";

export type ScheduleStatus = "pending" | "taken";

/** A medication dose or appointment assigned to an elder. */
export interface ScheduleItem {
  id: string;
  circleId: string;
  kind: ScheduleKind;
  /** Display name, e.g. "BP ki dawai" or "Dr. Mehta checkup". */
  name: string;
  /** Dosage note (medications only), e.g. "1 tablet after food". */
  dosage?: string;
  emoji: string;
  /** 24-hour "HH:MM" scheduled time. */
  time: string;
  /** Assigned elder's display name, e.g. "Mummy". */
  elderName: string;
  status: ScheduleStatus;
  /** Epoch ms when marked taken (null while pending). */
  takenAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// localStorage persistence (instant, offline-first, per circle)
// ---------------------------------------------------------------------------

const LS_KEY_PREFIX = "suraksha.schedules.";

function lsKey(circleId: string): string {
  return `${LS_KEY_PREFIX}${circleId}`;
}

function loadLocalSchedules(circleId: string): ScheduleItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(lsKey(circleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduleItem[];
    return Array.isArray(parsed)
      ? parsed.filter((s) => s && s.id && typeof s.time === "string")
      : [];
  } catch {
    return [];
  }
}

function saveLocalSchedules(circleId: string, items: ScheduleItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(circleId), JSON.stringify(items));
  } catch {
    // storage full — session-only schedules
  }
}

function normalizeSchedule(
  circleId: string,
  id: string,
  d: DocumentData
): ScheduleItem {
  const created = d.createdAt;
  const takenAt = d.takenAt;
  return {
    id,
    circleId,
    kind: d.kind === "appointment" ? "appointment" : "medication",
    name: (d.name as string) ?? "Reminder",
    dosage: d.dosage ? (d.dosage as string) : undefined,
    emoji: (d.emoji as string) ?? "💊",
    time: (d.time as string) ?? "08:00",
    elderName: (d.elderName as string) ?? "Mummy",
    status: d.status === "taken" ? "taken" : "pending",
    takenAt:
      takenAt instanceof Timestamp
        ? takenAt.toMillis()
        : typeof takenAt === "number"
          ? takenAt
          : null,
    createdAt:
      created instanceof Timestamp
        ? created.toMillis()
        : created instanceof Date
          ? created.getTime()
          : typeof created === "number"
            ? created
            : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Demo data (shown when Firebase is not configured)
// ---------------------------------------------------------------------------

/** Demo reminders matching the Sharma family circle. */
export const DEMO_SCHEDULES: ScheduleItem[] = [
  {
    id: "sched-1",
    circleId: "",
    kind: "medication",
    name: "BP ki dawai",
    dosage: "1 tablet after breakfast",
    emoji: "\u{1F48A}",
    time: "08:30",
    elderName: "Mummy",
    status: "pending",
    takenAt: null,
    createdAt: 0,
  },
  {
    id: "sched-2",
    circleId: "",
    kind: "medication",
    name: "Sugar tablet",
    dosage: "1 tablet after dinner",
    emoji: "\u{1FA78}",
    time: "21:00",
    elderName: "Mummy",
    status: "pending",
    takenAt: null,
    createdAt: 0,
  },
  {
    id: "sched-3",
    circleId: "",
    kind: "appointment",
    name: "Dr. Mehta checkup",
    dosage: "Kokilaben Hospital, Andheri West",
    emoji: "\u{1FA7A}",
    time: "11:15",
    elderName: "Papa",
    status: "pending",
    takenAt: null,
    createdAt: 0,
  },
];

/** Live-subscribes to the circle's reminders; falls back to local then demo. */
export function subscribeToSchedules(
  circleId: string,
  onData: (items: ScheduleItem[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const db = getDb();
  if (!db) {
    const local = loadLocalSchedules(circleId);
    onData(local.length ? local : DEMO_SCHEDULES.map((s) => ({ ...s, circleId })));
    return () => undefined;
  }
  const q = query(
    collection(db, "circles", circleId, "schedules"),
    orderBy("time", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => normalizeSchedule(circleId, d.id, d.data()));
      saveLocalSchedules(circleId, items);
      onData(items);
    },
    (err) => {
      onError?.(err);
      const local = loadLocalSchedules(circleId);
      onData(local.length ? local : DEMO_SCHEDULES.map((s) => ({ ...s, circleId })));
    }
  );
}