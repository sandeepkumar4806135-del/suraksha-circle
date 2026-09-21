import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for using SurakshaCircle — a family reassurance and safety coordination companion in beta.",
};

export default function TermsPage() {
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
            🤝 SurakshaCircle
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Last updated: September 2026 · Beta version
          </p>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-600">
            By using SurakshaCircle you agree to these terms. Please read them
            carefully — they explain what the app is for and what it is not.
          </p>
        </header>

        <div className="mt-6 space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              1. Intended use
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              SurakshaCircle is a family reassurance and safety coordination
              tool. It is designed to help family members check in with each
              other, share live location temporarily, coordinate during
              stressful moments, and keep Emergency Card details handy.
            </p>
          </section>

          <section className="rounded-3xl border border-red-200 bg-red-50/60 p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-red-800">
              2. Important disclaimer — not emergency services
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-red-900">
              SurakshaCircle is a companion tool and is not a substitute for
              official emergency services such as the police or ambulance. In
              an emergency, always contact your local emergency number first
              (for example 112 in India) and then use SurakshaCircle to keep
              your family informed.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-extrabold text-slate-900">
              3. Beta usage terms
            </h2>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              SurakshaCircle is currently in beta. Features may change or be
              interrupted, and the service is provided as-is while we improve
              it. Please use the app responsibly: share accurate information,
              respect the privacy of your circle members, and only invite
              people you trust.
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-600">
              We may limit, suspend, or end access for misuse, including
              harassment, sharing false emergency alerts, or attempting to
              access data outside your own circle.
            </p>
          </section>
        </div>

        <footer className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Also read our{" "}
            <Link
              href="/privacy"
              className="font-extrabold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
            >
              Privacy Policy
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
