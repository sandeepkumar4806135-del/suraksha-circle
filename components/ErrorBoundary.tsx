"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Phone } from "lucide-react";

// ---------------------------------------------------------------------------
// ErrorBoundaryProps & State
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  elder?: boolean;
  lang?: "en" | "hi";
  fallback?: ReactNode;
  skip?: boolean;
  onError?: (error: Error, info: { componentStack: string }) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  info: { componentStack: string } | null;
}

// ---------------------------------------------------------------------------
// Reusable client-side React error boundary
//
// Isolates individual widgets (SafeZonesCard, MedicationScheduleCard,
// WearableMonitorCard, etc.) so that a crash in one card never breaks the rest
// of the family dashboard.
//
// React requires class components for error boundaries, so we expose a thin
// function-component wrapper (`ErrorBoundary`) plus the class implementation
// (`ErrorBoundaryImpl`) internally.
// ---------------------------------------------------------------------------

/**
 * Thin function-component wrapper around the class-based error boundary.
 *
 * Usage:
 *   <ErrorBoundary elder={isElder} lang={lang}>
 *     <SomeWidgetThatMightCrash />
 *   </ErrorBoundary>
 */
export function ErrorBoundaryWrapper({
  elder = false,
  lang = "en",
  fallback,
  skip = false,
  onError,
  children,
}: ErrorBoundaryProps) {
  if (skip) return <>{children}</>;
  return (
    <ErrorBoundaryImpl
      elder={elder}
      lang={lang}
      fallback={fallback}
      onError={onError}
    >
      {children}
    </ErrorBoundaryImpl>
  );
}

type ErrorBoundaryImplProps = ErrorBoundaryProps;

class ErrorBoundaryImpl extends Component<ErrorBoundaryImplProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryImplProps) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.props.onError?.(error, info);
  }

  private tryAgain = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  private reset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <RecoveryPanel
        elder={this.props.elder ?? false}
        lang={this.props.lang ?? "en"}
        error={this.state.error}
        onTryAgain={this.tryAgain}
        onReset={this.reset}
      />
    );
  }
}

// ---------------------------------------------------------------------------
// Recovery UI — warm, elder-friendly, bilingual
// ---------------------------------------------------------------------------

interface RecoveryPanelProps {
  elder: boolean;
  lang: "en" | "hi";
  error: Error | null;
  onTryAgain: () => void;
  onReset: () => void;
}

function RecoveryPanel({ elder, lang, error, onTryAgain, onReset }: RecoveryPanelProps) {
  const hi = lang === "hi";
  const t = {
    heading: hi ? "कुछ गड़बड़ हो गया" : "Something went wrong",
    subheading: hi
      ? "हम एक जादू से ठीक कर सकते हैं। अगर नहीं, तो Emergency 112 पर कॉल करें।"
      : "We can try a little magic to fix it. If not, call Emergency 112.",
    tryAgain: hi ? "पुनः प्रयास करें / Try Again" : "Try Again / पुनः प्रयास करें",
    reset: hi ? "दोबारा शुरू करते हैं" : "Start Over",
    emergency: hi
      ? "🆘 Emergency 112 — अभी कॉल करें"
      : "🆘 Emergency 112 — Call Now",
    emergencySub: hi
      ? "कोई भी आपातकालीन स्थिति में 112 पर कॉल कर सकता है। यह फ्री है।"
      : "Anyone can call 112 in an emergency. This is free.",
    detailLabel: hi ? "तकनीकी विवरण:" : "Technical detail:",
    dismiss: hi ? "चेतावनी बंद करें" : "Dismiss warning",
  };

  const detail = error ? error.message : null;

  return (
    <RecoveryPanelUI
      elder={elder}
      t={t}
      detail={detail}
      onTryAgain={onTryAgain}
      onReset={onReset}
    />
  );
}

// ---------------------------------------------------------------------------
// RecoveryPanelUI — the visual rendering of the recovery card
// ---------------------------------------------------------------------------

function RecoveryPanelUI({
  elder,
  t,
  detail,
  onTryAgain,
  onReset,
}: {
  elder: boolean;
  t: {
    heading: string;
    subheading: string;
    tryAgain: string;
    reset: string;
    emergency: string;
    emergencySub: string;
    detailLabel: string;
    dismiss: string;
  };
  detail: string | null;
  onTryAgain: () => void;
  onReset: () => void;
}) {
  const elderClass = elder
    ? "border-red-700 bg-red-600 p-6 shadow-2xl"
    : "border-red-400 bg-red-50 p-5 shadow-lg";
  const warningGlow = elder ? "bg-red-400/20" : "bg-red-200/40";
  const iconSize = elder ? "h-12 w-12" : "h-7 w-7";
  const iconRing = elder ? "h-20 w-20" : "h-14 w-14";
  const titleClz = elder ? "text-3xl" : "text-xl";
  const subClz = elder ? "text-xl" : "text-sm";
  const detailClz = elder ? "text-base" : "text-xs";
  const dismissClz = elder ? "text-lg" : "text-xs";
  const primaryBtn =
    elder ? "min-h-[80px] text-2xl font-black" : "min-h-[56px] text-base font-extrabold";
  const secondaryBtn =
    elder ? "min-h-[80px] text-xl font-bold" : "min-h-[48px] text-sm font-bold";
  const emergencyBtn =
    elder ? "min-h-[80px] text-2xl font-black" : "min-h-[56px] text-lg font-black";
  const phoneIcon = elder ? "h-9 w-9" : "h-6 w-6";
  const refreshIcon = elder ? "h-8 w-8" : "h-5 w-5";

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border-2 shadow-lg ${elderClass}`}
      aria-label={t.heading}
      data-testid="error-boundary-recovery"
    >
      <div
        className={`absolute inset-0 -m-4 rounded-4xl border-4 border-red-300/60 ${warningGlow} animate-pulse`}
        aria-hidden
      />
      <div className="relative flex flex-col items-center text-center gap-4">
        <span
          className={`flex items-center justify-center rounded-full bg-white/20 ${iconRing}`}
          aria-hidden
        >
          <AlertTriangle className={`text-white drop-shadow-md ${iconSize}`} aria-hidden />
        </span>
        <h2 className={`max-w-md font-black text-white leading-tight ${titleClz}`}>
          {t.heading}
        </h2>
        <p className={`max-w-sm font-semibold text-white/95 ${subClz}`}>
          {t.subheading}
        </p>
        {detail && (
          <details className={`cursor-pointer rounded-xl bg-white/10 p-3 text-left ${detailClz}`}>
            <summary className="font-bold text-white underline underline-offset-2 cursor-pointer" aria-label={t.detailLabel}>
              {t.detailLabel}
            </summary>
            <pre className="mt-2 max-w-md overflow-x-auto break-all rounded-xl bg-slate-900 p-3 text-red-200" style={{ fontSize: elder ? "1rem" : "0.75rem" }}>
              {detail}
            </pre>
          </details>
        )}
        <button
          type="button"
          onClick={onTryAgain}
          className={`flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-6 py-4 text-white shadow-lg transition hover:bg-emerald-600 active:scale-95 ${primaryBtn}`}
          aria-label={t.tryAgain}
        >
          <RefreshCw className={`text-white ${refreshIcon} animate-spin`} aria-hidden />
          {t.tryAgain}
        </button>
        <button
          type="button"
          onClick={onReset}
          className={`flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-white/40 bg-white/10 px-6 py-4 text-white shadow-md transition hover:bg-white/20 active:scale-95 ${secondaryBtn}`}
          aria-label={t.reset}
        >
          <RefreshCw className={`text-white ${refreshIcon}`} aria-hidden />
          {t.reset}
        </button>
        <a
          href="tel:112"
          className={`flex w-full items-center justify-center gap-3 rounded-2xl bg-red-600 px-6 py-4 text-white shadow-xl transition hover:bg-red-700 active:scale-95 ${emergencyBtn}`}
          aria-label={t.emergency}
        >
          <Phone className={`animate-pulse text-white ${phoneIcon}`} aria-hidden />
          {t.emergency}
        </a>
        <p className={`text-center text-white/90 ${elder ? "text-lg font-bold" : "text-xs font-semibold"}`}>
          {t.emergencySub}
        </p>
        <p className={`text-white/70 underline underline-offset-2 ${dismissClz}`}>
          {t.dismiss}
        </p>
      </div>
    </section>
  );
}

