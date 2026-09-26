"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, Users } from "lucide-react";
import type { JoinedCircle } from "@/lib/circle-manager";

interface CircleSwitcherProps {
  circles: JoinedCircle[];
  activeCircleId: string;
  onSelect: (id: string) => void;
  /**
   * Joins a circle from a real invite code. Resolves to an error message to
   * display, or null when the join succeeded (the parent adds the circle).
   */
  onJoin: (code: string) => Promise<string | null>;
  /** Elder Mode: large high-contrast touch targets. */
  elder?: boolean;
}

/** Server-side invite codes: 6 chars, no ambiguous I/O/0/1. */
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

/** Header dropdown: shows the active circle, switches circles, joins by code. */
export default function CircleSwitcher({
  circles,
  activeCircleId,
  onSelect,
  onJoin,
  elder = false,
}: CircleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const active = circles.find((c) => c.id === activeCircleId) ?? circles[0];

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * Joins with a real invite code. Only codes that resolve to an existing
   * circle server-side succeed — there is no way to add an arbitrary circle.
   */
  const handleJoin = async () => {
    if (joining) return;
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!CODE_PATTERN.test(normalized)) {
      setError("Enter the 6-character invite code");
      return;
    }
    setError(null);
    setJoining(true);
    try {
      const message = await onJoin(normalized);
      if (message) {
        setError(message);
        return;
      }
      setCode("");
      setOpen(false);
    } catch {
      setError("Could not join that circle. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const btn = elder
    ? "min-h-14 px-4 text-base"
    : "min-h-10 px-3 text-xs";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border-2 border-emerald-200 bg-emerald-50 font-extrabold text-emerald-900 shadow-sm transition hover:bg-emerald-100 active:scale-95 ${btn}`}
      >
        <span aria-hidden className="text-lg leading-none">{active?.emoji ?? "🏠"}</span>
        <span className={`max-w-[8rem] truncate sm:max-w-[12rem] ${elder ? "text-base" : "text-xs"}`}>
          {active?.name ?? "My Circle"}
        </span>
        <ChevronDown aria-hidden className={`${elder ? "h-5 w-5" : "h-4 w-4"} shrink-0 opacity-70`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch circle"
          className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border-2 border-slate-200 bg-white p-2 shadow-2xl"
        >
          <p className="px-2 pb-1 pt-1.5 text-[0.65rem] font-black uppercase tracking-wider text-slate-400">
            Your circles
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {circles.length === 0 && (
              <li className="px-2 py-3 text-sm font-semibold text-slate-500">
                No circles yet — join one with your invite code below.
              </li>
            )}
            {circles.map((c) => {
              const isActive = c.id === activeCircleId;
              return (
                <li key={c.id}>
                  <button
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                    className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-bold transition ${
                      isActive
                        ? "bg-emerald-100 text-emerald-900"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span aria-hidden className="text-xl leading-none">{c.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {isActive && <Check aria-hidden className="h-5 w-5 shrink-0 text-emerald-600" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 border-t-2 border-slate-100 pt-2">
            <label
              htmlFor="join-code"
              className="flex items-center gap-1 px-2 pb-1 text-[0.65rem] font-black uppercase tracking-wider text-slate-400"
            >
              <Users aria-hidden className="h-3.5 w-3.5" /> Join with a code
            </label>
            <div className="flex gap-2 px-1">
              <input
                ref={inputRef}
                id="join-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleJoin();
                }}
                placeholder="e.g. 7KQ2MP"
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
                disabled={joining}
                aria-describedby="join-code-help"
                className="min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold uppercase tracking-widest text-slate-800 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
              />
              <button
                onClick={() => void handleJoin()}
                disabled={joining}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-emerald-600 px-3 font-extrabold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-60"
              >
                {joining ? (
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus aria-hidden className="h-4 w-4" />
                )}
                {joining ? "Joining…" : "Join"}
              </button>
            </div>
            {error ? (
              <p className="px-2 pt-1.5 text-xs font-bold text-red-600" role="alert">
                {error}
              </p>
            ) : (
              <p id="join-code-help" className="px-2 pt-1.5 text-xs font-semibold text-slate-400">
                Only codes shared by an existing member work.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
