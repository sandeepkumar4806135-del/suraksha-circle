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

import { speakPrompt, type VoiceLang } from "./voice-assistant";

/**
 * Adds a new medication or appointment schedule item.
 * Persists to Firestore (when configured) and localStorage immediately.
 */
export async function addSchedule(
  circleId: string,
  item: Omit<ScheduleItem, "id" | "circleId" | "createdAt" | "takenAt" | "status">
): Promise<ScheduleItem> {
  const now = Date.now();
  const schedule: ScheduleItem = {
    ...item,
    id: `sched-${now}-${Math.random().toString(36).slice(2, 7)}`,
    circleId,
    status: "pending",
    takenAt: null,
    createdAt: now,
  };

  const db = getDb();
  if (db) {
    try {
      await addDoc(collection(db, "circles", circleId, "schedules"), {
        kind: schedule.kind,
        name: schedule.name,
        dosage: schedule.dosage,
        emoji: schedule.emoji,
        time: schedule.time,
        elderName: schedule.elderName,
        status: "pending",
        takenAt: null,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Firestore write failed — keep the local copy
    }
  }

  const local = loadLocalSchedules(circleId);
  local.push(schedule);
  saveLocalSchedules(circleId, local);
  return schedule;
}

/**
 * Marks a schedule item as taken (or back to pending).
 * Updates Firestore (when configured) and localStorage immediately.
 */
export async function updateScheduleStatus(
  circleId: string,
  id: string,
  status: ScheduleStatus
): Promise<void> {
  const local = loadLocalSchedules(circleId);
  const idx = local.findIndex((s) => s.id === id);
  if (idx === -1) return;

  const now = Date.now();
  local[idx] = {
    ...local[idx],
    status,
    takenAt: status === "taken" ? now : null,
  };
  saveLocalSchedules(circleId, local);

  const db = getDb();
  if (db) {
    try {
      await updateDoc(doc(db, "circles", circleId, "schedules", id), {
        status,
        takenAt: status === "taken" ? serverTimestamp() : null,
      });
    } catch {
      // Firestore write failed — keep the local state
    }
  }
}

/**
 * Deletes a schedule item from Firestore (when configured) and localStorage.
 */
export async function deleteSchedule(circleId: string, id: string): Promise<void> {
  const local = loadLocalSchedules(circleId);
  const filtered = local.filter((s) => s.id !== id);
  saveLocalSchedules(circleId, filtered);

  const db = getDb();
  if (db) {
    try {
      await deleteDoc(doc(db, "circles", circleId, "schedules", id));
    } catch {
      // Firestore delete failed — keep the local copy removed
    }
  }
}

/**
 * Speaks a medication reminder via browser speech synthesis.
 * Reuses `speakPrompt` from `lib/voice-assistant.ts` — graceful no-op if
 * the Web Speech API is unavailable (SSR / unsupported browsers).
 */
export function speakReminder(text: string, lang: VoiceLang): void {
  speakPrompt(text, lang);
}

/**
 * Returns the next pending schedule item relative to "now", or `null` when
 * everything is taken / there are no items.
 *
 * Ties are broken by document order; times are compared as minutes-since-midnight
 * with wraparound (a 02:00 dose is "next" after a 23:00 dose on the same day).
 */
export function getNextReminderTime(items: ScheduleItem[]): ScheduleItem | null {
  const now = new Date();
  const nowMinutes =
    now.getHours() * 60 + now.getMinutes();

  let next: ScheduleItem | null = null;
  let nextGap = Infinity;

  for (const item of items) {
    if (item.status === "taken") continue;

    const parts = item.time.split(":");
    if (parts.length !== 2) continue;
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    const itemMinutes = hour * 60 + minute;

    // Minutes until this item's time today (wraps forward if already past).
    let gap = itemMinutes - nowMinutes;
    if (gap < 0) gap += 24 * 60;

    if (gap < nextGap) {
      nextGap = gap;
      next = item;
    }
  }

  return next;
}
