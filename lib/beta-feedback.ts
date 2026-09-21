import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDb } from "./firebase";

// ---------------------------------------------------------------------------
// Beta Feedback & Error Reporting — Phase 6 (Beta Hardening)
// Collection: betaFeedback/{feedbackId}
// ---------------------------------------------------------------------------

export type FeedbackCategory = "bug" | "feature" | "general";

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["bug", "feature", "general"];

export interface BetaFeedbackInput {
  userId: string;
  userName: string;
  /** Optional phone (only when the tester chooses to share it). */
  userPhone?: string;
  category: FeedbackCategory;
  message: string;
  /** Active view when submitted, e.g. "elder" | "family". */
  activeView: string;
  /** Device hint, e.g. "mobile" | "desktop". */
  deviceType: string;
}

/**
 * Writes beta feedback to Firestore `betaFeedback`. Best-effort: resolves
 * true when stored, false when Firebase is unavailable or the write fails
 * (callers still thank the tester — feedback is never lost silently in UX).
 */
export async function submitBetaFeedback(input: BetaFeedbackInput): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await addDoc(collection(db, "betaFeedback"), {
      userId: input.userId,
      userName: input.userName,
      userPhone: input.userPhone ?? "",
      category: input.category,
      message: input.message,
      activeView: input.activeView,
      deviceType: input.deviceType,
      timestamp: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}
