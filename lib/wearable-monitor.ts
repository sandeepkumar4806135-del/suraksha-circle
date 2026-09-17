import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Automated Vital & Wearable Heartbeat / Fall-Detection Simulation
 * ================================================================
 * Simulates a family member's smart health band:
 *  - normal resting heart rate 70-90 BPM with gentle drift
 *  - slowly draining battery, incrementing step count
 *  - manual "Simulate Fall" / "Simulate Abnormal Heart Rate" triggers
 *  - optional automated fall-detection simulation (random rare events)
 *
 * A detected emergency first enters a PENDING state with a cancel
 * countdown ("I am okay / False Alarm") before the parent dispatches
 * the real SOS — preventing accidental emergency dispatch.
 */

/** Live vital statistics from the (simulated) wearable device. */
export interface WearableStats {
  /** Beats per minute (70-90 is normal). */
  heartRate: number;
  /** Device battery percentage 0-100. */
  battery: number;
  /** Step count for today. */
  steps: number;
  /** Epoch ms of the last sensor sync. */
  lastSync: number;
}

export type WearableAlertKind = "fall" | "abnormal-heart-rate";

/** A detected emergency waiting for the cancel window to elapse. */
export interface WearableAlert {
  kind: WearableAlertKind;
  /** Detailed description, e.g. "No movement for 30s after impact". */
  detail: string;
  /** Heart rate observed when the alert fired. */
  heartRate: number;
  /** Epoch ms the alert was raised. */
  at: number;
}

// ---------------------------------------------------------------------------
// Persistence — fall-detection toggle survives reloads
// ---------------------------------------------------------------------------

const FALL_DETECTION_KEY = "suraksha.wearable.fall-detection";

export function loadFallDetectionEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(FALL_DETECTION_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function saveFallDetectionEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FALL_DETECTION_KEY, String(enabled));
  } catch {
    // storage unavailable — session-only setting
  }
}

// ---------------------------------------------------------------------------
// Simulation helpers
// ---------------------------------------------------------------------------

/** A normal resting heart rate, 70-90 BPM. */
export function normalHeartRate(): number {
  return 70 + Math.floor(Math.random() * 21);
}

/** A dangerous (tachycardic) heart rate, 115-140 BPM. */
export function dangerousHeartRate(): number {
  return 115 + Math.floor(Math.random() * 26);
}

/** Seconds the user has to cancel before the SOS is dispatched. */
export const CANCEL_WINDOW_S = 10;

const TICK_MS = 3000;
/** Roll the dice for an automated event every 15 s while fall detection is on. */
const AUTO_ROLL_MS = 15000;
/** ~0.8% chance per roll of an automated fall (roughly one per ~30 min). */
const AUTO_FALL_CHANCE = 0.008;
/** ~0.6% chance per roll of an automated arrhythmia episode. */
const AUTO_ARRHYTHMIA_CHANCE = 0.006;
/** How long simulated abnormal vitals stay dangerous before recovering. */
const ABNORMAL_DURATION_MS = 30000;

export const FALL_DETAIL =
  "Fall detected by smart wearable — no movement for 30s";
export const ABNORMAL_HR_DETAIL =
  "Abnormal heart rate detected by smart wearable — resting BPM far above normal";

export interface UseWearableMonitorResult {
  stats: WearableStats;
  fallDetection: boolean;
  toggleFallDetection: (next: boolean) => void;
  /** Alert awaiting the cancel window, or null. */
  pending: WearableAlert | null;
  /** Seconds left in the cancel window. */
  countdown: number;
  /** Manually simulate a fall event. */
  simulateFall: () => void;
  /** Manually simulate a dangerous heart-rate episode. */
  simulateAbnormalHeartRate: () => void;
  /** Cancel the pending alert ("I am okay / False Alarm"). */
  cancelAlert: () => void;
  /** True while simulated vitals are in a dangerous range. */
  vitalsAbnormal: boolean;
}

export function useWearableMonitor(
  onDispatch: (alert: WearableAlert) => void
): UseWearableMonitorResult {
  const [stats, setStats] = useState<WearableStats>(() => ({
    heartRate: normalHeartRate(),
    battery: 84,
    steps: 3241,
    lastSync: Date.now(),
  }));
  const [fallDetection, setFallDetection] = useState(true);
  const [pending, setPending] = useState<WearableAlert | null>(null);
  const [countdown, setCountdown] = useState(CANCEL_WINDOW_S);

  const abnormalUntilRef = useRef(0);
  const onDispatchRef = useRef(onDispatch);
  const pendingRef = useRef<WearableAlert | null>(null);

  // Keep refs in sync via effects (no ref writes during render).
  useEffect(() => {
    onDispatchRef.current = onDispatch;
  }, [onDispatch]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Hydrate the persisted toggle after mount (SSR-safe).
  useEffect(() => {
    const id = setTimeout(() => setFallDetection(loadFallDetectionEnabled()), 0);
    return () => clearTimeout(id);
  }, []);

  const toggleFallDetection = useCallback((next: boolean) => {
    setFallDetection(next);
    saveFallDetectionEnabled(next);
  }, []);

  const raiseAlert = useCallback((kind: WearableAlertKind) => {
    const alert: WearableAlert = {
      kind,
      detail: kind === "fall" ? FALL_DETAIL : ABNORMAL_HR_DETAIL,
      heartRate: kind === "fall" ? normalHeartRate() : dangerousHeartRate(),
      at: Date.now(),
    };
    if (kind === "abnormal-heart-rate") {
      // Keep the vitals display dangerous for a short while.
      abnormalUntilRef.current = Date.now() + ABNORMAL_DURATION_MS;
    }
    setPending(alert);
    setCountdown(CANCEL_WINDOW_S);
  }, []);

  const simulateFall = useCallback(() => raiseAlert("fall"), [raiseAlert]);
  const simulateAbnormalHeartRate = useCallback(
    () => raiseAlert("abnormal-heart-rate"),
    [raiseAlert]
  );

  const cancelAlert = useCallback(() => {
    setPending(null);
    abnormalUntilRef.current = 0;
  }, []);

  // Vital-sign ticking: gentle HR drift, battery drain, step increments.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      setStats((s) => {
        const abnormal = Date.now() < abnormalUntilRef.current;
        const drift = Math.floor(Math.random() * 4) * (Math.random() > 0.5 ? 1 : -1);
        const nextHr = abnormal
          ? dangerousHeartRate()
          : Math.max(70, Math.min(90, s.heartRate + drift));
        return {
          heartRate: nextHr,
          battery: Math.max(0, s.battery - (Math.random() < 0.15 ? 1 : 0)),
          steps: s.steps + (Math.random() < 0.4 ? Math.floor(Math.random() * 12) : 0),
          lastSync: Date.now(),
        };
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Automated fall-detection simulation (only while the toggle is on).
  useEffect(() => {
    if (!fallDetection || typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (pendingRef.current) return; // already handling an alert
      const roll = Math.random();
      if (roll < AUTO_FALL_CHANCE) raiseAlert("fall");
      else if (roll < AUTO_FALL_CHANCE + AUTO_ARRHYTHMIA_CHANCE)
        raiseAlert("abnormal-heart-rate");
    }, AUTO_ROLL_MS);
    return () => window.clearInterval(id);
  }, [fallDetection, raiseAlert]);

  // Cancel-window countdown: dispatch the SOS when it reaches zero.
  useEffect(() => {
    if (!pending || typeof window === "undefined") return;
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          const alert = pendingRef.current;
          setPending(null);
          if (alert) onDispatchRef.current(alert);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pending]);

  return {
    stats,
    fallDetection,
    toggleFallDetection,
    pending,
    countdown,
    simulateFall,
    simulateAbnormalHeartRate,
    cancelAlert,
    vitalsAbnormal: stats.heartRate > 100,
  };
}
