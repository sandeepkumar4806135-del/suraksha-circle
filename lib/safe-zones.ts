import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { pushCircleEvent } from "./circle-events";

/** A user-defined safe zone (geofence). */
export interface SafeZone {
  id: string;
  circleId: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  /** Geofence radius in meters. */
  radiusM: number;
  createdAt: number;
}

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracyM?: number;
}

// ---------------------------------------------------------------------------
// Distance / boundary math (haversine — fine for <100 km ranges)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in meters. */
export function distanceMeters(a: GeoPosition, b: GeoPosition): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** True when the position is inside the zone's geofence. */
export function isInsideZone(pos: GeoPosition, zone: SafeZone): boolean {
  return distanceMeters(pos, zone) <= zone.radiusM;
}

// ---------------------------------------------------------------------------
// Persistence — localStorage (instant) + Firestore per circle (shared)
// ---------------------------------------------------------------------------

const LS_KEY_PREFIX = "suraksha.safe-zones.";

function lsKey(circleId: string): string {
  return `${LS_KEY_PREFIX}${circleId}`;
}

function normalizeZone(circleId: string, id: string, d: DocumentData): SafeZone {
  const created = d.createdAt;
  return {
    id,
    circleId,
    name: (d.name as string) ?? "Safe zone",
    emoji: (d.emoji as string) ?? "📍",
    lat: Number(d.lat),
    lng: Number(d.lng),
    radiusM: Number(d.radiusM) || 150,
    createdAt:
      created instanceof Timestamp
        ? created.toMillis()
        : typeof created === "number"
          ? created
          : Date.now(),
  };
}

function loadLocalZones(circleId: string): SafeZone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(lsKey(circleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SafeZone[];
    return Array.isArray(parsed)
      ? parsed.filter((z) => z && z.id && typeof z.lat === "number")
      : [];
  } catch {
    return [];
  }
}

function saveLocalZones(circleId: string, zones: SafeZone[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(circleId), JSON.stringify(zones));
  } catch {
    // storage full — session-only zones
  }
}

/** Demo zones (Andheri West area) shown when Firebase is not configured. */
export const DEMO_ZONES: SafeZone[] = [
  { id: "zone-home", circleId: "", name: "Home - Shanti Apartments", emoji: "🏠", lat: 19.1364, lng: 72.8296, radiusM: 200, createdAt: 0 },
  { id: "zone-school", circleId: "", name: "Aryan's School - Versova", emoji: "🏫", lat: 19.1339, lng: 72.8147, radiusM: 250, createdAt: 0 },
];

/** Live-subscribes to the circle's safe zones; falls back to demo zones. */
export function subscribeToSafeZones(
  circleId: string,
  onData: (zones: SafeZone[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const db = getDb();
  if (!db) {
    onData(DEMO_ZONES.map((z) => ({ ...z, circleId })));
    return () => undefined;
  }
  const q = query(
    collection(db, "circles", circleId, "safezones"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const zones = snap.docs.map((d) => normalizeZone(circleId, d.id, d.data()));
      saveLocalZones(circleId, zones);
      onData(zones);
    },
    (err) => {
      onError?.(err);
      const local = loadLocalZones(circleId);
      onData(local.length ? local : DEMO_ZONES.map((z) => ({ ...z, circleId })));
    }
  );
}

/** Adds a safe zone to Firestore (when configured) and returns the local copy. */
export async function addSafeZone(
  circleId: string,
  zone: Omit<SafeZone, "id" | "circleId" | "createdAt">
): Promise<SafeZone> {
  const full: SafeZone = {
    ...zone,
    circleId,
    id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  saveLocalZones(circleId, [...loadLocalZones(circleId), full]);
  const db = getDb();
  if (db) {
    try {
      await addDoc(collection(db, "circles", circleId, "safezones"), {
        name: zone.name,
        emoji: zone.emoji,
        lat: zone.lat,
        lng: zone.lng,
        radiusM: zone.radiusM,
        createdAt: serverTimestamp(),
      });
    } catch {
      // offline — localStorage copy keeps it usable for this device
    }
  }
  return full;
}

/** Removes a safe zone from Firestore and localStorage. */
export async function removeSafeZone(zone: SafeZone): Promise<void> {
  saveLocalZones(
    zone.circleId,
    loadLocalZones(zone.circleId).filter((z) => z.id !== zone.id)
  );
  const db = getDb();
  if (db) {
    try {
      await deleteDoc(doc(db, "circles", zone.circleId, "safezones", zone.id));
    } catch {
      // offline — local removal already applied
    }
  }
}

// ---------------------------------------------------------------------------
// Geofence watcher — compares device coordinates against zones and pushes
// arrival/departure events on boundary crossings.
// ---------------------------------------------------------------------------

/** Hysteresis margin (meters) to avoid event flapping near the boundary. */
const EXIT_MARGIN_M = 20;
/** Minimum ms between transitions for the same zone. */
const COOLDOWN_MS = 60000;

export interface GeofenceTransition {
  zone: SafeZone;
  kind: "arrival" | "departure";
}

/**
 * Watches the device position and reports boundary crossings.
 * - Requires user permission; degrades to a null position otherwise.
 * - Hysteresis (exit only beyond radius + 20 m) + 60 s per-zone cooldown keep
 *   GPS jitter from spamming the circle feed.
 */
export function useGeofenceWatcher(
  circleId: string,
  actorName: string,
  zones: SafeZone[],
  enabled = true
): { position: GeoPosition | null; error: string | null } {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insideRef = useRef<Map<string, boolean>>(new Map());
  const lastFireRef = useRef<Map<string, number>>(new Map());
  const zonesRef = useRef<SafeZone[]>(zones);

  // Keep the ref in sync via an effect (assigning refs during render is unsafe
  // with concurrent rendering).
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) {
      // Defer the state update out of the effect body (avoids cascading renders).
      const t = setTimeout(() => {
        setError(enabled ? "Geolocation not supported on this device" : null);
      }, 0);
      return () => clearTimeout(t);
    }
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        const pos: GeoPosition = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: p.coords.accuracy,
        };
        setPosition(pos);
        const now = Date.now();
        for (const zone of zonesRef.current) {
          const dist = distanceMeters(pos, zone);
          const wasInside = insideRef.current.get(zone.id) ?? false;
          const isInside = wasInside
            ? dist <= zone.radiusM + EXIT_MARGIN_M
            : dist <= zone.radiusM;
          if (isInside === wasInside) continue;

          const last = lastFireRef.current.get(zone.id) ?? 0;
          if (now - last < COOLDOWN_MS) continue;
          lastFireRef.current.set(zone.id, now);
          insideRef.current.set(zone.id, isInside);

          const kind: GeofenceTransition["kind"] = isInside ? "arrival" : "departure";
          void pushCircleEvent({
            circleId,
            type: kind === "arrival" ? "zone-arrival" : "zone-departure",
            actorName,
            title: kind === "arrival" ? `📍 Arrived at ${zone.name}` : `🚶 Left ${zone.name}`,
            detail: `${Math.round(dist)}m from zone center`,
          });
        }
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — safe zone tracking is off"
            : "Location unavailable"
        );
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [circleId, actorName, enabled]);

  return { position, error };
}

