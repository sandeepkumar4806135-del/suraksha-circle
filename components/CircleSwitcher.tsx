"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import { joinCircleByCode, type JoinedCircle } from "@/lib/circle-manager";

interface CircleSwitcherProps {
  circles: JoinedCircle[];
  activeCircleId: string;
  onSelect: (id: string) => void;
  onJoin: (circle: JoinedCircle) => void;
  /** Elder Mode: large high-contrast touch targets. */
  elder?: boolean;
}

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

  const handleJoin = () => {
    const result = joinCircleByCode(code, circles);
    if (!result) {
      setError("Code must be at least 3 characters");
      return;
    }
    setError(null);
    setCode("");
    onJoin(result.joined);
    setOpen(false);
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
                  setCode(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoin();
                }}
                placeholder="e.g. SC-sharma-family-circle"
                className="min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={handleJoin}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-emerald-600 px-3 font-extrabold text-white transition hover:bg-emerald-700 active:scale-95"
              >
                <Plus aria-hidden className="h-4 w-4" />
                Join
              </button>
            </div>
            {error && (
              <p className="px-2 pt-1.5 text-xs font-bold text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
