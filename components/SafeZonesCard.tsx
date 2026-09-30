"use client";

import { useState } from "react";
import { Home, MapPin, Navigation, Plus, School, Trash2, X } from "lucide-react";
import {
  distanceMeters,
  isInsideZone,
  type GeoPosition,
  type SafeZone,
  type SafeZoneMember,
} from "@/lib/safe-zones";

interface SafeZonesCardProps {
  zones: SafeZone[];
  /** Live device position from useGeofenceWatcher (null until permitted). */
  position: GeoPosition | null;
  geoError: string | null;
  /**
   * Other members' last shared positions (empty when nobody shares). Only the
   * caller's own component decides what to pass here — in demo mode it passes
   * fixture positions, in live mode the real `members.{uid}.location` values.
   */
  members: SafeZoneMember[];
  /** Offline demo mode: fall back to fixture coordinates for "You". */
  demo?: boolean;
  elder?: boolean;
  lang?: "en" | "hi";
  onAdd: (zone: { name: string; emoji: string; lat: number; lng: number; radiusM: number }) => void;
  onRemove: (zone: SafeZone) => void;
}

/** Demo-mode anchor — the only place a fixture coordinate is still allowed. */
const DEMO_SELF: GeoPosition = { lat: 19.1364, lng: 72.8296 };

export default function SafeZonesCard({
  zones,
  position,
  geoError,
  members,
  demo = false,
  elder = false,
  lang = "en",
  onAdd,
  onRemove,
}: SafeZonesCardProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [radiusM, setRadiusM] = useState(200);
  const [formError, setFormError] = useState<string | null>(null);

  const hi = lang === "hi";
  const t = {
    title: hi ? "🛡️ सुरक्षित क्षेत्र" : "🛡️ Safe Zones",
    subtitle: hi ? "घर और स्कूल आने-जाने की सूचनाएँ" : "Home & school arrival alerts",
    you: hi ? "आप" : "You",
    inside: (n: string) => (hi ? `${n} ज़ोन में` : `${n} inside`),
    outside: (n: string) => (hi ? `${n} बाहर` : `${n} outside`),
    safeAtHome: hi ? "घर पर सुरक्षित" : "Safe at Home",
    add: hi ? "सुरक्षित क्षेत्र जोड़ें" : "Add Safe Zone",
    addShort: hi ? "जोड़ें" : "Add",
    cancel: hi ? "रद्द करें" : "Cancel",
    zoneName: hi
      ? "क्षेत्र का नाम (जैसे: घर - शांति अपार्टमेंट्स)"
      : "Zone name (e.g. Home - Shanti Apartments)",
    radius: hi ? "त्रिज्या" : "Radius",
    empty: hi ? "कोई सुरक्षित क्षेत्र नहीं — एक जोड़ें!" : "No safe zones yet — add one!",
    meters: hi ? "मीटर" : "m",
    needLocation: hi
      ? "मौजूदा जगह पर ज़ोन जोड़ने के लिए लोकेशन की अनुमति दें"
      : "Allow location access to add a zone at your current spot",
    waiting: hi ? "इस डिवाइस की लोकेशन का इंतज़ार…" : "Waiting for this device’s location…",
    noPresence: hi
      ? "अभी और कोई लाइव लोकेशन साझा नहीं कर रहा है"
      : "No one else is sharing their location right now",
  };

  // "You" badge position: live GPS when available, else the offline demo anchor.
  const selfPos: GeoPosition | null = position ?? (demo ? DEMO_SELF : null);

  const zoneIcon = (z: SafeZone) =>
    z.emoji === "🏫" ? School : z.emoji === "🏠" ? Home : MapPin;

  const handleAdd = () => {
    // A live zone is anchored where the user really is: never invent a
    // coordinate in live mode, ask for the location permission instead.
    const anchor = position ?? (demo ? DEMO_SELF : null);
    if (!anchor) {
      setFormError(t.needLocation);
      return;
    }
    onAdd({
      name: name.trim() || "New Safe Zone",
      emoji: name.includes("School") ? "🏫" : "🏠",
      lat: anchor.lat,
      lng: anchor.lng,
      radiusM,
    });
    setName("");
    setRadiusM(200);
    setFormError(null);
    setAdding(false);
  };

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-label="Safe zones"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h3 className={`${elder ? "text-2xl" : "text-lg"} font-extrabold text-slate-900`}>
            {t.title}
          </h3>
          <p className={`${elder ? "text-base" : "text-xs"} font-semibold text-slate-400`}>
            {t.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setAdding((a) => !a);
          }}
          aria-expanded={adding}
          aria-label={t.add}
          className={`flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 font-extrabold text-white shadow transition hover:bg-emerald-700 active:scale-95 ${
            elder ? "min-h-14 px-5 text-lg" : "min-h-10 px-3.5 text-xs"
          }`}
        >
          {adding ? <X aria-hidden className="h-4 w-4" /> : <Plus aria-hidden className="h-4 w-4" />}
          {adding ? t.cancel : t.addShort}
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-2.5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.zoneName}
            className={`w-full rounded-xl border-2 border-slate-200 bg-white px-3 font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none ${
              elder ? "min-h-14 text-lg" : "min-h-11 text-sm"
            }`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">
              {t.radius}
            </span>
            {[100, 200, 500].map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRadiusM(r)}
                aria-pressed={radiusM === r}
                className={`rounded-full border-2 font-bold transition ${
                  radiusM === r
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-emerald-400"
                } ${elder ? "min-h-12 px-4 text-base" : "min-h-9 px-3 text-xs"}`}
              >
                {r} {t.meters}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-extrabold text-white shadow transition hover:bg-emerald-700 active:scale-[0.98] ${
              elder ? "min-h-16 text-xl" : "min-h-12 text-sm"
            }`}
          >
            <Navigation aria-hidden className="h-5 w-5" />
            {t.add}
          </button>
          {formError && (
            <p
              className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800"
              role="status"
            >
              ⚠️ {formError}
            </p>
          )}
        </div>
      )}

      {zones.length === 0 ? (
        <p
          className={`mt-4 rounded-2xl bg-slate-50 p-4 text-center font-semibold text-slate-500 ${
            elder ? "text-lg" : "text-sm"
          }`}
        >
          {t.empty}
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {zones.map((z) => {
            const Icon = zoneIcon(z);
            const selfInside = selfPos ? isInsideZone(selfPos, z) : null;
            const selfDist = selfPos ? Math.round(distanceMeters(selfPos, z)) : null;
            const selfIsHome = selfInside === true && z.emoji === "🏠";
            return (
              <li
                key={z.id}
                className="relative flex items-start gap-3 rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 ${
                    elder ? "h-14 w-14" : "h-11 w-11"
                  }`}
                  aria-hidden
                >
                  <Icon className={elder ? "h-8 w-8" : "h-6 w-6"} />
                </span>
                <div className={`min-w-0 flex-1 ${elder ? "py-3" : "py-2.5"}`}>
                  <p className={`${elder ? "text-xl" : "text-base"} font-extrabold text-slate-900`}>
                    {z.name}
                  </p>
                  <p className={`font-semibold text-slate-500 ${elder ? "text-base" : "text-xs"}`}>
                    {z.emoji} {z.radiusM} {t.meters}
                    {selfDist !== null ? ` · ${selfDist} ${t.meters} away` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selfInside !== null && (
                      <PresenceBadge
                        label={
                          selfIsHome
                            ? t.safeAtHome
                            : selfInside
                              ? t.inside(t.you)
                              : t.outside(t.you)
                        }
                        inside={selfInside}
                        elder={elder}
                      />
                    )}
                    {members.map((m) => {
                      const inside = isInsideZone(m, z);
                      const isHome = z.emoji === "🏠" && inside;
                      return (
                        <PresenceBadge
                          key={m.uid}
                          label={
                            isHome
                              ? `${m.emoji} ${t.safeAtHome}`
                              : `${m.emoji} ${inside ? t.inside(m.label) : t.outside(m.label)}`
                          }
                          inside={inside}
                          elder={elder}
                        />
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(z)}
                  aria-label={`Delete ${z.name}`}
                  className="shrink-0 self-stretch px-3 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 aria-hidden className={elder ? "h-6 w-6" : "h-4 w-4"} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {geoError && (
        <p
          className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
          role="status"
        >
          ⚠️ {geoError}
        </p>
      )}

      {!geoError && !position && !demo && (
        <p
          className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500"
          role="status"
        >
          📍 {t.waiting}
        </p>
      )}

      {members.length === 0 && zones.length > 0 && (
        <p className="mt-2 px-1 text-xs font-semibold text-slate-400">👥 {t.noPresence}</p>
      )}
    </section>
  );
}

function PresenceBadge({
  label,
  inside,
  elder,
}: {
  label: string;
  inside: boolean;
  elder: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-black ${
        inside ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      } ${elder ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-[0.68rem]"}`}
    >
      {inside && <span aria-hidden>✅</span>}
      {label}
    </span>
  );
}
