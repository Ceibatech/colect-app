"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { INACTIVITE_MINUTES } from "@/lib/activite/categories";

/**
 * Mesure du temps de travail : chaque minute, si la personne a agi (clavier,
 * souris, toucher, défilement) dans les 10 dernières minutes et que l'onglet
 * est visible, la page signale une minute active pour l'écran ouvert.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  useEffect(() => {
    let lastAction = Date.now();
    const mark = () => { lastAction = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const name of events) window.addEventListener(name, mark, { passive: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAction > INACTIVITE_MINUTES * 60_000) return;
      void fetch("/api/activite/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname, tab }),
        keepalive: true,
      }).catch(() => undefined);
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, mark);
    };
  }, [pathname, tab]);

  return null;
}
