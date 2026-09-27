/**
 * Central feature flags.
 *
 * CARETAKER_ACCESS_ENABLED — PARKED, deliberately (not an oversight).
 * The external caretaker/doctor portal is out of reach while this is false:
 * the family-side "generate a code" card is hidden (app/page.tsx) and the
 * public /caretaker route returns a "not available yet" notice before any
 * auth check or Firestore read runs (app/caretaker/page.tsx).
 *
 * Why parked: the portal has two known blockers — it is hardcoded to the
 * demo circle (ACTIVE_CIRCLE_ID) and it has no Firebase Auth session, so its
 * reads fail against the Firestore rules already deployed. It needs an
 * architecture decision (Cloud Function code->grant lookup vs. deliberately
 * looser rules) before it can be trusted with elder health data. Flipping
 * this to true is one line, but do the auth fix first — the portal code is
 * kept intact for exactly that.
 */
export const CARETAKER_ACCESS_ENABLED = false;
