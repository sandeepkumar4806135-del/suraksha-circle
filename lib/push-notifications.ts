/**
 * Client-side FCM Web Push plumbing for Suraksha Circle.
 *
 * Responsibilities:
 *   1. Ask for notification permission with a clear, friendly flow.
 *   2. Register /firebase-messaging-sw.js with the public web config as query
 *      params (a service worker cannot read Next.js env vars).
 *   3. Retrieve the FCM registration token and save it to Firestore under the
 *      active circle (circles/{circleId}/push_tokens) so /api/send-push can
 *      fan emergency alerts out to every registered family device.
 *   4. Mirror the enabled state in localStorage so the toggle reflects reality
 *      instantly — including in demo mode when Firebase is not configured.
 *
 * Everything fails soft: missing config or unsupported browsers surface a
 * status the UI can explain instead of throwing.
 */
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  getDb,
  getFirebaseMessaging,
  getPublicFirebaseConfig,
} from "./firebase";

export type PushEnableStatus =
  | "enabled"
  | "denied"
  | "unsupported"
  | "unconfigured"
  | "error";

export interface PushEnableResult {
  status: PushEnableStatus;
  token?: string;
  /** Human-readable explanation for non-success statuses. */
  reason?: string;
}

const LS_PREFIX = "suraksha.push.";

interface StoredPushState {
  enabled: boolean;
  token: string;
  ts: number;
}

function lsKey(circleId: string): string {
  return `${LS_PREFIX}${circleId}`;
}

function readStored(circleId: string): StoredPushState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lsKey(circleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPushState;
    return parsed && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(circleId: string, state: StoredPushState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(circleId), JSON.stringify(state));
  } catch {
    // storage full / private mode — non-fatal
  }
}

function clearStored(circleId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(lsKey(circleId));
  } catch {
    // non-fatal
  }
}

/** Browser support check for Web Push + notifications + service workers. */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

/** Current notification permission, or "unsupported" outside the browser. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Mirrored enabled state (instant, works without Firebase too). */
export function isPushEnabled(circleId: string): boolean {
  return readStored(circleId)?.enabled === true;
}

/**
 * Deterministic Firestore doc id for an FCM token. FCM tokens are URL-safe
 * (A-Za-z0-9_-) so this is effectively the token itself; sanitising anyway
 * keeps Firestore's doc-id rules happy in every case.
 */
function tokenDocId(token: string): string {
  return `tok-${token.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Registers the FCM service worker with the public web config as query params. */
async function ensureFcmSwRegistration(): Promise<ServiceWorkerRegistration> {
  const cfg = getPublicFirebaseConfig();
  if (!cfg) throw new Error("firebase-not-configured");
  const params = new URLSearchParams({
    apiKey: cfg.apiKey,
    senderId: cfg.messagingSenderId,
    projectId: cfg.projectId,
    appId: cfg.appId,
  });
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`
  );
  await navigator.serviceWorker.ready;
  return registration;
}

/** Saves (upserts) a device token under the active circle in Firestore. */
async function saveTokenToCircle(
  circleId: string,
  token: string,
  memberName: string
): Promise<void> {
  const db = getDb();
  if (!db) return; // demo mode — localStorage mirror only
  await setDoc(
    doc(db, "circles", circleId, "push_tokens", tokenDocId(token)),
    {
      token,
      memberName,
      platform: "web",
      ua:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 180)
          : "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Full opt-in flow: permission → service worker → FCM token → Firestore save.
 * Returns a structured status so the UI can explain exactly what happened.
 */
export async function enablePushNotifications(
  circleId: string,
  memberName = "Family member"
): Promise<PushEnableResult> {
  const cfg = getPublicFirebaseConfig();
  if (!isPushSupported()) {
    return {
      status: "unsupported",
      reason: "This browser does not support web push notifications.",
    };
  }
  if (!cfg) {
    return {
      status: "unconfigured",
      reason: "Web push is not configured on this deployment.",
    };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  if (permission !== "granted") {
    return {
      status: "denied",
      reason: "Notification permission was not granted.",
    };
  }

  try {
    const registration = await ensureFcmSwRegistration();
    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      return {
        status: "unconfigured",
        reason: "Web push is not supported in this browser session.",
      };
    }
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
      vapidKey: cfg.vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      return { status: "error", reason: "Could not obtain a push token." };
    }
    await saveTokenToCircle(circleId, token, memberName);
    writeStored(circleId, { enabled: true, token, ts: Date.now() });
    return { status: "enabled", token };
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "Unknown push error",
    };
  }
}

/** Opt-out: revokes the FCM token, deletes the Firestore doc, clears state. */
export async function disablePushNotifications(circleId: string): Promise<void> {
  const stored = readStored(circleId);
  clearStored(circleId);

  try {
    const messaging = await getFirebaseMessaging();
    if (messaging) {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(messaging);
    }
  } catch {
    // best-effort — token may already be gone
  }

  const db = getDb();
  if (db && stored?.token) {
    try {
      await deleteDoc(
        doc(db, "circles", circleId, "push_tokens", tokenDocId(stored.token))
      );
    } catch {
      // best-effort — the server prunes dead tokens on send failures
    }
  }
}

/**
 * Foreground (app open) message handler → callback. Returns an unsubscribe
 * function; a no-op when push is unavailable so callers can always clean up.
 */
export async function subscribeToForegroundPush(
  onForegroundMessage: (title: string, body: string) => void
): Promise<() => void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => undefined;
  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, (payload) => {
    const data = (payload.data ?? {}) as Record<string, string>;
    const title =
      data.title ?? payload.notification?.title ?? "Suraksha Circle";
    const body =
      data.body ??
      payload.notification?.body ??
      "A family member needs your attention.";
    onForegroundMessage(title, body);
  });
}

