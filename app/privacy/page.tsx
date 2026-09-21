import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How SurakshaCircle handles your data — phone auth, circle membership, temporary location sharing, and Emergency Card info.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700 active:scale-[0.98]"
        >
          <span aria-hidden>←</span> Back to home
        </Link>

        <header className="mt-6 rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase tracking-widest text-emerald-600">
            🛡️ SurakshaCircle
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Last updated: September 2026 · Beta version
          </p>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-600">
            Your family&apos;s trust matters most. This page explains plainly
            what data SurakshaCircle handles, how we protect it, and the
            choices you always have.
          </p>
        </header>

        <div className="mt-6 space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              1. What SurakshaCircle is
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              SurakshaCircle is a family reassurance and safety-coordination
              companion app. It helps family members check in with each other,
              share live location temporarily during travel, coordinate during
              emergencies, and keep essential medical details handy on an
              Emergency Card.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              We collect only what is needed to provide these features. We do
              not sell your personal data, and we do not show you advertising.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              2. Data we handle
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Phone authentication: when you sign in, we use your phone number
              to verify your identity and keep your account secure. Your phone
              number is used only for sign-in and for reaching you during
              safety alerts you opt into.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Circle membership: your display name, circle membership,
              check-ins, and activity history (for example check-ins, SOS
              events, location-share start and stop, and places you mark) are
              stored so your family circle can see them.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Temporary location sharing: when you start live location sharing,
              your location is visible to members of your active circle until
              you stop sharing. Location is shared only while sharing is
              active — stopping the share stops further updates.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Emergency health info (Emergency Card): details you choose to add
              — such as blood group, allergies, conditions, medications,
              hospital, and doctor — are stored so family members and people
              you share them with can help you faster in an emergency.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              3. Our security approach — an honest note
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Your data is stored securely in Firebase Cloud Firestore and
              protected by member-scoped access rules, so only signed-in
              members of your circle can read your circle&apos;s data.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              We want to be transparent: we do not claim end-to-end encryption.
              Data is encrypted in transit and at rest by our infrastructure
              providers, but it is not end-to-end encrypted in a way that would
              prevent our systems from accessing it for operating the service.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              4. Data retention
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Activity history is kept so your family has a reliable record
              (recent entries are shown first, up to the latest 100 per
              circle). Emergency Card details are kept until you change or
              remove them.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Location points from temporary sharing are part of your
              circle&apos;s shared activity record. If you stop sharing, no new
              location updates are recorded, but earlier entries in the shared
              history remain unless deleted.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              5. Your controls
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              Leave a circle any time from the app&apos;s circle switcher —
              leaving stops new data from being shared with that circle.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              You can edit or remove your Emergency Card details at any time,
              and you can stop location sharing at any time — sharing ends
              immediately.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              To request deletion of your data, contact us using the support
              details in the app or on our beta page, and we will delete or
              anonymise your personal data subject to any legal record-keeping
              duties.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              6. Beta notice
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              SurakshaCircle is currently in beta. Features may change, and
              while we work hard to keep the service reliable and secure, beta
              software may contain issues. Please keep your app updated and
              report anything that looks wrong.
            </p>
          </section>
        </div>

        <footer className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Questions about your privacy? Review our{" "}
            <Link
              href="/terms"
              className="font-extrabold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
            >
              Terms of Service
            </Link>{" "}
            or return{" "}
            <Link
              href="/"
              className="font-extrabold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
            >
              home
            </Link>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
