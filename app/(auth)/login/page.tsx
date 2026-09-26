"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  LogOut,
  Phone,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  confirmDemoOtp,
  confirmOtp,
  onAuthState,
  sendOtp,
  signOutUser,
} from "@/lib/auth";
import {
  createCircle,
  getUserCircleId,
  joinCircleByInviteCode,
} from "@/lib/circle-membership";
import { isFirebaseConfigured } from "@/lib/firebase";
import { ensureUserProfile } from "@/lib/user-profile";

type Step = "phone" | "otp" | "circle";
type CircleMode = "choose" | "create" | "join";

/** Friendly copy for the Firebase Auth errors beta testers hit most. */
const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-phone-number": "That phone number doesn't look right.",
  "auth/missing-phone-number": "Please enter your phone number.",
  "auth/invalid-verification-code": "That code isn't right. Please check the SMS and try again.",
  "auth/code-expired": "That code has expired. Please request a new one.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/quota-exceeded": "Today's SMS limit is reached. Please try again later.",
  "auth/network-request-failed": "Network error. Please check your connection and try again.",
  "auth/captcha-check-failed": "reCAPTCHA check failed. Please try again.",
};

function errorText(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const match = message.match(/\((auth\/[a-z-]+)\)/);
  if (match && AUTH_ERRORS[match[1]]) return AUTH_ERRORS[match[1]];
  return message || fallback;
}

const STEP_ORDER: Step[] = ["phone", "otp", "circle"];
const STEP_LABELS: Record<Step, string> = { phone: "Phone", otp: "Verify", circle: "Circle" };
const STEP_TITLES: Record<Step, string> = {
  phone: "Sign in with your phone",
  otp: "Enter the 6-digit code",
  circle: "Create or join your circle",
};

const INPUT_CLASS =
  "mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white";
const PRIMARY_BUTTON_CLASS =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-base font-extrabold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60";

/** Normalizes entered digits to E.164 (+91 default for Indian mobiles). */
function toE164(value: string): string | null {
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

export default function LoginPage() {
  const router = useRouter();

  // Session / step state
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Phone step
  const [phone, setPhone] = useState("");

  // OTP step
  const [code, setCode] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  // Circle step
  const [session, setSession] = useState<{ uid: string; phone: string } | null>(null);
  const [circleMode, setCircleMode] = useState<CircleMode>("choose");
  const [displayName, setDisplayName] = useState("");
  const [circleName, setCircleName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  // Existing-session check: already-signed-in users skip the phone step;
  // signed-in users without a circle land on the create-or-join screen.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthState((user) => {
      if (cancelled) return;
      setChecking(false);
      if (!user) return;
      void (async () => {
        try {
          const circleId = await getUserCircleId(user.uid);
          if (cancelled) return;
          if (circleId) {
            router.replace("/");
            return;
          }
          setSession((prev) => prev ?? { uid: user.uid, phone: user.phoneNumber ?? "" });
          setStep("circle");
        } catch (err) {
          if (!cancelled) {
            setError(errorText(err, "Could not load your circle. Please try again."));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  /** Sends the OTP (or, without Firebase configured, enters demo OTP mode). */
  async function requestOtp(e164: string): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await sendOtp(e164);
    setBusy(false);
    if (result.ok) {
      confirmationRef.current = result.confirmation;
      setDemoMode(false);
    } else if (isFirebaseConfigured()) {
      // Live config but the send failed — surface the reason.
      setError(errorText(new Error(result.error)));
      return;
    } else {
      // Demo fallback: no live Firebase — mock OTP keeps the flow testable.
      setDemoMode(true);
      confirmationRef.current = null;
    }
    setPendingPhone(e164);
    setCode("");
    setStep("otp");
  }

  function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) {
      setError("Enter a valid 10-digit mobile number (e.g. 98765 43210).");
      return;
    }
    void requestOtp(e164);
  }

  function handleResend() {
    if (busy || !pendingPhone) return;
    void requestOtp(pendingPhone);
  }

  /** Confirms the OTP, creates the profile, then routes by circle membership. */
  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const entered = code.replace(/\D/g, "");
    if (entered.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      let uid: string;
      let userPhone: string;
      if (demoMode) {
        const user = await confirmDemoOtp(pendingPhone, entered);
        uid = user.uid;
        userPhone = pendingPhone;
      } else if (confirmationRef.current) {
        const user = await confirmOtp(confirmationRef.current, entered);
        uid = user.uid;
        userPhone = user.phoneNumber ?? pendingPhone;
      } else {
        setError("Session expired. Please request a new code.");
        setStep("phone");
        return;
      }
      await ensureUserProfile(uid, userPhone);
      const circleId = await getUserCircleId(uid);
      if (circleId) {
        router.replace("/");
        return;
      }
      setSession({ uid, phone: userPhone });
      setCircleMode("choose");
      setStep("circle");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** Creates a brand-new circle and routes into the app. */
  async function handleCreateCircle(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    const name = displayName.trim();
    const newCircleName = circleName.trim();
    if (!name) {
      setError("Please enter your name.");
      return;
    }
    if (!newCircleName) {
      setError("Please enter a circle name (e.g. Sharma Family).");
      return;
    }
    setBusy(true);
    try {
      await ensureUserProfile(session.uid, session.phone, name);
      await createCircle(session.uid, name, newCircleName);
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** Joins an existing circle via its 6-character invite code. */
  async function handleJoinCircle(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    const name = displayName.trim();
    const code6 = inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!name) {
      setError("Please enter your name.");
      return;
    }
    if (code6.length !== 6) {
      setError("Invite codes are 6 characters (e.g. K7PX2M).");
      return;
    }
    setBusy(true);
    try {
      await ensureUserProfile(session.uid, session.phone, name);
      const joined = await joinCircleByInviteCode(session.uid, name, session.phone, code6);
      if (!joined) {
        setError("No circle found for that invite code. Please check with your family and try again.");
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    await signOutUser();
    setBusy(false);
    setSession(null);
    setStep("phone");
    setCode("");
    setError(null);
  }

  // Wait for the first auth callback before deciding anything (avoids a
  // redirect flash for signed-in users opening /login).
  if (checking) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-emerald-50 via-white to-white px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
          <ShieldCheck className="h-8 w-8" aria-hidden />
        </span>
        <p className="text-sm font-bold text-slate-600">Checking your session…</p>
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
      </main>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700 active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
        </Link>

        <header className="mt-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <ShieldCheck className="h-8 w-8" aria-hidden />
          </span>
          <p className="mt-3 text-xs font-black uppercase tracking-widest text-emerald-600">
            🛡️ SurakshaCircle · Beta
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            {STEP_TITLES[step]}
          </h1>
          <p className="mt-1.5 text-sm font-semibold text-slate-500">
            {step === "phone"
              ? "One secure sign-in keeps your family circle private."
              : step === "otp"
                ? `We sent it to ${pendingPhone}`
                : "Your circle is a private space shared only with family."}
          </p>
        </header>

        {/* Step progress: 1 Phone → 2 Verify → 3 Circle */}
        <ol className="mt-5 flex items-center justify-center gap-1.5" aria-label="Sign-in progress">
          {STEP_ORDER.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <span className="h-px w-6 bg-slate-200" aria-hidden />}
              <span
                aria-current={i === stepIndex ? "step" : undefined}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition ${
                  i < stepIndex
                    ? "bg-emerald-500 text-white"
                    : i === stepIndex
                      ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              <span
                className={`text-xs font-bold ${i === stepIndex ? "text-slate-900" : "text-slate-400"}`}
              >
                {STEP_LABELS[s]}
              </span>
            </li>
          ))}
        </ol>

        <section className="mt-5 rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
            >
              {error}
            </div>
          )}

          {step === "phone" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label htmlFor="login-phone" className="block text-sm font-bold text-slate-700">
                  Mobile number
                </label>
                <input
                  id="login-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  We&apos;ll text you a 6-digit code. Standard SMS rates may apply.
                </p>
              </div>
              <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Phone className="h-5 w-5" aria-hidden />
                )}
                {busy ? "Sending code…" : "Send OTP"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                <span className="min-w-0 truncate">
                  Sent to <span className="font-black text-slate-900">{pendingPhone}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError(null);
                    setCode("");
                  }}
                  className="shrink-0 font-black text-emerald-600 underline underline-offset-2"
                >
                  Change
                </button>
              </div>
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3.5 text-center text-2xl font-black tracking-[0.45em] text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                aria-label="6-digit verification code"
                required
              />
              <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <KeyRound className="h-5 w-5" aria-hidden />
                )}
                {busy ? "Verifying…" : "Verify & continue"}
              </button>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={busy || demoMode}
                  className="text-sm font-black text-emerald-600 underline underline-offset-2 disabled:opacity-50"
                >
                  Resend code
                </button>
                <span className="text-xs font-semibold text-slate-400">
                  Didn&apos;t get the SMS?
                </span>
              </div>
              {demoMode && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                  🧪 Demo mode — Firebase isn&apos;t configured in this environment. Enter any
                  6-digit code to continue.
                </div>
              )}
            </form>
          )}

          {step === "circle" && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-600">
                {session?.phone ? (
                  <>
                    Signed in as{" "}
                    <span className="font-black text-slate-900">{session.phone}</span>
                  </>
                ) : (
                  "A circle is your family’s private space."
                )}
              </p>

              {circleMode === "choose" && (
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setCircleMode("create")}
                    className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 active:scale-[0.99]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <UserPlus className="h-6 w-6" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-extrabold text-slate-900">
                        Create a new circle
                      </span>
                      <span className="block text-xs font-semibold text-slate-500">
                        Start fresh and invite family with a code
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCircleMode("join")}
                    className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 active:scale-[0.99]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <KeyRound className="h-6 w-6" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-extrabold text-slate-900">
                        Join with invite code
                      </span>
                      <span className="block text-xs font-semibold text-slate-500">
                        Enter the 6-character code from your family
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {circleMode === "create" && (
                <form onSubmit={handleCreateCircle} className="space-y-4">
                  <div>
                    <label htmlFor="your-name" className="block text-sm font-bold text-slate-700">
                      Your name
                    </label>
                    <input
                      id="your-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Rahul"
                      maxLength={60}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="circle-name"
                      className="block text-sm font-bold text-slate-700"
                    >
                      Circle name
                    </label>
                    <input
                      id="circle-name"
                      type="text"
                      value={circleName}
                      onChange={(e) => setCircleName(e.target.value)}
                      placeholder="e.g. Sharma Family"
                      maxLength={60}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      <Users className="h-5 w-5" aria-hidden />
                    )}
                    {busy ? "Creating…" : "Create circle"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCircleMode("choose");
                      setError(null);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 text-sm font-black text-slate-500 hover:text-slate-700"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                  </button>
                </form>
              )}

              {circleMode === "join" && (
                <form onSubmit={handleJoinCircle} className="space-y-4">
                  <div>
                    <label htmlFor="join-name" className="block text-sm font-bold text-slate-700">
                      Your name
                    </label>
                    <input
                      id="join-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Priya"
                      maxLength={60}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-code" className="block text-sm font-bold text-slate-700">
                      Invite code
                    </label>
                    <input
                      id="invite-code"
                      type="text"
                      value={inviteCode}
                      onChange={(e) =>
                        setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                      }
                      placeholder="K7PX2M"
                      maxLength={6}
                      className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-black uppercase tracking-[0.4em] text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                      required
                    />
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Ask whoever created the circle for their 6-character code.
                    </p>
                  </div>
                  <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      <Users className="h-5 w-5" aria-hidden />
                    )}
                    {busy ? "Joining…" : "Join circle"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCircleMode("choose");
                      setError(null);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 text-sm font-black text-slate-500 hover:text-slate-700"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={busy}
                className="mx-auto flex items-center gap-1.5 text-sm font-bold text-slate-400 transition hover:text-slate-600 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </div>
          )}
        </section>

        {/* Invisible reCAPTCHA widget binds here for phone sign-in. */}
        <div id="recaptcha-container" />

        <footer className="mt-6 flex items-center justify-center gap-4 text-sm font-bold text-slate-500">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-emerald-700">
            Privacy Policy
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="underline underline-offset-2 hover:text-emerald-700">
            Terms of Service
          </Link>
        </footer>
        {!isFirebaseConfigured() && (
          <p className="mt-2 text-center text-xs font-semibold text-slate-400">
            Running in demo mode — set NEXT_PUBLIC_FIREBASE_* in .env.local for live phone
            sign-in.
          </p>
        )}
      </div>
    </main>
  );
}






