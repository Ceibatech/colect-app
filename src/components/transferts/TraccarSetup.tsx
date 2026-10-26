"use client";

import { useState } from "react";
import { Copy, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Suivi écran éteint : l'application gratuite Traccar Client envoie la
 * position du téléphone à GeoArchives même quand le convoyeur utilise Waze ou
 * verrouille son écran (un navigateur, lui, s'arrête en arrière-plan).
 */
export function TraccarSetup() {
  const [token, setToken] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const server = typeof window === "undefined" ? "" : `${window.location.origin}/api/osmand`;

  async function reveal() {
    setLoading(true);
    const response = await fetch("/api/transferts/traccar", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { token?: string; lastSeenAt?: string | null; error?: string };
    setLoading(false);
    if (!response.ok || !body.token) return toast.error(body.error ?? "Identifiant indisponible.");
    setToken(body.token);
    setLastSeenAt(body.lastSeenAt ?? null);
  }

  const copy = (value: string) => navigator.clipboard?.writeText(value).then(() => toast.success("Copié."));

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Smartphone className="size-4" /> Suivi même écran éteint (recommandé)</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted-foreground">Le navigateur arrête le GPS quand vous ouvrez Waze ou verrouillez l&apos;écran. L&apos;application gratuite <strong>Traccar Client</strong> continue d&apos;envoyer votre position.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Installez <a className="text-primary underline underline-offset-4" href="https://play.google.com/store/apps/details?id=org.traccar.client" target="_blank" rel="noreferrer">Traccar Client (Android)</a> ou <a className="text-primary underline underline-offset-4" href="https://apps.apple.com/app/traccar-client/id843156974" target="_blank" rel="noreferrer">Traccar Client (iPhone)</a>.</li>
          <li>Dans ses réglages, collez l&apos;adresse du serveur et votre identifiant ci-dessous, fréquence 15 secondes.</li>
          <li>Activez le suivi dans l&apos;application. Vos positions sont rattachées au convoi en route.</li>
        </ol>
        {token ? (
          <div className="space-y-2">
            {[["Adresse du serveur", server], ["Identifiant de l'appareil", token]].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-mono text-xs">{value}</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy(value)}><Copy /> Copier</Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{lastSeenAt ? `Dernière position reçue de l'application : ${new Date(lastSeenAt).toLocaleString("fr-FR")}` : "Aucune position reçue de l'application pour l'instant."} Gardez cet identifiant pour vous.</p>
          </div>
        ) : (
          <Button type="button" variant="outline" disabled={loading} onClick={() => void reveal()}>Afficher mes réglages</Button>
        )}
      </div>
    </details>
  );
}
