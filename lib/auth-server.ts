/**
 * SERVER-ONLY — verifies Firebase ID tokens on API routes.
 *
 * The web app has no service-account credentials, so instead of the Admin SDK
 * this uses the Identity Toolkit REST endpoint `accounts:lookup` together with
 * the project's public web API key. The key only identifies the project; the
 * token itself still has to be a genuinely signed-in, unexpired user, which is
 * what makes the emergency endpoints un-callable by strangers.
 */

/** Outcome of verifying a request's Firebase ID token. */
export interface IdTokenCheck {
  ok: boolean;
  /** Verified uid — present only when ok. */
  uid?: string;
  /** Short machine-readable reason; logged server-side, never echoed to callers. */
  reason?: string;
}

/** Reads `Bearer <token>` from the Authorization header (null when absent). */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Verifies the caller's Firebase ID token.
 *
 * - Firebase configured (`NEXT_PUBLIC_FIREBASE_API_KEY` present): a valid,
 *   enabled token is REQUIRED — anonymous or expired callers are rejected.
 * - Firebase not configured (offline demo deployment): verification is
 *   impossible, so the route stays open in simulation mode and logs a warning.
 *   This keeps the "never block the emergency flow" contract on demo builds.
 */
export async function verifyIdToken(req: Request): Promise<IdTokenCheck> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return { ok: true, reason: "firebase-unconfigured" };

  const token = bearerToken(req);
  if (!token) return { ok: false, reason: "missing-token" };

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        cache: "no-store",
      }
    );
    if (!res.ok) return { ok: false, reason: `lookup-http-${res.status}` };
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; disabled?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return { ok: false, reason: "unknown-user" };
    if (user.disabled) return { ok: false, reason: "user-disabled" };
    return { ok: true, uid: user.localId };
  } catch (err) {
    console.warn("[Suraksha Circle] ID token verification failed:", err);
    return { ok: false, reason: "lookup-failed" };
  }
}
