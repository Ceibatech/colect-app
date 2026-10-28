"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = { numero: string; capacite: number; siteId: number | ""; description: string; isActive: boolean };

/** Créer ou renuméroter une caisse. Le contenu d'une caisse renumérotée ne change pas. */
export function CaisseForm({ sites, caisse }: { sites: { id: number; nom: string }[]; caisse?: { id: number; numero: string; capacite: number; siteId: number; description: string | null; isActive: boolean } }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    numero: caisse?.numero ?? "",
    capacite: caisse?.capacite ?? 40,
    siteId: caisse?.siteId ?? (sites.length === 1 ? sites[0].id : ""),
    description: caisse?.description ?? "",
    isActive: caisse?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(caisse ? `/api/caisses/${caisse.id}` : "/api/caisses", {
        method: caisse ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, description: values.description || null }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; numero?: string };
      if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      toast.success(caisse ? `Caisse ${body.numero} enregistrée.` : `Caisse ${body.numero} créée.`);
      if (!caisse) setValues((current) => ({ ...current, numero: "", description: "" }));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const id = (name: string) => `${caisse?.id ?? "new"}-${name}`;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
      <div className="space-y-1.5">
        <Label htmlFor={id("numero")}>Numéro de la caisse</Label>
        <Input id={id("numero")} value={values.numero} onChange={(event) => set("numero", event.target.value)} placeholder="Tel qu'écrit sur la caisse" required maxLength={40} className="font-mono uppercase" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("capacite")}>Capacité</Label>
        <Input id={id("capacite")} type="number" min={1} max={500} value={values.capacite} onChange={(event) => set("capacite", Number(event.target.value))} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("site")}>Site CEIBA</Label>
        <select id={id("site")} value={values.siteId} onChange={(event) => set("siteId", event.target.value ? Number(event.target.value) : "")} required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Choisir le site</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.nom}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor={id("description")}>Description (facultatif)</Label>
        <Input id={id("description")} value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="Ex. caisse grise 160 gallons, rangée près de la salle 1" maxLength={255} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
        {caisse ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={values.isActive} onChange={(event) => set("isActive", event.target.checked)} />
            Caisse en service
          </label>
        ) : <span />}
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{caisse ? "Enregistrer" : "Créer la caisse"}</Button>
      </div>
    </form>
  );
}
