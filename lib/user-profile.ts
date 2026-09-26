import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./firebase";

/** Shape of the users/{uid} profile document. */
export interface UserProfile {
  phone: string;
  displayName: string | null;
  circleId: string | null;
}

/**
 * Creates (or repairs) the users/{uid} profile on first successful login:
 *   { phone, displayName, circleId, createdAt }
 *
 * Repeat logins only backfill missing fields — an existing circleId is never
 * clobbered here (circle membership changes go through lib/circle-membership).
 * No-op in demo mode (no Firestore to write to).
 */
export async function ensureUserProfile(
  uid: string,
  phone: string,
  displayName: string | null = null
): Promise<void> {
  const db = getDb();
  if (!db) return; // demo mode: nothing to persist

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      phone,
      displayName,
      circleId: null,
      createdAt: serverTimestamp(),
    });
    return;
  }

  // Backfill anything missing without touching circleId (merge keeps it intact).
  const data = snap.data();
  const patch: { phone?: string; displayName?: string } = {};
  if (!data.phone) patch.phone = phone;
  if (displayName && !data.displayName) patch.displayName = displayName;
  if (Object.keys(patch).length > 0) {
    await setDoc(ref, patch, { merge: true });
  }
}
