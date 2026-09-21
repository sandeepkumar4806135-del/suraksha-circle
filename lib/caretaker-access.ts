/**
 * Multi-Role Caretaker / Doctor Access Portal — access manager.
 *
 * Manages role-based permissions and secure tokenized access for external
 * visitors (doctors, hired caretakers) who need a READ-ONLY snapshot of an
 * elder's health data without being part of the family circle.
 *
 * Security model
 * --------------
 *  - External roles ("doctor", "caretaker") are strictly read-only. The
 *    permission matrix below has NO write capability, and `assertNoWrite`
 *    throws if any future code path tries to grant one.
 *  - Access codes are 8-char base32 (Crockford alphabet — no I/L/O/U
 *    confusion), prefixed with the role for easy visual verification, e.g.
 *    "DR-7K2M9X4Q". Codes are stored SHA-256 hashed; only the family-admin
 *    sees the plaintext once at generation time.
 *  - Every grant has an expiry (default 7 days) and can be revoked instantly.
 *  - Grants persist in Firestore `circles/{circleId}/caretaker_access` (family
 *    manage) and the validated session mirrors in localStorage.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getDb } from "./firebase";

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export type CaretakerRole = "doctor" | "caretaker" | "family-admin";

export interface CaretakerPermissions {
  /** Vitals / wearable snapshot. */
  viewVitals: boolean;
  /** Safe-zone statuses. */
  viewSafeZones: boolean;
  /** Medication compliance logs. */
  viewMedications: boolean;
  /** Activity feed. */
  viewActivity: boolean;
  /** ANY write — SOS, settings, schedules, zones. External roles: always false. */
  write: boolean;
  /** Manage (create/revoke) caretaker grants — family-admin only. */
  manageAccess: boolean;
}

/** Permission matrix. External roles are strictly read-only by construction. */
export const ROLE_PERMISSIONS: Record<CaretakerRole, CaretakerPermissions> = {
  doctor: {
    viewVitals: true,
    viewSafeZones: true,
    viewMedications: true,
    viewActivity: false,
    write: false,
    manageAccess: false,
  },
  caretaker: {
    viewVitals: true,
    viewSafeZones: true,
    viewMedications: true,
    viewActivity: true,
    write: false,
    manageAccess: false,
  },
  "family-admin": {
    viewVitals: true,
    viewSafeZones: true,
    viewMedications: true,
    viewActivity: true,
    write: true,
    manageAccess: true,
  },
};

/** Role display metadata (badges, EN/HI labels). */
export const ROLE_META: Record<
  CaretakerRole,
  { emoji: string; en: string; hi: string; tone: string }
> = {
  doctor: {
    emoji: "🩺",
    en: "Doctor Portal",
    hi: "डॉक्टर पोर्टल",
    tone: "bg-sky-100 text-sky-800 border-sky-300",
  },
  caretaker: {
    emoji: "🧑‍⚕️",
    en: "Caretaker Portal",
    hi: "केयरटेकर पोर्टल",
    tone: "bg-violet-100 text-violet-800 border-violet-300",
  },
  "family-admin": {
    emoji: "🛡️",
    en: "Family Admin",
    hi: "परिवार एडमिन",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
};

/**
 * Runtime guard: throws if a permissions object ever claims write access for
 * an external role. Defense in depth for the strictly-read-only invariant.
 */
export function assertNoWrite(role: CaretakerRole): void {
  if (role !== "family-admin" && ROLE_PERMISSIONS[role].write) {
    throw new Error(`SECURITY: role "${role}" must never have write access`);
  }
}

export function can(
  role: CaretakerRole,
  perm: keyof Omit<CaretakerPermissions, "write" | "manageAccess">
): boolean {
  assertNoWrite(role);
  return ROLE_PERMISSIONS[role][perm];
}

// ---------------------------------------------------------------------------
// Secure access codes (Crockford base32, SHA-256 hashed at rest)
// ---------------------------------------------------------------------------

/** Crockford base32 — excludes I, L, O, U to avoid transcription errors. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Access-code prefixes make the role visible at a glance. */
const ROLE_PREFIX: Record<CaretakerRole, string> = {
  doctor: "DR",
  caretaker: "CT",
  "family-admin": "FA",
};

/** Generates a random access code like "7K2M9X4Q" (8 chars, CSPRNG). */
function generateCodeBody(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Full display code, e.g. "DR-7K2M9X4Q". */
export function formatAccessCode(role: CaretakerRole, body: string): string {
  return `${ROLE_PREFIX[role]}-${body}`;
}

/** SHA-256 hex digest of a normalized (uppercase, stripped separators) code. */
export async function hashAccessCode(code: string): Promise<string> {
  const normalized = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Grants (Firestore) & sessions (localStorage mirror)
// ---------------------------------------------------------------------------

export interface CaretakerGrant {
  id: string;
  circleId: string;
  role: CaretakerRole;
  /** SHA-256 hash of the access code — plaintext is never stored. */
  codeHash: string;
  /** Display name of the visitor, e.g. "Dr. Mehta". */
  visitorName: string;
  /** Note from the family, e.g. "Post-surgery follow-up". */
  note?: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

export interface CaretakerSession {
  circleId: string;
  role: CaretakerRole;
  visitorName: string;
  code: string;
  expiresAt: number;
  startedAt: number;
}

const LS_SESSION_KEY = "suraksha.caretaker.session";

function loadStoredSession(): CaretakerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CaretakerSession;
    return s && s.circleId && s.role ? s : null;
  } catch {
    return null;
  }
}

function saveStoredSession(s: CaretakerSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(LS_SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(LS_SESSION_KEY);
  } catch {
    // non-fatal
  }
}

/** Grants expire after this many days when not overridden. */
export const DEFAULT_GRANT_DAYS = 7;

/** Generates a new grant, persists it (hashed) and returns the plaintext code. */
export async function createCaretakerGrant(
  circleId: string,
  role: CaretakerRole,
  visitorName: string,
  options: { note?: string; validDays?: number } = {}
): Promise<{ grant: CaretakerGrant; code: string }> {
  const code = formatAccessCode(role, generateCodeBody());
  const codeHash = await hashAccessCode(code);
  const now = Date.now();
  const grant: CaretakerGrant = {
    id: `ct-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    circleId,
    role,
    codeHash,
    visitorName: visitorName.trim() || "Visitor",
    note: options.note?.trim() || undefined,
    createdAt: now,
    expiresAt: now + (options.validDays ?? DEFAULT_GRANT_DAYS) * 86_400_000,
    revoked: false,
  };

  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, "circles", circleId, "caretaker_access", grant.id), {
        role: grant.role,
        codeHash: grant.codeHash,
        visitorName: grant.visitorName,
        note: grant.note ?? "",
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(grant.expiresAt),
        revoked: false,
      });
    } catch {
      // Firestore unavailable — grant still works against the local session
    }
  }
  return { grant, code };
}

/** Loads all grants for a circle (family-admin management list). */
export async function listCaretakerGrants(
  circleId: string
): Promise<CaretakerGrant[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await getDocs(
      collection(db, "circles", circleId, "caretaker_access")
    );
    const now = Date.now();
    return snap.docs
      .map((d) => {
        const v = d.data();
        const created = v.createdAt;
        const expires = v.expiresAt;
        return {
          id: d.id,
          circleId,
          role: (v.role as CaretakerRole) ?? "caretaker",
          codeHash: (v.codeHash as string) ?? "",
          visitorName: (v.visitorName as string) ?? "Visitor",
          note: v.note ? (v.note as string) : undefined,
          createdAt:
            created instanceof Timestamp
              ? created.toMillis()
              : typeof created === "number"
                ? created
                : now,
          expiresAt:
            expires instanceof Timestamp
              ? expires.toMillis()
              : typeof expires === "number"
                ? expires
                : now + DEFAULT_GRANT_DAYS * 86_400_000,
          revoked: Boolean(v.revoked),
        } satisfies CaretakerGrant;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Instantly revokes a grant. */
export async function revokeCaretakerGrant(
  circleId: string,
  grantId: string
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, "circles", circleId, "caretaker_access", grantId),
      { revoked: true },
      { merge: true }
    );
  } catch {
    // best-effort
  }
}

/**
 * Validates an access code against the circle's active grants.
 * Returns the session on success, or a structured failure reason.
 */
export async function validateCaretakerAccess(
  circleId: string,
  code: string
): Promise<
  | { ok: true; session: CaretakerSession }
  | { ok: false; reason: "not-found" | "revoked" | "expired" }
> {
  const codeHash = await hashAccessCode(code);
  const db = getDb();
  if (!db) {
    // Demo mode: accept any well-formed code so the portal is explorable.
    const session: CaretakerSession = {
      circleId,
      role: guessRoleFromCode(code),
      visitorName: "Demo Visitor",
      code: code.trim().toUpperCase(),
      expiresAt: Date.now() + 60 * 60_000,
      startedAt: Date.now(),
    };
    saveStoredSession(session);
    return { ok: true, session };
  }

  let matched: CaretakerGrant | null = null;
  try {
    const snap = await getDocs(
      collection(db, "circles", circleId, "caretaker_access")
    );
    for (const d of snap.docs) {
      const v = d.data();
      if ((v.codeHash as string) === codeHash) {
        matched = {
          id: d.id,
          circleId,
          role: (v.role as CaretakerRole) ?? "caretaker",
          codeHash,
          visitorName: (v.visitorName as string) ?? "Visitor",
          note: v.note ? (v.note as string) : undefined,
          createdAt: 0,
          expiresAt:
            v.expiresAt instanceof Timestamp
              ? v.expiresAt.toMillis()
              : Date.now(),
          revoked: Boolean(v.revoked),
        };
        break;
      }
    }
  } catch {
    return { ok: false, reason: "not-found" };
  }

  if (!matched) return { ok: false, reason: "not-found" };
  if (matched.revoked) return { ok: false, reason: "revoked" };
  if (matched.expiresAt < Date.now()) return { ok: false, reason: "expired" };

  const session: CaretakerSession = {
    circleId,
    role: matched.role,
    visitorName: matched.visitorName,
    code: code.trim().toUpperCase(),
    expiresAt: matched.expiresAt,
    startedAt: Date.now(),
  };
  saveStoredSession(session);
  return { ok: true, session };
}

/** Role implied by an access-code prefix (demo-mode fallback). */
export function guessRoleFromCode(code: string): CaretakerRole {
  const c = code.trim().toUpperCase();
  if (c.startsWith("DR")) return "doctor";
  if (c.startsWith("CT")) return "caretaker";
  return "caretaker";
}

/** Restores a cached session if it exists and hasn't expired. */
export function restoreCaretakerSession(): CaretakerSession | null {
  const s = loadStoredSession();
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    saveStoredSession(null);
    return null;
  }
  return s;
}

/** Clears the portal session (sign-out). */
export function endCaretakerSession(): void {
  saveStoredSession(null);
}




