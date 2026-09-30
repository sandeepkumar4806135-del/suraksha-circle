"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, Pencil, Phone } from "lucide-react";
import { updateMemberPhone } from "@/lib/circle-membership";
import { isFirebaseConfigured } from "@/lib/firebase";
import { formatPhone, toE164 } from "@/lib/phone";
import { getUserProfile, updateUserPhone } from "@/lib/user-profile";

interface PhoneNumberCardProps {
  circleId: string;
  uid: string;
  /** Number already known from the circle entry / auth account ("" = unknown). */
  initialPhone: string;
  elder?: boolean;
  lang?: "en" | "hi";
  /** Reports the saved number back so the parent can make it callable at once. */
  onSaved: (phone: string) => void;
  onStatusChange: (message: string) => void;
}

/**
 * "My phone number" — the one place a member stores their own number.
 *
 * Writes users/{uid}.phone (their profile) AND circles/{id}.members.{uid}.phone
 * (their circle entry) so the rest of the family can call them during an
 * emergency. The Firestore rules only allow writes to the caller's OWN member
 * entry, so this can never overwrite somebody else's number.
 */
export default function PhoneNumberCard({
  circleId,
  uid,
  initialPhone,
  elder = false,
  lang = "en",
  onSaved,
  onStatusChange,
}: PhoneNumberCardProps) {
  const hi = lang === "hi";
  const [phone, setPhone] = useState(initialPhone);
  const [editing, setEditing] = useState(initialPhone.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the profile when the circle entry has no number yet (e.g. a
  // Google sign-in whose phone was only added to the profile afterwards).
  useEffect(() => {
    if (initialPhone || !uid) return;
    let cancelled = false;
    void getUserProfile(uid).then((profile) => {
      if (cancelled || !profile?.phone) return;
      setPhone(profile.phone);
      setEditing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialPhone, uid]);

  const t = {
    title: hi ? "📞 मेरा फ़ोन नंबर" : "📞 My Phone Number",
    sub: hi
      ? "आपात स्थिति में आपका घेरा इसी नंबर पर कॉल करता है"
      : "Your circle calls this number during an emergency",
    missing: hi ? "अभी कोई नंबर सेव नहीं है" : "No number saved yet",
    label: hi ? "मोबाइल नंबर" : "Mobile number",
    placeholder: hi ? "जैसे 98765 43210" : "e.g. 98765 43210",
    change: hi ? "बदलें" : "Change",
    save: hi ? "नंबर सेव करें" : "Save number",
    saving: hi ? "सेव हो रहा है…" : "Saving…",
    invalid: hi
      ? "सही मोबाइल नंबर डालें (10 अंक या +देश कोड के साथ)"
      : "Enter a valid mobile number (10 digits, or +country code)",
    saved: hi ? "✅ नंबर सेव — आपका घेरा अब कॉल कर सकता है" : "✅ Number saved — your circle can call you now",
    profileOnly: hi
      ? "प्रोफ़ाइल में सेव — घेरा कॉपी ऑनलाइन होने पर सिंक होगी"
      : "Saved to your profile — the circle copy syncs when you are back online",
    demoSaved: hi ? "डेमो सेशन के लिए नंबर सेव हुआ" : "Number saved for this demo session",
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) {
      setError(t.invalid);
      return;
    }
    setError(null);
    setSaving(true);
    // Demo mode has no Firestore: keep the number for this session only.
    if (!isFirebaseConfigured()) {
      setSaving(false);
      setPhone(e164);
      setEditing(false);
      onSaved(e164);
      onStatusChange(t.demoSaved);
      return;
    }
    await updateUserPhone(uid, e164);
    const shared = await updateMemberPhone(circleId, uid, e164);
    setSaving(false);
    setPhone(e164);
    setEditing(false);
    onSaved(e164);
    onStatusChange(shared ? t.saved : t.profileOnly);
  }

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-label={t.title}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
          <Phone className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`${elder ? "text-2xl" : "text-lg"} font-extrabold text-slate-900`}>
            {t.title}
          </h3>
          <p className={`${elder ? "text-base" : "text-xs"} font-semibold text-slate-400`}>
            {t.sub}
          </p>
        </div>
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-2">
          <label
            htmlFor="my-phone"
            className="text-xs font-extrabold uppercase tracking-wide text-slate-500"
          >
            {t.label}
          </label>
          <input
            id="my-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(null);
            }}
            placeholder={t.placeholder}
            className={`w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none ${
              elder ? "min-h-14 text-lg" : "min-h-12 text-base"
            }`}
          />
          <button
            type="submit"
            disabled={saving || phone.trim().length === 0}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-extrabold text-white shadow transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 ${
              elder ? "min-h-14 text-lg" : "min-h-12 text-sm"
            }`}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-5 w-5" aria-hidden />
            )}
            {saving ? t.saving : t.save}
          </button>
          {error && (
            <p
              className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
              role="status"
            >
              ⚠️ {error}
            </p>
          )}
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3">
          <span className={`font-extrabold text-slate-900 ${elder ? "text-xl" : "text-base"}`}>
            {phone ? formatPhone(phone) : t.missing}
          </span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
            className="flex items-center gap-1.5 rounded-full border-2 border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 active:scale-95"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t.change}
          </button>
        </div>
      )}
    </section>
  );
}
