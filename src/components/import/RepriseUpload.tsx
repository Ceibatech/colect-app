"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RepriseUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/import/reprise", { method: "POST", body: new FormData(event.currentTarget) });
      const body = await response.json().catch(() => ({})) as { error?: string; fichiers?: number };
      if (!response.ok) throw new Error(body.error ?? "Dépôt impossible.");
      toast.success(`${body.fichiers} fiche(s) déposée(s).`);
      event.currentTarget?.reset();
      setCount(0);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dépôt impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <input name="fiches" type="file" accept=".xlsx" multiple required onChange={(event) => setCount(event.target.files?.length ?? 0)} className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm" />
      <Button type="submit" disabled={busy || !count}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Déposer {count ? `${count} fiche${count > 1 ? "s" : ""}` : ""}</Button>
    </form>
  );
}
