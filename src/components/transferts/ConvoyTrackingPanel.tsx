"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LocateFixed, MapPinned, Navigation, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface TrackingPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  capturedAt: string;
  capturedBy: { name: string };
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" });

export function ConvoyTrackingPanel({ lotId, canTrack }: { lotId: number; canTrack: boolean }) {
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  const loadPoints = useCallback(async () => {
    const response = await fetch(`/api/transferts/${lotId}/tracking`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { points: TrackingPoint[] };
    setPoints(payload.points);
    setLoading(false);
  }, [lotId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadPoints(), 0);
    const timer = window.setInterval(() => void loadPoints(), 20_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadPoints]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTracking(false);
  }, []);

  useEffect(() => stopTracking, [stopTracking]);

  function startTracking() {
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
          if (!response.ok) {
            const body = await response.json().catch(() => ({ error: "Point GPS non enregistré." })) as { error?: string };
            if (response.status !== 429) toast.error(body.error ?? "Point GPS non enregistré.");
            return;
          }
          await loadPoints();
        });
      },
      (error) => {
        stopTracking();
        toast.error(error.code === error.PERMISSION_DENIED ? "Autorisez la localisation pour suivre le convoi." : "La position du convoi est indisponible.");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }

  const latest = points.at(-1);
  const mapUrl = latest ? `https://www.openstreetmap.org/?mlat=${latest.latitude}&mlon=${latest.longitude}#map=16/${latest.latitude}/${latest.longitude}` : null;

  return (
    <Card className="bg-card/95">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle>Suivi du convoi</CardTitle><CardDescription>Points GPS horodatés pendant l&apos;acheminement vers le site B.</CardDescription></div>
          <Badge variant="outline" className="w-fit rounded-md">{tracking ? "Suivi actif" : `${points.length} point${points.length > 1 ? "s" : ""}`}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <div className="flex min-h-28 items-center gap-4 rounded-md border bg-muted/20 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><MapPinned className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="font-semibold">{latest ? `${latest.latitude.toFixed(6)}, ${latest.longitude.toFixed(6)}` : loading ? "Chargement du trajet…" : "Aucune position reçue"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{latest ? `${timeFormatter.format(new Date(latest.capturedAt))} · précision ${Math.round(latest.accuracy ?? 0)} m · ${latest.capturedBy.name}` : "Le convoyeur doit démarrer le suivi depuis son téléphone ou son ordinateur."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canTrack && !tracking ? <Button onClick={startTracking}><Navigation /> Démarrer le suivi</Button> : null}
            {canTrack && tracking ? <Button variant="destructive" onClick={stopTracking}><Square /> Arrêter le suivi</Button> : null}
            {mapUrl ? <Button variant="outline" render={<a href={mapUrl} target="_blank" rel="noreferrer" />}><ExternalLink /> Voir la dernière position</Button> : null}
          </div>
          {canTrack ? <p className="text-xs leading-5 text-muted-foreground">La localisation est envoyée uniquement après votre action et s&apos;arrête lorsque vous cliquez sur Arrêter ou fermez cet onglet.</p> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Derniers jalons</p>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {points.slice(-5).reverse().map((point) => (
              <div key={point.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"><LocateFixed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span><span className="font-medium">{timeFormatter.format(new Date(point.capturedAt))}</span><span className="mt-0.5 block text-muted-foreground">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span></span></div>
            ))}
            {!loading && points.length === 0 ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Le journal du trajet apparaîtra ici.</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
