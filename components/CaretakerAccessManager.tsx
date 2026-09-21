"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import {
  createCaretakerGrant,
  listCaretakerGrants,
  revokeCaretakerGrant,
  ROLE_META,
  type CaretakerGrant,
  type CaretakerRole,
} from "@/lib/caretaker-access";

interface CaretakerAccessManagerProps {
  circleId: string;
  lang?: "en" | "hi";
  /** Fired with a toast message after generate/revoke. */
  onStatusChange?: (msg: string) => void;
}

const PORTAL_PATH = "/caretaker";

/**
 * Family-admin card: generates tokenized, expiring, revocable access codes for
 * doctors / caretakers and lists active grants. The plaintext code is shown
 * exactly once (it's stored hashed) together with the portal link.
 */
export default function CaretakerAccessManager({
  circleId,
  lang = "en",
  onStatusChange,
}: CaretakerAccessManagerProps) {
  const [grants, setGrants] = useState<CaretakerGrant[]>([]);
  const [role, setRole] = useState<CaretakerRole>("doctor");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  // Ticked "now" so expiry comparisons never call Date.now() during render.
  const [nowTs, setNowTs] = useState(0);

  const hi = lang === "hi";

  const t = {
    title: hi ? "🔑 केयरटेकर / डॉक्टर एक्सेस" : "🔑 Caretaker / Doctor Access",
    subtitle: hi
      ? "सीमित, केवल-पढ़ने के लिए पोर्टल के लिए सुरक्षित कोड बनाएं"
      : "Generate secure codes for the read-only visitor portal",
    role: hi ? "भूमिका" : "Role",
    name: hi ? "विज़िटर का नाम" : "Visitor name",
    namePh: hi ? "जैसे: डॉ. मेहता" : "e.g. Dr. Mehta",
    generate: hi ? "कोड जनरेट करें" : "Generate Code",
    generating: hi ? "जनरेट हो रहा है…" : "Generating…",
    fresh: hi ? "नया एक्सेस कोड (एक बार दिखेगा):" : "New access code (shown once):",
    openPortal: hi ? "पोर्टल लिंक कॉपी करें" : "Copy portal link",
    active: hi ? "सक्रिय एक्सेस" : "Active Access",
    none: hi ? "अभी कोई एक्सेस नहीं दिया गया।" : "No access grants yet.",
    revoke: hi ? "रद्द करें" : "Revoke",
    revoked: hi ? "रद्द" : "Revoked",
    expired: hi ? "समाप्त" : "Expired",
    expires: hi ? "समाप्ति" : "Expires",
    readOnly: hi ? "केवल पढ़ने के लिए" : "Read-only",
  };

  const refresh = useCallback(async () => {
    const list = await listCaretakerGrants(circleId);
    setGrants(list);
  }, [circleId]);

  useEffect(() => {
    // Deferred (not synchronous): avoids cascading renders on mount.
    const id = setTimeout(() => {
      void refresh();
      setNowTs(Date.now());
    }, 0);
    const tick = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => {
      clearTimeout(id);
      clearInterval(tick);
    };
  }, [refresh]);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const { code } = await createCaretakerGrant(circleId, role, name || "Visitor", {});
      setFreshCode(code);
      setName("");
      onStatusChange?.(hi ? "✅ एक्सेस कोड बन गया" : "✅ Access code created");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    await revokeCaretakerGrant(circleId, id);
    onStatusChange?.(hi ? "एक्सेस रद्द कर दिया गया" : "Access revoked");
    await refresh();
  };

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString(hi ? "hi-IN" : "en-IN", {
      day: "numeric",
      month: "short",
    });

  return (
    <section
      className="rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm"
      aria-label={t.title}
    >
      <h3 className="text-lg font-extrabold text-slate-900">{t.title}</h3>
      <p className="mt-0.5 text-xs font-semibold text-slate-400">{t.subtitle}</p>

      {/* Generate form */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {t.role}
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CaretakerRole)}
            className="mt-1 min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
          >
            <option value="doctor">{ROLE_META.doctor.emoji} {hi ? "डॉक्टर" : "Doctor"}</option>
            <option value="caretaker">{ROLE_META.caretaker.emoji} {hi ? "केयरटेकर" : "Caretaker"}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {t.name}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePh}
            className="mt-1 min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 font-extrabold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="h-5 w-5" aria-hidden />
          )}
          {busy ? t.generating : t.generate}
        </button>
      </div>

      {/* Freshly generated code — shown exactly once */}
      {freshCode && (
        <div
          className="mt-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4"
          role="status"
        >
          <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
            {t.fresh}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <code className="text-xl font-black tracking-widest text-emerald-900">
              {freshCode}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `${window.location.origin}${PORTAL_PATH}`
                  );
                  onStatusChange?.(
                    hi ? "पोर्टल लिंक कॉपी हुआ" : "Portal link copied"
                  );
                }}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-700"
              >
                {t.openPortal}
              </button>
              <button
                type="button"
                onClick={() => setFreshCode(null)}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="mt-1 text-[0.68rem] font-semibold text-emerald-600">
            {hi ? "कॉपी करके सुरक्षित रूप से साझा करें" : "Copy & share securely"}
          </p>
        </div>
      )}

      {/* Existing grants */}
      <div className="mt-5">
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">
          <KeyRound className="h-3.5 w-3.5" aria-hidden /> {t.active}
        </p>
        {grants.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-slate-400">{t.none}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {grants.map((g) => {
              const meta = ROLE_META[g.role];
              const expired = nowTs > 0 && g.expiresAt < nowTs;
              return (
                <li key={g.id} className="flex items-center gap-3 py-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${meta.tone}`}
                    aria-hidden
                  >
                    {meta.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-slate-900">
                      {g.visitorName}{" "}
                      <span
                        className={`ml-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-black ${meta.tone}`}
                      >
                        {hi ? meta.hi : meta.en}
                      </span>
                    </p>
                    <p className="text-xs font-semibold text-slate-400">
                      {expired
                        ? t.expired
                        : `${t.expires} ${fmtDate(g.expiresAt)}`}
                      {" · "}
                      <span className="text-slate-500">{t.readOnly}</span>
                    </p>
                  </div>
                  {!g.revoked && !expired ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(g.id)}
                      aria-label={`${t.revoke} ${g.visitorName}`}
                      className="shrink-0 rounded-xl p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <span className="shrink-0 text-[0.65rem] font-black uppercase text-slate-300">
                      {g.revoked ? t.revoked : t.expired}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
