import { NextResponse } from "next/server";
import {
  dispatchSosPush,
  isFcmConfigured,
  type PushDispatchPayload,
} from "@/lib/fcm-server";

export const runtime = "nodejs";

interface SendPushBody {
  circleId?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
}

/**
 * POST /api/send-push
 * Fans an emergency Web Push out to every registered device token saved under
 * the circle (circles/{circleId}/push_tokens in Firestore). When FCM service
 * account credentials are absent the handler runs in simulation mode (structured
 * console preview) and still returns 200 so the emergency flow is never blocked.
 */
export async function POST(req: Request) {
  let json: SendPushBody;
  try {
    json = (await req.json()) as SendPushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { circleId, title, body, url, tag } = json;

  // --- Validation ------------------------------------------------------
  if (typeof circleId !== "string" || circleId.length === 0) {
    return NextResponse.json({ error: "circleId is required" }, { status: 400 });
  }
  if (typeof title !== "string" || title.length === 0 || title.length > 200) {
    return NextResponse.json(
      { error: "title is required (max 200 chars)" },
      { status: 400 }
    );
  }
  if (typeof body !== "string" || body.length === 0 || body.length > 500) {
    return NextResponse.json(
      { error: "body is required (max 500 chars)" },
      { status: 400 }
    );
  }

  const payload: PushDispatchPayload = {
    circleId,
    title,
    body,
    url: typeof url === "string" ? url : "/",
    tag: typeof tag === "string" ? tag : "suraksha-sos",
  };

  try {
    const summary = await dispatchSosPush(payload);
    return NextResponse.json(
      {
        ok: true,
        simulated: summary.simulated,
        fcmConfigured: isFcmConfigured(),
        sent: summary.sent,
        failed: summary.failed,
        results: summary.results,
      },
      { status: 200 }
    );
  } catch (err) {
    // Push is best-effort: a transient failure must never break the SOS flow.
    console.error(
      JSON.stringify({
        level: "error",
        service: "suraksha-push",
        error: err instanceof Error ? err.message : "unknown error",
      })
    );
    return NextResponse.json(
      { ok: false, error: "Push dispatch failed" },
      { status: 200 }
    );
  }
}
