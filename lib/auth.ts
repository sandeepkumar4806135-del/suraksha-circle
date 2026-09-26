import type { ConfirmationResult, User } from "firebase/auth";
import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

/**
 * Phone (OTP) authentication for SurakshaCircle.
 *
 * All functions degrade gracefully: when the NEXT_PUBLIC_FIREBASE_* env vars
 * are missing the app runs in demo mode, sendOtp returns a clear
 * "auth not configured" error (never throws), and a local mock session keeps
 * the login flow testable during local development.
 */

/** The invisible reCAPTCHA widget binds to this element (rendered by the login page). */
const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

/** Result of sendOtp — success carries the ConfirmationResult, failure a readable error. */
export type SendOtpResult =
  | { ok: true; confirmation: ConfirmationResult }
  | { ok: false; error: string };

/** Local mock session used when Firebase is not configured (demo/dev mode). */
export interface DemoSession {
  uid: string;
  phone: string;
  circleId: string | null;
}

const DEMO_SESSION_KEY = "suraksha.demo-session";
const DEMO_AUTH_CHANGED = "suraksha:demo-auth-changed";

/** Reused across attempts; reset after every failure so the widget can re-render. */
let recaptchaVerifier: RecaptchaVerifier | null = null;

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Demo session (used only when Firebase is not configured)
// ---------------------------------------------------------------------------

/** Reads the local demo session, or null when signed out / SSR. */
export function getDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    return parsed && typeof parsed.uid === "string"
      ? { uid: parsed.uid, phone: parsed.phone ?? "", circleId: parsed.circleId ?? null }
      : null;
  } catch {
    return null;
  }
}

function writeDemoSession(session: DemoSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // storage full / private mode — session-only fallback, non-fatal
  }
  window.dispatchEvent(new Event(DEMO_AUTH_CHANGED));
}

/** Starts (or refreshes) the demo session for a phone number. */
export function startDemoSession(phone: string): DemoSession {
  const existing = getDemoSession();
  const session: DemoSession = existing ?? {
    uid: `demo-${Math.random().toString(36).slice(2, 10)}`,
    phone,
    circleId: null,
  };
  const next = { ...session, phone };
  writeDemoSession(next);
  return next;
}

/** Points the demo session at a circle id (demo create/join flow). */
export function setDemoCircleId(circleId: string): void {
  const session = getDemoSession();
  if (!session) return;
  writeDemoSession({ ...session, circleId });
}

/** Minimal User-shaped mock so demo mode flows through the same code paths. */
function makeMockUser(session: DemoSession): User {
  return {
    uid: session.uid,
    phoneNumber: session.phone,
    displayName: null,
    photoURL: null,
    email: null,
    emailVerified: false,
    isAnonymous: true,
    providerId: "phone",
    toJSON() {
      return { uid: session.uid, phoneNumber: session.phone };
    },
  } as unknown as User;
}

// ---------------------------------------------------------------------------
// Public auth API
// ---------------------------------------------------------------------------

/**
 * Sends an OTP to `phoneNumber` via an invisible reCAPTCHA bound to the
 * #recaptcha-container element. Never throws — failures (including Firebase
 * not being configured) come back as `{ ok: false, error }`.
 */
export async function sendOtp(phoneNumber: string): Promise<SendOtpResult> {
  if (!isFirebaseConfigured()) {
    return {
      ok: false,
      error:
        "Auth not configured: set the NEXT_PUBLIC_FIREBASE_* variables in .env.local to enable phone sign-in.",
    };
  }
  const auth = getFirebaseAuth();
  if (!auth) {
    return { ok: false, error: "Auth not configured: Firebase Auth is unavailable." };
  }
  try {
    // Recreate the widget on every send: a cached verifier can point at a
    // detached container after route changes (React unmounts/remounts the
    // #recaptcha-container div), which would break the next OTP request.
    try {
      recaptchaVerifier?.clear();
    } catch {
      // previous widget already detached
    }
    recaptchaVerifier = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, {
      size: "invisible",
    });
    const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
    return { ok: true, confirmation };
  } catch (err) {
    // A failed verifier cannot be reused — clear it so the next attempt re-renders.
    try {
      recaptchaVerifier?.clear();
    } catch {
      // already cleared
    }
    recaptchaVerifier = null;
    return { ok: false, error: toErrorMessage(err) };
  }
}

/** Confirms the OTP entered by the user and returns the signed-in Firebase User. */
export async function confirmOtp(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<User> {
  const credential = await confirmationResult.confirm(code);
  return credential.user;
}

/**
 * Mock confirm for demo mode (Firebase not configured): validates a 6-digit
 * code, starts the local demo session and returns a User-shaped object.
 */
export async function confirmDemoOtp(phone: string, code: string): Promise<User> {
  if (!/^\d{6}$/.test(code.trim())) {
    throw new Error("Enter the 6-digit code.");
  }
  return makeMockUser(startDemoSession(phone));
}

/**
 * Thin wrapper around onAuthStateChanged. In demo mode (Firebase not
 * configured) it emits the local mock session instead, re-emitting whenever
 * the demo session changes. Always invokes the callback asynchronously.
 * Returns an unsubscribe function.
 */
export function onAuthState(callback: (user: User | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  if (!isFirebaseConfigured()) {
    const emit = () => {
      const session = getDemoSession();
      callback(session ? makeMockUser(session) : null);
    };
    queueMicrotask(emit); // mirror Firebase's async initial emission
    const onChange = () => queueMicrotask(emit);
    window.addEventListener(DEMO_AUTH_CHANGED, onChange);
    window.addEventListener("storage", onChange); // cross-tab sync
    return () => {
      window.removeEventListener(DEMO_AUTH_CHANGED, onChange);
      window.removeEventListener("storage", onChange);
    };
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    queueMicrotask(() => callback(null));
    return () => undefined;
  }
  return onAuthStateChanged(auth, (user) => callback(user));
}

/** Signs the user out (Firebase + demo session). Never throws. */
export async function signOutUser(): Promise<void> {
  try {
    writeDemoSession(null);
  } catch {
    // non-fatal
  }
  const auth = getFirebaseAuth();
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("[Suraksha Circle] signOut failed:", err);
  }
}
