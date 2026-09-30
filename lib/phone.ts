/**
 * Phone-number helpers shared across the app: India-first E.164 normalization,
 * dialability checks, `tel:` links and display formatting.
 *
 * Dependency-free and side-effect-free, so both client components (call family,
 * emergency card) and server routes (/api/notify-sos recipient checks) can use
 * the exact same rules.
 */

/** E.164-ish shape accepted by the notification APIs: optional +, 8-15 digits. */
const E164_SHAPE = /^\+?\d{8,15}$/;

/** Strips spaces, dashes and brackets so stored numbers compare reliably. */
export function compactPhone(value: string): string {
  return value.trim().replace(/[\s()\-.]/g, "");
}

/**
 * Normalizes user-entered digits to E.164 (+91 default for Indian mobiles).
 * Returns null when the input cannot be a phone number.
 */
export function toE164(value: string): string | null {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) {
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }
  let national = digits;
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  return national.length === 10 ? `+91${national}` : null;
}

/** True when a stored value can actually be dialled or messaged. */
export function isUsablePhone(value: string): boolean {
  const compact = compactPhone(value);
  return compact.length > 0 && E164_SHAPE.test(compact);
}

/** `tel:` href for a stored number ("" when unusable, so links degrade safely). */
export function telHref(value: string): string {
  const compact = compactPhone(value);
  if (!E164_SHAPE.test(compact)) return "";
  return `tel:${toE164(compact) ?? compact}`;
}

/** Pretty display form: "+919876543210" → "+91 98765 43210" (Indian numbers). */
export function formatPhone(value: string): string {
  const compact = compactPhone(value);
  const e164 = toE164(compact);
  const indian = e164 ? /^\+91(\d{10})$/.exec(e164) : null;
  if (indian) return `+91 ${indian[1].slice(0, 5)} ${indian[1].slice(5)}`;
  return compact;
}
