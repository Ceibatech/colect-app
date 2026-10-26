"use client";

import { useState } from "react";
import { osmTrackLayout, staticTrackMapUrl, type GeoPoint } from "@/lib/transfers/convoy";

/**
 * Carte du trajet suivi : Google Static Maps si la clé est configurée et
 * active, sinon (ou en cas de refus de Google) tuiles OpenStreetMap avec le
 * tracé dessiné par-dessus. Départ en vert, position actuelle en bleu,
 * arrivée en rouge.
 */
export function ConvoyTrackMap({ points, destination, mapsKey }: { points: GeoPoint[]; destination: GeoPoint | null; mapsKey?: string | null }) {
  const [googleFailed, setGoogleFailed] = useState(false);
  const googleUrl = googleFailed ? null : staticTrackMapUrl(mapsKey, points, destination);
  if (googleUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- carte Google Static Maps (URL externe)
    return <img src={googleUrl} onError={() => setGoogleFailed(true)} alt="Carte du trajet suivi : départ en vert, position actuelle en bleu, arrivée en rouge" className="aspect-video w-full rounded-md border object-cover" />;
  }
  const layout = osmTrackLayout(points, destination);
  if (!layout) return null;
  const start = layout.path[0];
  const current = layout.path.at(-1);
  return (
    <figure className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted" aria-label="Carte du trajet suivi : départ en vert, position actuelle en bleu, arrivée en rouge">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" role="img">
        {layout.tiles.map((tile) => <image key={tile.url} href={tile.url} x={tile.x} y={tile.y} width={256} height={256} />)}
        {layout.path.length > 1 ? <polyline points={layout.path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} /> : null}
        {start ? <circle cx={start.x} cy={start.y} r={7} fill="#16a34a" stroke="#fff" strokeWidth={2} /> : null}
        {layout.destination ? <circle cx={layout.destination.x} cy={layout.destination.y} r={8} fill="#dc2626" stroke="#fff" strokeWidth={2} /> : null}
        {current ? <circle cx={current.x} cy={current.y} r={8} fill="#2563eb" stroke="#fff" strokeWidth={3} /> : null}
      </svg>
      <figcaption className="absolute bottom-0 right-0 bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-700">© contributeurs OpenStreetMap</figcaption>
    </figure>
  );
}
