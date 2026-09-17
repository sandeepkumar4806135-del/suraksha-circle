import { ACTIVE_CIRCLE_ID } from "./circle-events";

/** A circle the user has joined. */
export interface JoinedCircle {
  id: string;
  name: string;
  emoji: string;
}

const CIRCLES_KEY = "suraksha.active-circles";
const ACTIVE_KEY = "suraksha.active-circle-id";

/** Seed list so a fresh install has something to switch between. */
export const DEFAULT_CIRCLES: JoinedCircle[] = [
  { id: ACTIVE_CIRCLE_ID, name: "Sharma Family", emoji: "🏠" },
];

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Loads the list of joined circles from localStorage (with defaults). */
export function loadJoinedCircles(): JoinedCircle[] {
  if (!isBrowser()) return [...DEFAULT_CIRCLES];
  try {
    const raw = window.localStorage.getItem(CIRCLES_KEY);
    if (!raw) return [...DEFAULT_CIRCLES];
    const parsed = JSON.parse(raw) as JoinedCircle[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_CIRCLES];
    // Sanity: every entry needs an id and name.
    const valid = parsed.filter((c) => c && typeof c.id === "string" && typeof c.name === "string");
    return valid.length > 0 ? valid : [...DEFAULT_CIRCLES];
  } catch {
    return [...DEFAULT_CIRCLES];
  }
}

/** Persists the joined-circles list. */
export function saveJoinedCircles(circles: JoinedCircle[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CIRCLES_KEY, JSON.stringify(circles));
  } catch {
    // storage full / private mode — non-fatal, session-only circles
  }
}

/** Loads the persisted active circle id, defaulting to ACTIVE_CIRCLE_ID. */
export function loadActiveCircleId(circles: JoinedCircle[]): string {
  if (!isBrowser()) return circles[0]?.id ?? ACTIVE_CIRCLE_ID;
  try {
    const id = window.localStorage.getItem(ACTIVE_KEY);
    if (id && circles.some((c) => c.id === id)) return id;
  } catch {
    // fall through
  }
  return circles[0]?.id ?? ACTIVE_CIRCLE_ID;
}

/** Persists the active circle id. */
export function saveActiveCircleId(id: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // non-fatal
  }
}

/**
 * Joins a circle via a join code. In this MVP the code is the circle id,
 * optionally prefixed with "SC-" (case/space tolerant):
 *   "sharma-family-circle" or "SC-sharma-family-circle"
 * Returns null for invalid codes.
 */
export function joinCircleByCode(
  code: string,
  circles: JoinedCircle[]
): { circles: JoinedCircle[]; joined: JoinedCircle } | null {
  const id = code.trim().replace(/^SC-/i, "").toLowerCase();
  if (!id || id.length < 3) return null;
  const existing = circles.find((c) => c.id === id);
  if (existing) return { circles, joined: existing };
  const joined: JoinedCircle = {
    id,
    name: id
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    emoji: "🛡️",
  };
  const next = [...circles, joined];
  saveJoinedCircles(next);
  return { circles: next, joined };
}

/** Adds a freshly created circle and returns the updated list. */
export function addCircle(circles: JoinedCircle[], circle: JoinedCircle): JoinedCircle[] {
  if (circles.some((c) => c.id === circle.id)) return circles;
  const next = [...circles, circle];
  saveJoinedCircles(next);
  return next;
}
