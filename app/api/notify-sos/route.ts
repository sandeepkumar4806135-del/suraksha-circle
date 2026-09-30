import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/auth-server";
import {
  buildSosMessage,
  dispatchSosAlert,
  isTwilioConfigured,
  type SosDispatchPayload,
} from "@/lib/notifications";

export const runtime = "nodejs";

interface NotifySosBody {
  circleId?: unknown;
  raisedBy?: unknown;
  raisedByName?: unknown;
  location?: unknown;
  note?: unknown;
  recipients?: unknown;
}

/**
 * POST /api/notify-sos
 * Accepts an active SOS payload and dispatches emergency SMS/WhatsApp
 * messages to the listed recipients via Twilio. When Twilio credentials are
 * absent the handler runs in simulation mode (structured console preview) and
 * still returns 200 so the client's emergency flow is never blocked.
 *
 * Auth: real SMS costs money and rings real phones, so a valid Firebase ID
 * token is required whenever the project is configured (lib/auth-server).
 */
export async function POST(req: Request) {
  // --- Auth (before parsing anything the caller sent) -------------------
  const auth = await verifyIdToken(req);
  if (!auth.ok) {
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "suraksha-notify-sos",
        event: "rejected",
        reason: auth.reason,
      })
    );
    return NextResponse.json({ error: "Sign in required to send SOS alerts" }, { status: 401 });
  }

  let body: NotifySosBody;
  try {
    body = (await req.json()) as NotifySosBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { circleId, raisedBy, raisedByName, location, note, recipients } = body;

  // A signed-in caller may only raise alerts as themselves: the recipient gets
  // the raiser's name in the SMS, so a spoofed uid is rejected outright.
  if (typeof raisedBy === "string" && auth.uid && raisedBy !== auth.uid) {
    return NextResponse.json({ error: "raisedBy must match the signed-in user" }, { status: 403 });
  }

  // --- Validation ------------------------------------------------------
  if (typeof circleId !== "string" || circleId.length === 0) {
    return NextResponse.json({ error: "circleId is required" }, { status: 400 });
  }
  if (typeof raisedByName !== "string" || raisedByName.length === 0) {
    return NextResponse.json({ error: "raisedByName is required" }, { status: 400 });
  }
  if (
    !Array.isArray(recipients) ||
    recipients.length === 0 ||
    !recipients.every((r) => typeof r === "string" && /^\+?\d{8,15}$/.test(r))
  ) {
    return NextResponse.json(
      { error: "recipients must be a non-empty array of phone numbers (E.164-ish)" },
      { status: 400 }
    );
  }

  const payload: SosDispatchPayload = {
    circleId,
    raisedByName,
    location: typeof location === "string" ? location : undefined,
    note: typeof note === "string" ? note : undefined,
    // normalize to E.164 (prepend + when missing)
    recipients: (recipients as string[]).map((r) => (r.startsWith("+") ? r : `+${r}`)),
  };

  const { simulated, results } = await dispatchSosAlert(payload);

  return NextResponse.json(
    {
      ok: true,
      simulated,
      twilioConfigured: isTwilioConfigured(),
      preview: simulated ? buildSosMessage(payload) : undefined,
      results,
    },
    { status: 200 }
  );
}
