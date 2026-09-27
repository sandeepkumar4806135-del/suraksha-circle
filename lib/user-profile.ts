import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./firebase";

/** Shape of the users/{uid} profile document. */
export interface UserProfile {
  phone: string;
  displayName: string | null;
  circleId: string | null;
  email?: string | null;
  createdAt?: unknown;
}

/**
 * Creates (or repairs) the users/{uid} profile on first successful login:
 *   { phone, displayName, circleId, createdAt, email }
 *
 * Accommodates phone login users (verified phone) as well as Google / OAuth
 * users (email + displayName, phone possibly empty until onboarding).
 *
 * Repeat logins only backfill missing fields — an existing circleId is never
 * clobbered here (circle membership changes go through lib/circle-membership).
 * No-op in demo mode (no Firestore to write to).
 */
export async function ensureUserProfile(
  uid: string,
  phone: string = "",
  displayName: string | null = null,
  email: string | null = null
): Promise<void> {
  const db = getDb();
  if (!db) return; // demo mode: nothing to persist

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const initialDoc: Record<string, unknown> = {
      phone: phone || "",
      displayName: displayName ?? null,
      circleId: null,
      createdAt: serverTimestamp(),
    };
    if (email) initialDoc.email = email;
    await setDoc(ref, initialDoc);
    return;
  }

  // Backfill anything missing without touching circleId (merge keeps it intact).
  const data = snap.data();
  const patch: { phone?: string; displayName?: string; email?: string } = {};
  if (phone && !data.phone) patch.phone = phone;
  if (displayName && !data.displayName) patch.displayName = displayName;
  if (email && !data.email) patch.email = email;
  if (Object.keys(patch).length > 0) {
    await setDoc(ref, patch, { merge: true });
  }
}

/** Updates a user's phone number on their profile document. */
export async function updateUserPhone(uid: string, phone: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(doc(db, "users", uid), { phone }, { merge: true });
}

/**
 * Reads a user's profile document.
 * Returns null if the profile doesn't exist or in demo mode without DB.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      phone: typeof data.phone === "string" ? data.phone : "",
      displayName: typeof data.displayName === "string" ? data.displayName : null,
      circleId: typeof data.circleId === "string" ? data.circleId : null,
      email: typeof data.email === "string" ? data.email : null,
      createdAt: data.createdAt,
    };
  } catch {
    return null;
  }
}
