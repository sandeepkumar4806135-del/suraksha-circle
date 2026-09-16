import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  where,
  updateDoc,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";

export type CircleEventType =
  | "checkin"
  | "sos"
  | "sos-resolved"
  | "share-start"
  | "share-end"
  | "member-added"
  | "cascade";

export interface CircleEvent {
  id: string;
  circleId: string;
  type: CircleEventType;
  actorName: string;
  title: string;
  detail?: string;
  timestamp: number;
  active?: boolean;
}

export interface SosAlert {
  id: string;
  circleId: string;
  raisedBy: string;
  raisedByName: string;
  status: "active" | "resolved";
  note?: string;
  createdAt: number;
  resolvedAt: number | null;
}

export const ACTIVE_CIRCLE_ID = "sharma-family-circle";
const DEMO_BASE = Date.now();

export const DEMO_EVENTS: CircleEvent[] = [
  { id: "demo-1", circleId: ACTIVE_CIRCLE_ID, type: "share-end", actorName: "Brother", title: "Location share ended", detail: "Reached Thane safely", timestamp: DEMO_BASE - 720000 },
  { id: "demo-2", circleId: ACTIVE_CIRCLE_ID, type: "share-start", actorName: "Brother", title: "Live location share started", detail: "Mumbai to Thane", timestamp: DEMO_BASE - 2220000 },
  { id: "demo-3", circleId: ACTIVE_CIRCLE_ID, type: "checkin", actorName: "Papa", title: "Checked in at work", detail: "Andheri Office", timestamp: DEMO_BASE - 3900000 },
  { id: "demo-4", circleId: ACTIVE_CIRCLE_ID, type: "sos-resolved", actorName: "Grandma", title: "SOS alert resolved", detail: "Marked safe by Papa", timestamp: DEMO_BASE - 18000000 },
  { id: "demo-5", circleId: ACTIVE_CIRCLE_ID, type: "checkin", actorName: "Mummy", title: "Daily check-in", detail: "Safe at Home", timestamp: DEMO_BASE - 19200000 },
];

export const DEMO_ACTIVE_SOS: SosAlert | null = null;

function normalizeEvent(circleId: string, id: string, data: DocumentData): CircleEvent {
  const ts: unknown = data.timestamp;
  return {
    id,
    circleId,
    type: (data.type as CircleEventType) ?? "checkin",
    actorName: (data.actorName as string) ?? "Family",
    title: (data.title as string) ?? "Circle event",
    detail: data.detail ? (data.detail as string) : undefined,
    timestamp: ts instanceof Timestamp ? ts.toMillis() : typeof ts === "number" ? ts : Date.now(),
    active: Boolean(data.active),
  };
}

export function subscribeToCircleEvents(circleId: string, onData: (events: CircleEvent[]) => void, onError?: (err: unknown) => void): () => void {
  const db = getDb();
  if (!db) { onData([...DEMO_EVENTS]); return () => undefined; }
  const q = query(collection(db, "circles", circleId, "events"), orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, snap => onData(snap.docs.map(d => normalizeEvent(circleId, d.id, d.data()))), err => { onError?.(err); onData([...DEMO_EVENTS]); });
}

export async function pushCircleEvent(evt: Omit<CircleEvent, "id" | "timestamp"> & { timestamp?: number }): Promise<CircleEvent> {
  const full: CircleEvent = { ...evt, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: evt.timestamp ?? Date.now() };
  const db = getDb();
  if (db) { try { await addDoc(collection(db, "circles", evt.circleId, "events"), { type: evt.type, actorName: evt.actorName, title: evt.title, detail: evt.detail ?? "", active: evt.active ?? false, timestamp: serverTimestamp() }); } catch {} }
  return full;
}
// ---------------------------------------------------------------------------
// SOS EMERGENCY CASCADE
// Collection: sos_events (top-level), queried by circleId + status
// ---------------------------------------------------------------------------

const SOS_COLLECTION = "sos_events";

/**
 * Live-subscribes to ACTIVE SOS alerts for a circle.
 * Query: sos_events where circleId == circleId AND status == 'active',
 * ordered by createdAt descending.
 *
 * NOTE: requires a composite index on (circleId, status, createdAt).
 * Falls back to DEMO_ACTIVE_SOS when Firebase is not configured.
 */
export function subscribeToActiveSos(
  circleId: string,
  onData: (alert: SosAlert | null) => void,
  onError?: (err: unknown) => void
): () => void {
  const db = getDb();
  if (!db) {
    onData(DEMO_ACTIVE_SOS);
    return () => undefined;
  }
  const q = query(
    collection(db, SOS_COLLECTION),
    where("circleId", "==", circleId),
    where("status", "==", "active"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(null);
        return;
      }
      const d = snap.docs[0];
      const data = d.data();
      const created = data.createdAt;
      onData({
        id: d.id,
        circleId,
        raisedBy: (data.raisedBy as string) ?? "",
        raisedByName: (data.raisedByName as string) ?? "Family member",
        status: "active",
        note: data.note ? (data.note as string) : undefined,
        createdAt:
          created instanceof Timestamp
            ? created.toMillis()
            : typeof created === "number"
              ? created
              : Date.now(),
        resolvedAt: null,
      });
    },
    (err) => {
      onError?.(err);
      onData(null);
    }
  );
}

/**
 * Raises a new SOS alert in Firestore (when configured) and returns the
 * local proxy immediately so the banner can appear without waiting.
 */
export async function raiseSos(
  circleId: string,
  raisedBy: string,
  raisedByName: string,
  note?: string
): Promise<SosAlert> {
  const now = Date.now();
  const alert: SosAlert = {
    id: `sos-${now}-${Math.random().toString(36).slice(2, 7)}`,
    circleId,
    raisedBy,
    raisedByName,
    status: "active",
    note: note ?? undefined,
    createdAt: now,
    resolvedAt: null,
  };
  const db = getDb();
  if (db) {
    try {
      await addDoc(collection(db, SOS_COLLECTION), {
        circleId,
        raisedBy,
        raisedByName,
        status: "active",
        note: note ?? "",
        createdAt: serverTimestamp(),
        resolvedAt: null,
      });
    } catch {}
  }
  return alert;
}

/**
 * Resolves an active SOS alert in Firestore (when configured) and returns
 * a local proxy for the resolved state.
 */
export async function resolveSos(
  alert: SosAlert,
  resolvedByName: string
): Promise<SosAlert> {
  const now = Date.now();
  const resolved: SosAlert = { ...alert, status: "resolved", resolvedAt: now };
  const db = getDb();
  if (db) {
    try {
      await updateDoc(
        doc(db, SOS_COLLECTION, alert.id),
        { status: "resolved", resolvedByName, resolvedAt: serverTimestamp() }
      );
    } catch {}
  }
  return resolved;
}

export { isFirebaseConfigured };

