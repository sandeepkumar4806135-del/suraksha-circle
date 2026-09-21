import { useMemo } from "react";
import { speakPrompt } from "@/lib/voice-assistant";
import type { WearableStats } from "@/lib/wearable-monitor";
import type { ScheduleItem } from "@/lib/medication-schedule";
import type { GeoPosition } from "@/lib/safe-zones";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One day's worth of health data in the weekly view. */
export interface DailyHealthRecord {
  /** Short weekday label, e.g. "Mon". */
  dayLabel: string;
  /** ISO date `YYYY-MM-DD` for the day. */
  date: string;
  /** Average heart rate (BPM) for the day. */
  heartRate: number;
  /** Total steps for the day. */
  steps: number;
  /** Medication adherence percentage (0-100) for the day. */
  medicationAdherencePct: number;
  /** Estimated sleep duration in hours. */
  sleepHours: number;
  /** True when the day had meaningful activity (steps > 500). */
  isActive: boolean;
}

/** A 7-day health summary plus derived aggregates. */
export interface WeeklyHealthMetrics {
  /** Seven days ending today (index 6 = today). */
  days: DailyHealthRecord[];
  /** Average heart rate across the week. */
  avgHeartRate: number;
  /** Heart-rate direction vs the prior week-half. */
  heartRateTrend: "up" | "down" | "stable";
  /** Total steps across the week. */
  totalSteps: number;
  /** Average medication adherence across the week (0-100). */
  medicationAdherencePct: number;
  /** Number of active days (steps > 500) in the week. */
  activeDays: number;
  /** Average estimated sleep across the week. */
  avgSleepHours: number;
  /** Index of today inside `days` (always 6). */
  readonly todayIndex: number;
  /** ISO date of today (`YYYY-MM-DD`). */
  readonly todayDate: string;
}
// ---------------------------------------------------------------------------
// Seeded RNG - keeps the weekly history stable within a day
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Demo home coordinates used as a rough "at home / sleeping" proxy. */
const HOME_LAT = 19.1364;
const HOME_LNG = 72.8296;
const HOME_RADIUS_DEG = 0.004; // ~450 m

/**
 * True when `position` is close enough to the demo home to count as "at home".
 */
function isAtHome(position: GeoPosition | null): boolean {
  if (!position) return false;
  const dx = position.lat - HOME_LAT;
  const dy = position.lng - HOME_LNG;
  return Math.sqrt(dx * dx + dy * dy) < HOME_RADIUS_DEG;
}

/**
 * Pure computation: build a 7-day health summary from the live inputs.
 *
 * Historical values are synthesized around the current readings so the chart
 * always has something plausible to render even before a full week of data has
 * been collected. Today's medication adherence is computed exactly from the
 * current schedule statuses; prior days vary around that baseline.
 */
export function computeWeeklyMetrics(
  stats: WearableStats,
  schedules: ScheduleItem[],
  position: GeoPosition | null,
): WeeklyHealthMetrics {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const rand = seededRandom(
    today.getFullYear() * 10000 + today.getMonth() * 100 + today.getDate(),
  );

  const totalSchedules = schedules.length;
  const takenSchedules = schedules.filter(
    (s) => s.status === "taken",
  ).length;
  const todayAdherence =
    totalSchedules > 0
      ? (takenSchedules / totalSchedules) * 100
      : 100;

  const atHome = isAtHome(position);
  const baseSleepHours = atHome ? 7.5 : 6.8;

  const days: DailyHealthRecord[] = [];
  let totalSteps = 0;
  let totalAdherence = 0;
  let activeDays = 0;

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = date.toLocaleDateString("en-US", {
      weekday: "short",
    });
    const isWeekend =
      date.getDay() === 0 || date.getDay() === 6;
    const isToday = i === 0;

    // Heart rate: gentle random walk anchored on the current reading.
    const hrDelta = Math.round((rand() - 0.5) * 10);
    const trendBias = (6 - i) * 0.4; // slight drift across the week
    const heartRate = Math.max(
      60,
      Math.min(
        100,
        stats.heartRate + hrDelta + trendBias,
      ),
    );

    // Steps: today is a partial estimate; prior days follow a weekday pattern.
    const dayFactor = isWeekend ? 0.75 : 1.0;
    const steps = isToday
      ? Math.round(stats.steps * 1.6) // extrapolate full day from "so far"
      : Math.round(2500 + rand() * 5500 * dayFactor);

    // Medication adherence: varies around today's real value.
    const adherenceDelta = (rand() - 0.5) * 24;
    const medicationAdherencePct = Math.round(
      Math.max(
        40,
        Math.min(100, todayAdherence + adherenceDelta),
      ),
    );

    // Sleep: estimated from home presence + daily variation.
    const sleepDelta = (rand() - 0.5) * 1.6;
    const sleepHours = Math.round(
      (baseSleepHours + sleepDelta) * 10,
    ) / 10;

    const isActive = steps > 500;
    if (isActive) activeDays++;
    totalSteps += steps;
    totalAdherence += medicationAdherencePct;

    days.push({
      dayLabel: dayOfWeek,
      date: dateStr,
      heartRate,
      steps,
      medicationAdherencePct,
      sleepHours,
      isActive,
    });
  }

  const avgHeartRate = Math.round(
    days.reduce((s, d) => s + d.heartRate, 0) / days.length,
  );

  // Trend: compare the oldest 3 days to the newest 3 days.
  const oldAvg =
    (days[0].heartRate +
      days[1].heartRate +
      days[2].heartRate) /
    3;
  const newAvg =
    (days[4].heartRate +
      days[5].heartRate +
      days[6].heartRate) /
    3;
  const delta = newAvg - oldAvg;
  const heartRateTrend: "up" | "down" | "stable" =
    delta > 3
      ? "up"
      : delta < -3
        ? "down"
        : "stable";

  return {
    days,
    avgHeartRate,
    heartRateTrend,
    totalSteps,
    medicationAdherencePct: Math.round(
      totalAdherence / days.length,
    ),
    activeDays,
    avgSleepHours: Math.round(
      (days.reduce((s, d) => s + d.sleepHours, 0) /
        days.length) *
        10,
    ) / 10,
    todayIndex: 6,
    todayDate: days[6].date,
  };
}





// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Computes a 7-day health summary from live wearable stats, medication
 * schedules, and geofence position.
 *
 * Historical data is synthesized around the current readings so the chart
 * always renders. Refresh only when one of the inputs changes.
 */
export function useWeeklyHealthMetrics(
  stats: WearableStats,
  schedules: ScheduleItem[],
  position: GeoPosition | null,
): WeeklyHealthMetrics {
  return useMemo(
    () => computeWeeklyMetrics(stats, schedules, position),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.heartRate, stats.steps, schedules, position],
  );
}

// ---------------------------------------------------------------------------
// Voice summary
// ---------------------------------------------------------------------------

const DAY_LABELS_HI = [
  "Ravivaar",
  "Somvaar",
  "Mangalvaar",
  "Budhvaar",
  "Guruvaar",
  "Shukravaar",
  "Shanivaar",
];

/**
 * Speaks a short spoken summary of this week's health insights.
 * Reuses `speakPrompt` from `lib/voice-assistant.ts` - graceful no-op if the
 * Web Speech API is unavailable.
 */
export function speakHealthSummary(
  m: WeeklyHealthMetrics,
  elderName: string,
  lang: "en" | "hi",
): void {
  if (lang === "hi") {
    speakPrompt(
      `प्रिया का पिछले सप्ताह का स्वास्थ्य विश्लेषण: औसत हृदय गति सात्तर ${m.avgHeartRate} बीपीएम थी, ${m.heartRateTrend === "up" ? "बढ़ रही" : m.heartRateTrend === "down" ? "घट रही" : "स्थिर"} है, ${m.totalSteps} कदम थे, दवा पालन ${m.medicationAdherencePct} प्रतिशत था, और नींद ${m.avgSleepHours} घंटे थी।`,
      lang,
    );
  } else {
    speakPrompt(
      `Weekly health summary for ${elderName}: average heart rate ${m.avgHeartRate} beats per minute, ${m.heartRateTrend === "up" ? "trending up" : m.heartRateTrend === "down" ? "trending down" : "stable"}, ${m.totalSteps.toLocaleString()} steps this week, ${m.medicationAdherencePct} percent medication adherence, and about ${m.avgSleepHours} hours of sleep per night.`,
      lang,
    );
  }
}
