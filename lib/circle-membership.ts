import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDemoSession, setDemoCircleId } from "./auth";
import { ACTIVE_CIRCLE_ID } from "./circle-events";
import { getDb } from "./firebase";

/**
 * Real Firestore-backed circle membership (replaces the localStorage-only
 * logic in lib/circle-manager.ts for the auth flow — that module still backs
 * the header CircleSwitcher's list UI).
 *
 * Collections:
 *   circles/{circleId}  → { name, inviteCode, createdBy, createdAt, members: { [uid]: {...} } }
 *   users/{uid}         → { phone, displayName, circleId, createdAt }
 */

/** Invite alphabet: excludes ambiguous I, O, 0 and 1 (spoken/alphanumeric codes). */
export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;

/** Cryptographically-random 6-char invite code (Math.random fallback for old browsers). */
export function generateInviteCode(): string {
  const values = new Uint8Array(INVITE_CODE_LENGTH);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 256);
  }
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_ALPHABET[values[i] % INVITE_ALPHABET.length];
  }
  return code;
}

/** A user's resolved circle membership (what create/join return). */
export interface CircleMembership {
  circleId: string;
  circleName: string;
  inviteCode: string;
}

/** Member entry stored in the circle's members map, keyed by uid. */
interface MemberRecord {
  name: string;
  phone: string;
  status: "unknown";
  lastCheckIn: null;
  joinedAt: ReturnType<typeof serverTimestamp>;
}

/** Normalizes user-entered codes: uppercase, spaces/dashes stripped. */
function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Creates a circles/{circleId} doc with a generated 6-char invite code and a
 * members map keyed by uid, then points users/{uid}.circleId at it.
 */
export async function createCircle(
  uid: string,
  displayName: string,
  circleName: string
): Promise<CircleMembership> {
  const name = circleName.trim();
  if (!name) throw new Error("Circle name is required.");
  const inviteCode = generateInviteCode();

  const db = getDb();
  if (!db) {
    // Demo mode: no Firestore — park the session in the demo circle.
    setDemoCircleId(ACTIVE_CIRCLE_ID);
    return { circleId: ACTIVE_CIRCLE_ID, circleName: name, inviteCode };
  }

  // The phone lives on the profile created at login — read it for members.
  let phone = "";
  try {
    const profile = await getDoc(doc(db, "users", uid));
    phone = (profile.data()?.phone as string | undefined) ?? "";
  } catch {
    // profile unreadable — join with an empty phone; profile merge below still runs
  }

  const circleRef = await addDoc(collection(db, "circles"), {
    name,
    inviteCode,
    createdBy: uid,
    createdAt: serverTimestamp(),
    members: {
      [uid]: {
        name: displayName.trim() || "Member",
        phone,
        status: "unknown",
        lastCheckIn: null,
        joinedAt: serverTimestamp(),
      } satisfies MemberRecord,
    },
  });
  // Merge (not overwrite) so a missing profile doc is created safely.
  await setDoc(doc(db, "users", uid), { circleId: circleRef.id }, { merge: true });
  return { circleId: circleRef.id, circleName: name, inviteCode };
}

/**
 * Looks a circle up by invite code, adds the user to its members map and
 * points users/{uid}.circleId at it. Returns null when no circle matches.
 */
export async function joinCircleByInviteCode(
  uid: string,
  displayName: string,
  phone: string,
  code: string
): Promise<CircleMembership | null> {
  const normalized = normalizeInviteCode(code);
  if (normalized.length !== INVITE_CODE_LENGTH) return null;

  const db = getDb();
  if (!db) {
    // Demo mode: any well-formed code joins the demo circle.
    setDemoCircleId(ACTIVE_CIRCLE_ID);
    return {
      circleId: ACTIVE_CIRCLE_ID,
      circleName: "Sharma Family (Demo)",
      inviteCode: normalized,
    };
  }

  const snap = await getDocs(
    query(collection(db, "circles"), where("inviteCode", "==", normalized), limit(1))
  );
  if (snap.empty) return null;

  const circle = snap.docs[0];
  const circleName = (circle.data().name as string | undefined) ?? "Family Circle";
  await updateDoc(doc(db, "circles", circle.id), {
    [`members.${uid}`]: {
      name: displayName.trim() || "Member",
      phone,
      status: "unknown",
      lastCheckIn: null,
      joinedAt: serverTimestamp(),
    } satisfies MemberRecord,
  });
  await setDoc(doc(db, "users", uid), { circleId: circle.id }, { merge: true });
  return { circleId: circle.id, circleName, inviteCode: normalized };
}

/**
 * Reads users/{uid}.circleId. Returns null when the profile is missing or has
 * no circle yet; network/permission errors propagate so callers can show a
 * retryable error instead of silently routing into the wrong flow.
 * In demo mode (no Firestore) it returns the local demo session's circle id.
 */
export async function getUserCircleId(uid: string): Promise<string | null> {
  const db = getDb();
  if (!db) return getDemoSession()?.circleId ?? null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const circleId = snap.data()?.circleId;
  return typeof circleId === "string" && circleId.length > 0 ? circleId : null;
}

/**
 * Best-effort circle display name (used to label the header switcher).
 * Never throws — returns null when unavailable.
 */
export async function getCircleName(circleId: string): Promise<string | null> {
  if (!circleId) return null;
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "circles", circleId));
    if (!snap.exists()) return null;
    const name = snap.data()?.name;
    return typeof name === "string" && name ? name : null;
  } catch {
    return null;
  }
}
