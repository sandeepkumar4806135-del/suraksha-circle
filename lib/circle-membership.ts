import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
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
  status: CircleMemberStatus;
  lastCheckIn: null;
  joinedAt: ReturnType<typeof serverTimestamp>;
}

/**
 * Invite-code lookup collection: `circleInvites/{CODE} → { circleId, circleName, createdBy }`.
 * Circles themselves are member-readable only, so a joiner resolves the code
 * here instead of querying/reading circles they don't belong to yet.
 */
const INVITE_COLLECTION = "circleInvites";

/** Member statuses stored on `circles/{id}.members.{uid}.status`. */
export type CircleMemberStatus = "unknown" | "safe" | "travel" | "attention";

/** A normalized member entry from `circles/{circleId}.members`. */
export interface CircleMember {
  /** Real auth uid, or `invited-…` for a placeholder that has no account yet. */
  uid: string;
  name: string;
  phone: string;
  status: CircleMemberStatus;
  /** Epoch ms of the member's last check-in (null = never). */
  lastCheckInMs: number | null;
  /** True when the entry is a placeholder for someone who hasn't joined yet. */
  invited: boolean;
  role: string;
  city: string;
  /** Medical card the member saved on their own entry (null = none yet). */
  emergencyCard: EmergencyCard | null;
  /** Last position the member chose to share (null = not sharing). */
  location: MemberLocation | null;
}

/** A member's own medical emergency card, stored on their circle entry. */
export interface EmergencyCard {
  bloodGroup: string;
  age: number | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  hospital: string;
  doctor: string;
  insurance: string;
  /** Anything a responder should know before treating (free text). */
  note: string;
}

/**
 * Last position a member published to their own circle entry
 * (`circles/{id}.members.{uid}.location`) while live location sharing is on.
 */
export interface MemberLocation {
  lat: number;
  lng: number;
  /** Epoch ms of the last publish (null while the server timestamp is pending). */
  updatedAtMs: number | null;
}

/** What `subscribeToCircleMembers` emits for one circle document. */
export interface CircleMembersSnapshot {
  circleId: string;
  circleName: string;
  members: CircleMember[];
}

/** Minimal circle descriptor used by the header switcher. */
export interface CircleSummary {
  id: string;
  name: string;
}

/** A pending invitation for someone who hasn't signed up yet. */
export interface CircleInvite {
  id: string;
  name: string;
  role: string;
  city: string;
  addedBy: string;
  createdAtMs: number | null;
}

const MEMBER_STATUSES: CircleMemberStatus[] = ["unknown", "safe", "travel", "attention"];

/** Firestore Timestamp | number | {seconds} → epoch ms (null when unusable). */
function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "seconds" in value) {
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === "number") return seconds * 1000;
  }
  return null;
}

/** Trims, caps and drops empty entries from a stored string list. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 120))
    .slice(0, 20);
}

/** A blank emergency card — used to seed the card editor. */
export function emptyEmergencyCard(): EmergencyCard {
  return {
    bloodGroup: "",
    age: null,
    allergies: [],
    conditions: [],
    medications: [],
    hospital: "",
    doctor: "",
    insurance: "",
    note: "",
  };
}

/** True when the card carries no information at all (nothing worth saving). */
export function isEmergencyCardEmpty(card: EmergencyCard): boolean {
  return (
    !card.bloodGroup.trim() &&
    card.age === null &&
    !card.note.trim() &&
    !card.hospital.trim() &&
    !card.doctor.trim() &&
    !card.insurance.trim() &&
    card.allergies.length === 0 &&
    card.conditions.length === 0 &&
    card.medications.length === 0
  );
}

/**
 * Normalizes a stored emergency card. Returns null when the member has no card
 * (or it holds no information) so callers can render an empty state instead of
 * a card full of blanks.
 */
export function normalizeEmergencyCard(value: unknown): EmergencyCard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const age = typeof raw.age === "number" && Number.isFinite(raw.age) ? Math.round(raw.age) : null;
  const card: EmergencyCard = {
    bloodGroup: typeof raw.bloodGroup === "string" ? raw.bloodGroup.trim() : "",
    age,
    allergies: toStringList(raw.allergies),
    conditions: toStringList(raw.conditions),
    medications: toStringList(raw.medications),
    hospital: typeof raw.hospital === "string" ? raw.hospital.trim() : "",
    doctor: typeof raw.doctor === "string" ? raw.doctor.trim() : "",
    insurance: typeof raw.insurance === "string" ? raw.insurance.trim() : "",
    note: typeof raw.note === "string" ? raw.note.trim() : "",
  };
  return isEmergencyCardEmpty(card) ? null : card;
}

/**
 * Normalizes a stored shared location. Returns null when the member isn't
 * sharing (missing, malformed, or the 0,0 "null island" placeholder).
 */
function normalizeLocation(value: unknown): MemberLocation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if ((lat === 0 && lng === 0) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng, updatedAtMs: toMillis(raw.updatedAt) };
}

/** Shape actually written to Firestore (field-capped, no empty noise). */
function toStoredCard(card: EmergencyCard): Record<string, unknown> {
  return {
    bloodGroup: card.bloodGroup.trim().slice(0, 8),
    age: card.age,
    allergies: toStringList(card.allergies),
    conditions: toStringList(card.conditions),
    medications: toStringList(card.medications),
    hospital: card.hospital.trim().slice(0, 200),
    doctor: card.doctor.trim().slice(0, 200),
    insurance: card.insurance.trim().slice(0, 200),
    note: card.note.trim().slice(0, 500),
  };
}

/** Normalizes one raw members-map entry (never throws on unknown shapes). */
export function normalizeCircleMember(uid: string, data: DocumentData | undefined): CircleMember {
  const raw = (data ?? {}) as Record<string, unknown>;
  const rawStatus = raw.status as string | undefined;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Member";
  return {
    uid,
    name,
    phone: typeof raw.phone === "string" ? raw.phone : "",
    status: MEMBER_STATUSES.includes(rawStatus as CircleMemberStatus)
      ? (rawStatus as CircleMemberStatus)
      : "unknown",
    lastCheckInMs: toMillis(raw.lastCheckIn),
    // Placeholders created from "Add Member" carry an `invited-…` key.
    invited: uid.startsWith("invited-") || raw.invited === true,
    role: typeof raw.role === "string" ? raw.role : "",
    city: typeof raw.city === "string" ? raw.city : "",
    emergencyCard: normalizeEmergencyCard(raw.emergencyCard),
    location: normalizeLocation(raw.location),
  };
}

/** True when the uid appears in a members map (own-property check). */
function hasMember(members: unknown, uid: string): boolean {
  return Boolean(
    members &&
      typeof members === "object" &&
      Object.prototype.hasOwnProperty.call(members as Record<string, unknown>, uid)
  );
}

/** Normalizes user-entered codes: uppercase, spaces/dashes stripped. */
function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Reserves an invite code → circle lookup so a joiner can resolve a code without
 * read access to circles they don't belong to yet. Retries on collisions.
 */
async function reserveInviteCode(circleId: string, circleName: string, uid: string): Promise<string> {
  const db = getDb();
  let code = generateInviteCode();
  if (!db) return code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (!(await getDoc(doc(db, INVITE_COLLECTION, code))).exists()) {
        await setDoc(doc(db, INVITE_COLLECTION, code), {
          circleId,
          circleName,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        return code;
      }
    } catch (err) {
      console.warn("[Suraksha Circle] Invite code reservation failed:", err);
    }
    code = generateInviteCode();
  }
  return code;
}

/**
 * Resolves an invite code to its circle: lookup doc first, legacy
 * `circles.inviteCode` query second (for circles created before reservations).
 */
async function resolveInviteCode(normalized: string): Promise<CircleSummary | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const invite = await getDoc(doc(db, INVITE_COLLECTION, normalized));
    if (invite.exists()) {
      const data = invite.data();
      const circleId = typeof data?.circleId === "string" ? data.circleId : "";
      if (circleId) {
        return {
          id: circleId,
          name:
            typeof data?.circleName === "string" && data.circleName ? data.circleName : "Family Circle",
        };
      }
    }
  } catch (err) {
    console.warn("[Suraksha Circle] Invite lookup failed:", err);
  }
  try {
    const snap = await getDocs(
      query(collection(db, "circles"), where("inviteCode", "==", normalized), limit(1))
    );
    if (!snap.empty) {
      const data = snap.docs[0].data();
      return {
        id: snap.docs[0].id,
        name: typeof data?.name === "string" && data.name ? data.name : "Family Circle",
      };
    }
  } catch {
    // Not permitted under member-only read rules — no legacy circle to resolve.
  }
  return null;
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

  const db = getDb();
  if (!db) {
    // Demo mode: no Firestore — park the session in the demo circle.
    setDemoCircleId(ACTIVE_CIRCLE_ID);
    return { circleId: ACTIVE_CIRCLE_ID, circleName: name, inviteCode: generateInviteCode() };
  }

  // Pre-allocate the id so the invite code can be reserved before the circle
  // exists (circles are member-readable only, so joiners resolve codes there).
  const circleRef = doc(collection(db, "circles"));
  const inviteCode = await reserveInviteCode(circleRef.id, name, uid);

  // The phone lives on the profile created at login — read it for members.
  let phone = "";
  try {
    const profile = await getDoc(doc(db, "users", uid));
    phone = (profile.data()?.phone as string | undefined) ?? "";
  } catch {
    // profile unreadable — join with an empty phone; profile merge below still runs
  }

  await setDoc(circleRef, {
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

  // Resolve the code through the invite lookup — circles are member-readable
  // only, so a joiner must not have to read (or query) circles by id.
  const target = await resolveInviteCode(normalized);
  if (!target) return null;

  await updateDoc(doc(db, "circles", target.id), {
    [`members.${uid}`]: {
      name: displayName.trim() || "Member",
      phone,
      status: "unknown",
      lastCheckIn: null,
      joinedAt: serverTimestamp(),
    } satisfies MemberRecord,
  });
  await setDoc(doc(db, "users", uid), { circleId: target.id }, { merge: true });
  return { circleId: target.id, circleName: target.name, inviteCode: normalized };
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
// ---------------------------------------------------------------------------
// Live circle state — members, presence and secure switching
// ---------------------------------------------------------------------------

/**
 * Subscribes to `circles/{circleId}` and emits a normalized members list.
 * Returns an unsubscribe function. When Firestore isn't configured the callback
 * receives null so callers can fall back to their demo fixtures.
 */
export function subscribeToCircleMembers(
  circleId: string,
  onData: (snapshot: CircleMembersSnapshot | null) => void,
  onError?: (error: unknown) => void
): () => void {
  const db = getDb();
  if (!db || !circleId) {
    onData(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, "circles", circleId),
    (snap) => {
      if (!snap.exists()) {
        onData({ circleId, circleName: "", members: [] });
        return;
      }
      const data = snap.data();
      const members = data?.members;
      onData({
        circleId,
        circleName: typeof data?.name === "string" ? data.name : "",
        members:
          members && typeof members === "object"
            ? Object.entries(members as Record<string, DocumentData>).map(([uid, record]) =>
                normalizeCircleMember(uid, record)
              )
            : [],
      });
    },
    (error) => {
      console.warn("[Suraksha Circle] Members listener failed:", error);
      onError?.(error);
    }
  );
}

/**
 * Subscribes to pending invitations (`circles/{circleId}/invites`) — people the
 * circle added by name before they had an account. Emits [] when unavailable.
 */
export function subscribeToCircleInvites(
  circleId: string,
  onData: (invites: CircleInvite[]) => void
): () => void {
  const db = getDb();
  if (!db || !circleId) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, "circles", circleId, "invites"), orderBy("createdAt", "desc")),
    (snap) => {
      onData(
        snap.docs.map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            name: typeof data?.name === "string" && data.name ? data.name : "Member",
            role: typeof data?.role === "string" ? data.role : "",
            city: typeof data?.city === "string" ? data.city : "",
            addedBy: typeof data?.addedBy === "string" ? data.addedBy : "",
            createdAtMs: toMillis(data?.createdAt),
          };
        })
      );
    },
    (error) => {
      console.warn("[Suraksha Circle] Invite listener failed:", error);
      onData([]);
    }
  );
}

/** Records "I'm Safe" on the signed-in member's own entry. */
export async function markMemberCheckIn(circleId: string, uid: string): Promise<boolean> {
  const db = getDb();
  if (!db || !circleId || !uid) return false;
  try {
    await updateDoc(doc(db, "circles", circleId), {
      [`members.${uid}.status`]: "safe",
      [`members.${uid}.lastCheckIn`]: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.warn("[Suraksha Circle] Check-in write failed:", err);
    return false;
  }
}

/** Updates the signed-in member's own presence status (e.g. travelling). */
export async function setMemberStatus(
  circleId: string,
  uid: string,
  status: CircleMemberStatus
): Promise<boolean> {
  const db = getDb();
  if (!db || !circleId || !uid) return false;
  try {
    await updateDoc(doc(db, "circles", circleId), { [`members.${uid}.status`]: status });
    return true;
  } catch (err) {
    console.warn("[Suraksha Circle] Status write failed:", err);
    return false;
  }
}

/**
 * Stores the caller's own phone on `members.{uid}.phone` so the circle can call
 * them in an emergency. The rules only allow writes to the caller's OWN member
 * entry, so this can never rewrite somebody else's number.
 */
export async function updateMemberPhone(
  circleId: string,
  uid: string,
  phone: string
): Promise<boolean> {
  const db = getDb();
  if (!db || !circleId || !uid) return false;
  const clean = phone.trim().slice(0, 32);
  if (!/^\+?\d{8,15}$/.test(clean)) return false;
  try {
    await updateDoc(doc(db, "circles", circleId), { [`members.${uid}.phone`]: clean });
    return true;
  } catch (err) {
    console.warn("[Suraksha Circle] Phone write failed:", err);
    return false;
  }
}

/**
 * Saves the caller's own medical emergency card on their member entry, where
 * everyone in the circle can read it during an emergency (the users/{uid}
 * profile document is owner-only readable, so the card cannot live there).
 */
export async function saveMemberEmergencyCard(
  circleId: string,
  uid: string,
  card: EmergencyCard
): Promise<boolean> {
  const db = getDb();
  if (!db || !circleId || !uid || isEmergencyCardEmpty(card)) return false;
  try {
    await updateDoc(doc(db, "circles", circleId), {
      [`members.${uid}.emergencyCard`]: toStoredCard(card),
    });
    return true;
  } catch (err) {
    console.warn("[Suraksha Circle] Emergency card write failed:", err);
    return false;
  }
}

/**
 * Publishes — or clears — the caller's own shared position. Passing null stores
 * a delete sentinel, so switching location sharing off really removes the pin
 * instead of leaving a stale one behind.
 */
export async function setMemberLocationShare(
  circleId: string,
  uid: string,
  location: { lat: number; lng: number } | null
): Promise<boolean> {
  const db = getDb();
  if (!db || !circleId || !uid) return false;
  try {
    await updateDoc(doc(db, "circles", circleId), {
      [`members.${uid}.location`]: location
        ? { lat: location.lat, lng: location.lng, updatedAt: serverTimestamp() }
        : deleteField(),
    });
    return true;
  } catch (err) {
    console.warn("[Suraksha Circle] Location share write failed:", err);
    return false;
  }
}

/** True when uid is really listed in `circles/{circleId}.members`. */
export async function isCircleMember(circleId: string, uid: string): Promise<boolean> {
  if (!circleId || !uid) return false;
  const db = getDb();
  if (!db) return getDemoSession()?.circleId === circleId;
  try {
    const snap = await getDoc(doc(db, "circles", circleId));
    return snap.exists() && hasMember(snap.data()?.members, uid);
  } catch (err) {
    console.warn("[Suraksha Circle] Membership check failed:", err);
    return false;
  }
}

/**
 * Points users/{uid}.circleId at a circle — but only at one the user really
 * belongs to. Single gate for circle switching, so a tampered localStorage
 * value can never widen access.
 */
export async function setActiveCircleIdForUser(uid: string, circleId: string): Promise<boolean> {
  if (!uid || !circleId) return false;
  const db = getDb();
  if (!db) {
    setDemoCircleId(circleId);
    return true;
  }
  if (!(await isCircleMember(circleId, uid))) return false;
  try {
    await setDoc(doc(db, "users", uid), { circleId }, { merge: true });
    return true;
  } catch (err) {
    console.warn("[Suraksha Circle] Circle switch failed:", err);
    return false;
  }
}

/**
 * Every circle the user genuinely belongs to: the active one from their profile
 * plus any cached candidate ids that still list them as a member. Unverifiable
 * ids are dropped, so the switcher can never offer a circle the user doesn't own.
 */
export async function listMemberCircles(
  uid: string,
  candidateIds: string[] = []
): Promise<CircleSummary[]> {
  const db = getDb();
  if (!db || !uid) return [];

  const ids: string[] = [];
  const remember = (id?: string | null) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  try {
    remember(await getUserCircleId(uid));
  } catch {
    // profile unreadable — fall back to the cached candidate ids
  }
  candidateIds.forEach(remember);

  const circles: CircleSummary[] = [];
  for (const id of ids) {
    try {
      const snap = await getDoc(doc(db, "circles", id));
      if (!snap.exists() || !hasMember(snap.data()?.members, uid)) continue;
      const name = snap.data()?.name;
      circles.push({ id, name: typeof name === "string" && name ? name : "Family Circle" });
    } catch {
      // unreadable / not a member — skip instead of showing a broken entry
    }
  }
  return circles;
}

/**
 * Adds a named invitation under `circles/{circleId}/invites`. Members can read
 * these; the invitee shows as "Invite pending" until they join with a code.
 */
export async function addInvitedMember(
  circleId: string,
  addedBy: string,
  name: string,
  role: string,
  city: string
): Promise<CircleInvite | null> {
  const cleanName = name.trim();
  if (!circleId || !cleanName) return null;

  const draft: Omit<CircleInvite, "id" | "createdAtMs"> = {
    name: cleanName,
    role: role.trim(),
    city: city.trim(),
    addedBy,
  };
  const db = getDb();
  if (!db) {
    // Demo mode: session-only invite, still rendered as a pending row.
    return { ...draft, id: `invite-${Date.now()}`, createdAtMs: Date.now() };
  }
  try {
    const ref = doc(collection(db, "circles", circleId, "invites"));
    await setDoc(ref, { ...draft, createdAt: serverTimestamp() });
    return { ...draft, id: ref.id, createdAtMs: Date.now() };
  } catch (err) {
    console.warn("[Suraksha Circle] Invite write failed:", err);
    return null;
  }
}
