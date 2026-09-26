import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Shared connectivity store — Phase 6 (Beta Hardening)
// ---------------------------------------------------------------------------

/** One Firestore live subscription feeding the Home view. */
export type SyncSource = "events" | "activity" | "sos" | "members";

export interface ConnectivitySnapshot {
  /** Browser-level network state (window online/offline events). */
  online: boolean;
  /** True when any Firestore subscription recently reported an error. */
  syncDegraded: boolean;
}

let online: boolean =
  typeof window === "undefined" ? true : window.navigator.onLine;
const badSources = new Set<SyncSource>();
const listeners = new Set<() => void>();
let browserWired = false;

let cached: ConnectivitySnapshot = { online, syncDegraded: false };

function emit(): void {
  cached = { online, syncDegraded: badSources.size > 0 };
  listeners.forEach((l) => l());
}

function ensureBrowserListeners(): void {
  if (browserWired || typeof window === "undefined") return;
  browserWired = true;
  window.addEventListener("online", () => {
    online = true;
    emit();
  });
  window.addEventListener("offline", () => {
    online = false;
    emit();
  });
}

/**
 * Flag that a Firestore subscription hit an error (sync may be stale).
 * Idempotent — only notifies when the degraded set actually changes.
 */
export function reportSyncError(source: SyncSource): void {
  if (!badSources.has(source)) {
    badSources.add(source);
    emit();
  }
}

/** Clear a previously reported sync issue once snapshots flow again. */
export function reportSyncOk(source: SyncSource): void {
  if (badSources.delete(source)) emit();
}

function subscribe(fn: () => void): () => void {
  ensureBrowserListeners();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): ConnectivitySnapshot {
  return cached;
}

function getServerSnapshot(): ConnectivitySnapshot {
  return { online: true, syncDegraded: false };
}

/** Live connectivity state; re-renders callers the moment it changes. */
export function useConnectivity(): ConnectivitySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
