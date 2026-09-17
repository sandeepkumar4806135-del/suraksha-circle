import { NextResponse } from "next/server";
import {
  buildSosMessage,
  dispatchSosAlert,
  isTwilioConfigured,
  type SosDispatchPayload,
} from "@/lib/notifications";

export const runtime = "nodejs";

interface NotifySosBody {
  circleId?: unknown;
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
 */
export async function POST(req: Request) {
  let body: NotifySosBody;
  try {
    body = (await req.json()) as NotifySosBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { circleId, raisedByName, location, note, recipients } = body;

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
