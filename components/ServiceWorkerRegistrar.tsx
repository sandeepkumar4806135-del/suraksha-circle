"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production builds only. */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[Suraksha Circle] Service worker registration failed:", err);
    });
  }, []);
  return null;
}
