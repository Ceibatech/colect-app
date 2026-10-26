"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Flag, Loader2, LocateFixed, Navigation, Pause } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { convoyState, type GeoPoint } from "@/lib/transfers/convoy";
import { ConvoyTrackMap } from "@/components/transferts/ConvoyTrackMap";

interface TrackingPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  capturedAt: string;
  capturedBy: { name: string };
}

interface ConvoyEventView {
  type: "DEPART" | "ARRIVEE";
  occurredAt: string;
  automatic: boolean;
  user: { name: string } | null;
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Africa/Abidjan" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Abidjan" });

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  });
}

/**
 * Suivi du convoi. Le convoyeur appuie sur « Démarrer le trajet » : le départ
 * est déclaré (les deux sites sont prévenus) et sa position est envoyée toutes
 * les 15 s. À l'arrivée — bouton « Je suis arrivé » ou position à moins de
 * 150 m du site d'arrivée — les responsables des deux sites sont notifiés.
 */
export function ConvoyTrackingPanel({ lotId, canTrack, mapsKey }: { lotId: number; canTrack: boolean; mapsKey?: string | null }) {
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [events, setEvents] = useState<ConvoyEventView[]>([]);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  const load = useCallback(async () => {
    const response = await fetch(`/api/transferts/${lotId}/tracking`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { points: TrackingPoint[]; events?: ConvoyEventView[]; destination?: GeoPoint | null };
    setPoints(payload.points);
    setEvents(payload.events ?? []);
    setDestination(payload.destination ?? null);
    setLoading(false);
  }, [lotId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTracking(false);
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  function watch() {
    if (!navigator.geolocation) return toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < 15_000) return;
        lastSentAtRef.current = now;
        void fetch(`/api/transferts/${lotId}/tracking`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed ?? undefined,
            heading: position.coords.heading ?? undefined,
            capturedAt: new Date(position.timestamp).toISOString(),
          }),
        }).then(async (response) => {
          const body = await response.json().catch(() => ({})) as { error?: string; arrived?: boolean };
          if (!response.ok) {
            if (response.status !== 429) toast.error(body.error ?? "Point GPS non enregistré.");
            return;
          }
          if (body.arrived) {
            stopWatching();
            toast.success("Arrivée détectée : les responsables des deux sites sont prévenus.");
          }
          await load();
        });
      },
      (error) => {
        stopWatching();
        toast.error(error.code === error.PERMISSION_DENIED ? "Autorisez la localisation pour suivre le convoi." : "La position du convoi est indisponible.");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }

  async function declare(action: "depart" | "arrivee") {
    setBusy(true);
    try {
      const position = await currentPosition();
      const response = await fetch(`/api/transferts/${lotId}/convoi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, latitude: position?.coords.latitude, longitude: position?.coords.longitude }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Impossible d'enregistrer ce jalon.");
      if (action === "depart") {
        toast.success("Trajet démarré : les deux sites sont prévenus.");
        watch();
      } else {
        stopWatching();
        toast.success("Arrivée enregistrée : les responsables des deux sites sont prévenus.");
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer ce jalon.");
    } finally {
      setBusy(false);
    }
  }

  const state = convoyState(events);
  const latest = points.at(-1);
  const googleLink = latest ? `https://www.google.com/maps/search/?api=1&query=${latest.latitude},${latest.longitude}` : null;
  const departure = [...events].reverse().find((event) => event.type === "DEPART");
  const status = state.arrived
    ? `Arrivé à ${timeFormatter.format(state.arrivedAt!)}${state.arrivalAutomatic ? " (détecté automatiquement)" : ""}`
    : state.onTheRoad
      ? `En route depuis ${timeFormatter.format(state.departedAt!)}${departure?.user ? `, ${departure.user.name}` : ""}`
      : "Pas encore parti";

  return (
    <Card className="bg-card/95">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle>Suivi du convoi</CardTitle><CardDescription>{status}</CardDescription></div>
          <Badge variant={state.arrived ? "default" : "outline"} className="w-fit rounded-md">
            {tracking ? "Position envoyée en direct" : state.arrived ? "Véhicule arrivé" : state.onTheRoad ? "En route" : `${points.length} point${points.length > 1 ? "s" : ""}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          {points.length || destination ? (
            <ConvoyTrackMap points={points} destination={destination} mapsKey={mapsKey} />
          ) : (
            <div className="flex min-h-24 items-center gap-4 rounded-md border bg-muted/20 p-4">
              <LocateFixed className="size-5 text-primary" />
              <p className="text-sm">{loading ? "Chargement du trajet…" : "Aucune position reçue."}</p>
            </div>
          )}
          {latest ? <p className="text-sm text-muted-foreground">Dernière position : {dateTimeFormatter.format(new Date(latest.capturedAt))}, précision {Math.round(latest.accuracy ?? 0)} m, {latest.capturedBy.name}</p> : null}
          <div className="flex flex-wrap gap-2 [&_button]:min-h-11">
            {canTrack && !state.onTheRoad && !state.arrived ? (
              <Button disabled={busy} onClick={() => void declare("depart")}>{busy ? <Loader2 className="animate-spin" /> : <Navigation />} Démarrer le trajet</Button>
            ) : null}
            {canTrack && !state.onTheRoad && state.arrived ? (
              <Button variant="outline" disabled={busy} onClick={() => void declare("depart")}><Navigation /> Nouveau trajet</Button>
            ) : null}
            {canTrack && state.onTheRoad && !tracking ? <Button variant="outline" onClick={watch}><Navigation /> Reprendre le suivi</Button> : null}
            {canTrack && state.onTheRoad ? (
              <Button disabled={busy} onClick={() => void declare("arrivee")}>{busy ? <Loader2 className="animate-spin" /> : <Flag />} Je suis arrivé</Button>
            ) : null}
            {canTrack && tracking ? <Button variant="ghost" onClick={stopWatching}><Pause /> Suspendre l&apos;envoi</Button> : null}
            {googleLink ? <Button variant="outline" render={<a href={googleLink} target="_blank" rel="noreferrer" />}><ExternalLink /> Ouvrir dans Google Maps</Button> : null}
          </div>
          {canTrack ? <p className="text-xs leading-5 text-muted-foreground">Gardez cette page ouverte pendant le trajet. L&apos;arrivée est aussi détectée automatiquement à moins de 150 m du site d&apos;arrivée lorsque sa position GPS est renseignée.</p> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Jalons</p>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {[...events].reverse().map((event, index) => (
              <div key={`${event.type}-${event.occurredAt}-${index}`} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
                {event.type === "ARRIVEE" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-green" /> : <Navigation className="mt-0.5 size-3.5 shrink-0 text-primary" />}
                <span><span className="font-medium">{event.type === "ARRIVEE" ? "Arrivée" : "Départ"} · {dateTimeFormatter.format(new Date(event.occurredAt))}</span><span className="mt-0.5 block text-muted-foreground">{event.automatic ? "Détectée par GPS" : event.user?.name ?? ""}</span></span>
              </div>
            ))}
            {points.slice(-3).reverse().map((point) => (
              <div key={point.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"><LocateFixed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span><span className="font-medium">{dateTimeFormatter.format(new Date(point.capturedAt))}</span><span className="mt-0.5 block text-muted-foreground">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span></span></div>
            ))}
            {!loading && points.length === 0 && events.length === 0 ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Le journal du trajet apparaîtra ici.</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
