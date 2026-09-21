import type { Messaging } from "firebase/messaging";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Public Firebase web config, sourced from NEXT_PUBLIC_FIREBASE_* env vars.
 * All of these are safe to expose to the browser (see Firebase security docs).
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when every required public Firebase key is present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

let app: FirebaseApp | null = null;

function getAppSafe(): FirebaseApp | null {
  if (app) return app;
  if (!isFirebaseConfigured()) {
    // Graceful fallback: never crash during static prerendering / initial setup.
    if (typeof window !== "undefined") {
      console.warn(
        "[Suraksha Circle] Firebase is not configured — set the " +
          "NEXT_PUBLIC_FIREBASE_* variables in .env.local. " +
          "The app will run in offline demo mode until then."
      );
    }
    return null;
  }
  try {
    // Guard against "app already exists" during dev hot-reload.
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return app;
  } catch (err) {
    console.warn("[Suraksha Circle] Firebase failed to initialize:", err);
    return null;
  }
}

/**
 * Firestore instance, or null when Firebase is not configured.
 * Consumers must null-check and fall back to demo data.
 */
export function getDb(): Firestore | null {
  const a = getAppSafe();
  if (!a) return null;
  try {
    return getFirestore(a);
  } catch {
    return null;
  }
}

/** Public web config used by FCM Web Push (client + service-worker URL). */
export interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  /** VAPID key for Web Push — Project Settings → Cloud Messaging. */
  vapidKey: string;
}

/**
 * Public Firebase web config including the VAPID key, or null when either the
 * base web config or the push VAPID key is missing (push stays disabled).
 */
export function getPublicFirebaseConfig(): PublicFirebaseConfig | null {
  if (!isFirebaseConfigured()) return null;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
  if (!vapidKey) return null;
  return {
    apiKey: firebaseConfig.apiKey as string,
    authDomain: firebaseConfig.authDomain as string,
    projectId: firebaseConfig.projectId as string,
    messagingSenderId: firebaseConfig.messagingSenderId as string,
    appId: firebaseConfig.appId as string,
    vapidKey,
  };
}

/** True when FCM Web Push is fully configured (web config + VAPID key). */
export function isMessagingConfigured(): boolean {
  return getPublicFirebaseConfig() !== null;
}

/**
 * FCM Messaging instance, or null when Firebase/VAPID is not configured or the
 * browser does not support Web Push. Lazily imports `firebase/messaging` so it
 * is never bundled into pages that do not use push.
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  const a = getAppSafe();
  if (!a || !isMessagingConfigured()) return null;
  try {
    const { getMessaging, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return null;
    return getMessaging(a);
  } catch {
    return null;
  }
}

/**
 * Firebase Auth instance, or null when Firebase is not configured.
 */
export function getFirebaseAuth(): Auth | null {
  const a = getAppSafe();
  if (!a) return null;
  try {
    return getAuth(a);
  } catch {
    return null;
  }
}

/** Nullable module-level instances, ready for direct import. */
export const db: Firestore | null = getDb();
export const auth: Auth | null = getFirebaseAuth();

/** True when the app should render demo data instead of live Firestore data. */
export function isDemoMode(): boolean {
  return getDb() === null;
}
