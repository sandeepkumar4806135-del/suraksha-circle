"use client";

import { useEffect } from "react";
import { ErrorBoundaryWrapper } from "@/components/ErrorBoundary";
import { Phone, RefreshCw } from "lucide-react";

/**
 * App Router error boundary for the Suraksha Circle dashboard.
 *
 * Catches runtime rendering errors in the dashboard (page.tsx and its
 * children), presenting a warm, elder-friendly recovery UI with:
 *   - "Try Again / पुनः प्रयास करें" button (re-renders the crashed tree)
 *   - Emergency 112 call shortcut always visible
 *   - Full Elder Mode compatibility (large fonts, high contrast)
 *   - Bilingual en/hi messaging
 */
interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[Suraksha Circle] Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10">
      <ErrorBoundaryWrapper elder lang="hi">
        <DashboardErrorContent error={error} onTryAgain={reset} />
      </ErrorBoundaryWrapper>
    </div>
  );
}

function DashboardErrorContent({
  error,
  onTryAgain,
}: {
  error: Error & { digest?: string };
  onTryAgain: () => void;
}) {
  const hi = true;
  const t = {
    heading: hi ? "कुछ गड़बड़ हो गया" : "Something went wrong",
    subheading: hi
      ? "हम एक जादू से ठीक कर सकते हैं। अगर नहीं, तो Emergency 112 पर कॉल करें।"
      : "We can try a little magic to fix it. If not, call Emergency 112.",
    tryAgain: hi ? "पुनः प्रयास करें / Try Again" : "Try Again / पुनः प्रयास करें",
    emergency: hi
      ? "🆘 Emergency 112 — अभी कॉल करें"
      : "🆘 Emergency 112 — Call Now",
    emergencySub: hi
      ? "कोई भी आपातकालीन स्थिति में 112 पर कॉल कर सकता है। यह फ्री है।"
      : "Anyone can call 112 in an emergency. This is free.",
    detailLabel: hi ? "तकनीकी विवरण:" : "Technical detail:",
  };

  const detail = error?.message ?? null;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border-2 border-red-700 bg-red-600 p-6 shadow-2xl"
      aria-label={t.heading}
      data-testid="app-error-recovery"
    >
      <div className="absolute inset-0 -m-4 rounded-4xl border-4 border-red-300/60 bg-red-400/20" aria-hidden />
      <div className="relative flex flex-col items-center text-center gap-4">
        <h2 className="mt-4 max-w-md font-black text-white text-3xl leading-tight">
          {t.heading}
        </h2>
        <p className="mt-2 max-w-sm font-semibold text-white/95 text-xl">
          {t.subheading}
        </p>
        {detail && (
          <details className="mt-3 cursor-pointer rounded-xl bg-white/10 p-3 text-left text-base">
            <summary className="font-bold text-white underline underline-offset-2 cursor-pointer" aria-label={t.detailLabel}>
              {t.detailLabel}
            </summary>
            <pre className="mt-2 max-w-md overflow-x-auto break-all rounded-xl bg-slate-900 p-3 text-red-200">
              {detail}
            </pre>
          </details>
        )}
        <button
          type="button"
          onClick={onTryAgain}
          className="flex w-full min-h-[80px] items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-6 py-4 text-2xl font-black text-white shadow-lg transition hover:bg-emerald-600 active:scale-95"
          aria-label={t.tryAgain}
        >
          <RefreshCw className="h-8 w-8 text-white animate-spin" aria-hidden />
          {t.tryAgain}
        </button>
        <a
          href="tel:112"
          className="flex w-full min-h-[80px] items-center justify-center gap-3 rounded-2xl bg-red-600 px-6 py-4 text-2xl font-black text-white shadow-xl transition hover:bg-red-700 active:scale-95"
          aria-label={t.emergency}
        >
          <Phone className="h-9 w-9 animate-pulse text-white" aria-hidden />
          {t.emergency}
        </a>
        <p className="text-center text-white/90 text-lg font-bold">
          {t.emergencySub}
        </p>
      </div>
    </section>
  );
}
