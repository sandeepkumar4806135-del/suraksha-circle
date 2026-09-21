/**
 * SERVER-ONLY module — imports Node runtime APIs (node:crypto, Buffer) and
 * reads secret env vars. Never import from client components.
 *
 * FCM HTTP v1 Web Push dispatch for Suraksha Circle emergency alerts.
 *
 * Credentials come from env (Project Settings → Service accounts):
 *   FIREBASE_CLIENT_EMAIL  – service-account email (…@…iam.gserviceaccount.com)
 *   FIREBASE_PRIVATE_KEY   – service-account private key (\n escapes OK)
 *   FIREBASE_PROJECT_ID    – or falls back to NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *
 * OAuth2: a signed RS256 JWT (node:crypto — no extra dependency) is exchanged
 * at https://oauth2.googleapis.com/token for an access token, cached until
 * expiry. The same token authorises both Firestore REST (token listing) and
 * FCM HTTP v1 (message sending).
 *
 * When credentials are missing the module runs in SIMULATION mode: it logs a
 * structured preview of the push it would have sent and returns success, so
 * dev builds and demos never crash on missing config (same pattern as the
 * Twilio dispatch in lib/notifications.ts).
 */
import crypto from "node:crypto";

export interface PushDispatchPayload {
  circleId: string;
  title: string;
  body: string;
  /** URL opened when the notification is tapped. */
  url?: string;
  /** Notification tag — replaces any prior notification with the same tag. */
  tag?: string;
}

export interface PushSendResult {
  /** Last 8 chars of the token — enough to debug, never the full secret. */
  tokenSuffix: string;
  ok: boolean;
  error?: string;
}

export interface PushDispatchSummary {
  simulated: boolean;
  sent: number;
  failed: number;
  results: PushSendResult[];
}

/** True when FCM server credentials are present. */
export function isFcmConfigured(): boolean {
  const { clientEmail, privateKey, projectId } = readServiceAccount();
  return Boolean(clientEmail && privateKey && projectId);
}

function readServiceAccount(): {
  clientEmail: string;
  privateKey: string;
  projectId: string;
} {
  return {
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    projectId:
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      "",
  };
}

/** Cached OAuth2 access token (module scope, refreshed before expiry). */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const FCM_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging " +
  "https://www.googleapis.com/auth/datastore";

/** Exchanges a signed service-account JWT for an OAuth2 access token. */
async function getAccessToken(): Promise<string> {
  const { clientEmail, privateKey } = readServiceAccount();
  if (!clientEmail || !privateKey) {
    throw new Error("FCM service account not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const encode = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
  };
  return cachedAccessToken.token;
}
/** Lists saved FCM tokens for a circle via the Firestore REST API. */
export async function listCircleTokens(circleId: string): Promise<string[]> {
  const { projectId } = readServiceAccount();
  const accessToken = await getAccessToken();
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/circles/${encodeURIComponent(circleId)}` +
    `/push_tokens?pageSize=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Firestore token list failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    documents?: Array<{
      fields?: Record<string, { stringValue?: string }>;
    }>;
  };
  const tokens: string[] = [];
  for (const d of data.documents ?? []) {
    const token = d.fields?.token?.stringValue;
    if (token) tokens.push(token);
  }
  return tokens;
}

/**
 * Sends one data-only Web Push via FCM HTTP v1. Data-only (no `notification`
 * block) so our service worker's onBackgroundMessage builds the loud,
 * high-priority system notification with the app's own icon and vibration.
 */
async function sendFcmToToken(
  token: string,
  p: PushDispatchPayload
): Promise<{ ok: boolean; error?: string }> {
  const { projectId } = readServiceAccount();
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            data: {
              title: p.title,
              body: p.body,
              url: p.url ?? "/",
              tag: p.tag ?? "suraksha-sos",
            },
            webpush: { fcmOptions: { link: p.url ?? "/" } },
          },
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        error: `FCM HTTP ${res.status}: ${errText.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

/**
 * Fans an emergency push out to every registered device in the circle.
 * In simulation mode it logs a structured preview and returns success.
 */
export async function dispatchSosPush(
  p: PushDispatchPayload
): Promise<PushDispatchSummary> {
  if (!isFcmConfigured()) {
    console.warn(
      JSON.stringify(
        {
          level: "warn",
          service: "suraksha-push",
          mode: "simulation",
          reason:
            "FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not set — no real push sent",
          wouldDispatch: p,
        },
        null,
        2
      )
    );
    return { simulated: true, sent: 0, failed: 0, results: [] };
  }

  const tokens = await listCircleTokens(p.circleId);
  const results: PushSendResult[] = await Promise.all(
    tokens.map(async (token) => {
      const r = await sendFcmToToken(token, p);
      return { tokenSuffix: token.slice(-8), ok: r.ok, error: r.error };
    })
  );
  return {
    simulated: false,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}


