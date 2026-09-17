/**
 * SERVER-ONLY module — imports Node runtime APIs (Buffer) and reads secret
 * env vars. Never import from client components.
 */

/**
 * Outbound emergency SMS/WhatsApp dispatch (Twilio REST API).
 *
 * Credentials come from env:
 *   TWILIO_ACCOUNT_SID   – e.g. ACxxxxxxxx
 *   TWILIO_AUTH_TOKEN    – Twilio auth token
 *   TWILIO_PHONE_NUMBER  – SMS sender, e.g. +9198xxxxxxxx
 *   TWILIO_WHATSAPP_NUMBER – optional WhatsApp sender, e.g. +1415xxxxxxx
 *
 * When any credential is missing the module runs in SIMULATION mode: it logs
 * a structured preview of every message it would have sent and returns
 * success, so dev builds and demos never crash on missing config.
 */

export interface SosDispatchPayload {
  circleId: string;
  raisedByName: string;
  /** Free-text location (address / live coordinates description). */
  location?: string;
  /** Recipients in E.164 format, e.g. ["+919812345678"]. */
  recipients: string[];
  /** Optional medical/context note shown to responders. */
  note?: string;
}

export interface DispatchResult {
  mode: "live" | "simulation";
  channel: "sms" | "whatsapp";
  to: string;
  sid?: string;
  error?: string;
}

/** True when Twilio credentials are present. */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
}

/** Builds the emergency text sent to responders. */
export function buildSosMessage(p: SosDispatchPayload): string {
  const loc = p.location ? ` Location: ${p.location}.` : "";
  const note = p.note ? ` Note: ${p.note}.` : "";
  return (
    `🚨 SOS EMERGENCY — ${p.raisedByName} needs help right now.` +
    `${loc}${note} Please call immediately. — Suraksha Circle`
  );
}

/** Sends one message via the Twilio Programmable Messaging REST API. */
async function sendTwilioMessage(
  to: string,
  from: string,
  body: string
): Promise<DispatchResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      return {
        mode: "live",
        channel: from.startsWith("whatsapp:") ? "whatsapp" : "sms",
        to,
        error: data.message ?? `Twilio HTTP ${res.status}`,
      };
    }
    return {
      mode: "live",
      channel: from.startsWith("whatsapp:") ? "whatsapp" : "sms",
      to,
      sid: data.sid,
    };
  } catch (err) {
    return {
      mode: "live",
      channel: from.startsWith("whatsapp:") ? "whatsapp" : "sms",
      to,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

/**
 * Dispatches the SOS alert to every recipient over SMS and (when a WhatsApp
 * sender is configured) WhatsApp. In simulation mode it logs a structured
 * preview and returns simulated successes instead of throwing.
 */
export async function dispatchSosAlert(
  p: SosDispatchPayload
): Promise<{ simulated: boolean; results: DispatchResult[] }> {
  const body = buildSosMessage(p);

  if (!isTwilioConfigured()) {
    // ---- Graceful simulation mode -------------------------------------
    console.warn(
      JSON.stringify(
        {
          level: "warn",
          service: "suraksha-notifications",
          mode: "simulation",
          reason:
            "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER not set — no real messages sent",
          wouldDispatch: {
            circleId: p.circleId,
            raisedBy: p.raisedByName,
            channels: process.env.TWILIO_WHATSAPP_NUMBER
              ? ["sms", "whatsapp"]
              : ["sms"],
            recipients: p.recipients,
            message: body,
          },
        },
        null,
        2
      )
    );
    return {
      simulated: true,
      results: p.recipients.map((to) => ({
        mode: "simulation" as const,
        channel: "sms" as const,
        to,
      })),
    };
  }

  // ---- Live dispatch --------------------------------------------------
  const smsFrom = process.env.TWILIO_PHONE_NUMBER as string;
  const waFrom = process.env.TWILIO_WHATSAPP_NUMBER
    ? `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`
    : null;

  const jobs: Promise<DispatchResult>[] = [];
  for (const to of p.recipients) {
    jobs.push(sendTwilioMessage(to, smsFrom, body));
    if (waFrom) jobs.push(sendTwilioMessage(`whatsapp:${to}`, waFrom, body));
  }
  const results = await Promise.all(jobs);

  const failures = results.filter((r) => r.error);
  for (const f of failures) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "suraksha-notifications",
        mode: "live",
        to: f.to,
        channel: f.channel,
        error: f.error,
      })
    );
  }
  return { simulated: false, results };
}
