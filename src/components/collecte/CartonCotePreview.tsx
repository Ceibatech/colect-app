"use client";

import { useEffect, useState } from "react";
import { Archive, PackagePlus, TriangleAlert } from "lucide-react";

type Preview =
  | { mode: "existant"; cote: string | null; libelle: string | null; site: string | null; commune: string | null; dossiers: number; prochaineCote: string | null; rang: number }
  | { mode: "nouveau"; cote: string; commune: string | null; dossiers: 0; prochaineCote: string; rang: 1 }
  | { mode: "inconnu"; cote: string };

/**
 * Montre, pendant l'inventaire, dans quel carton ira le dossier et quelle cote
 * il recevra : carton de n dossiers → ce dossier sera le n° n+1.
 */
export function CartonCotePreview({
  cote,
  libelle,
  siteId,
  communeId,
  draftId,
}: {
  cote?: string;
  libelle?: string;
  siteId?: number;
  communeId?: number;
  draftId?: number;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const query = new URLSearchParams();
  if (cote?.trim()) query.set("cote", cote.trim());
  else if (libelle?.trim()) query.set("libelle", libelle.trim());
  if (siteId) query.set("site", String(siteId));
  if (communeId) query.set("commune", String(communeId));
  if (draftId) query.set("dossier", String(draftId));
  const search = query.toString();
  const hasIdentity = Boolean(cote?.trim() || libelle?.trim());

  useEffect(() => {
    if (!hasIdentity) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/cartons/apercu-cote?${search}`, { signal: abort.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: Preview | null) => setPreview(data))
        .catch(() => undefined);
    }, 300);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [search, hasIdentity]);

  if (!hasIdentity || !preview) return null;
  if (preview.mode === "inconnu") {
    return (
      <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Aucun carton ne porte la cote {preview.cote}. Vérifiez-la, ou videz le champ pour créer un nouveau carton.
      </p>
    );
  }
  if (preview.mode === "nouveau") {
    return (
      <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <PackagePlus className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Nouveau carton : il recevra la cote <span className="font-mono font-semibold">{preview.cote}</span>
          {preview.commune ? null : " (la commune, à l'étape suivante, fixe les lettres)"}. Ce dossier sera le n° 1 :{" "}
          <span className="font-mono font-semibold">{preview.prochaineCote}</span>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <Archive className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>
        Carton <span className="font-mono font-semibold">{preview.cote ?? "en cours de cotation"}</span>
        {preview.libelle ? ` · ${preview.libelle}` : ""}
        {preview.site ? ` · ${preview.site}` : ""} : {preview.dossiers} dossier{preview.dossiers > 1 ? "s" : ""} déjà rangé{preview.dossiers > 1 ? "s" : ""}.
        {preview.prochaineCote ? <> Ce dossier sera le n° {preview.rang} : <span className="font-mono font-semibold">{preview.prochaineCote}</span>.</> : null}
      </p>
    </div>
  );
}
