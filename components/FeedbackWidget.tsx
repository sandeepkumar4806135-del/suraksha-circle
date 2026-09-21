"use client";

import { useState } from "react";
import { MessageSquareHeart, Send, X } from "lucide-react";
import { submitBetaFeedback, type FeedbackCategory } from "@/lib/beta-feedback";

export default function FeedbackWidget({ elder, lang, activeView }: { elder?: boolean; lang?: "en" | "hi"; activeView: string }) {
  const hi = lang === "hi";
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const t = {
    label: hi ? "Feedback" : "Give Feedback",
    title: hi ? "Beta Feedback" : "Beta Feedback",
    sub: hi ? "Bugs and ideas welcome" : "Bugs, ideas, or kind words — tell us",
    thanks: hi ? "Thank you for feedback!" : "Thank you! Your feedback helps us improve SurakshaCircle.",
    close: hi ? "Close" : "Close",
    cancel: hi ? "Cancel" : "Cancel",
  };
  async function submit() {
    const text = message.trim();
    if (text.length < 5 || sending) return;
    setSending(true);
    const deviceType = typeof window !== "undefined" && window.innerWidth < 640 ? "mobile" : "desktop";
    await submitBetaFeedback({ userId: "beta-tester", userName: activeView === "elder" ? "Mummy" : "Rahul", category, message: text, activeView, deviceType });
    setSending(false);
    setDone(true);
    setMessage("");
    window.setTimeout(() => { setDone(false); setOpen(false); }, 2600);
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t.label} className="fixed bottom-20 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-xl hover:bg-emerald-700 sm:bottom-6 sm:right-6">
        <MessageSquareHeart aria-hidden className="h-5 w-5" />
        {t.label}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t.title} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">{t.title}</h2>
                <p className="text-sm font-semibold text-slate-500">{t.sub}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            {done ? (
              <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-4 text-center font-extrabold text-emerald-700">{t.thanks}</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(["bug", "feature", "general"] as FeedbackCategory[]).map((c) => (
                    <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={category === c ? "rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-2 text-xs font-extrabold text-emerald-800" : "rounded-2xl border-2 border-slate-200 bg-white p-2 text-xs font-extrabold text-slate-500"}>
                      {c}
                    </button>
                  ))}
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} className="mt-3 w-full rounded-2xl border-2 border-slate-200 p-3 text-sm text-slate-800" />
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="min-h-12 flex-1 rounded-2xl border-2 border-slate-200 text-sm font-extrabold text-slate-600">{t.cancel}</button>
                  <button type="button" onClick={submit} disabled={message.trim().length < 5 || sending} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-extrabold text-white disabled:opacity-50">
                    <Send aria-hidden className="h-4 w-4" />
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {elder ? <span className="hidden" /> : null}
    </>
  );
}
