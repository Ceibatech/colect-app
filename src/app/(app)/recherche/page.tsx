import Link from "next/link";
import { FileSearch, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchIndexedDocuments } from "@/lib/services/document-search-service";
import { prisma } from "@/lib/prisma/client";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/auth/current-user";

export const metadata = { title: "Recherche documentaire - GeoArchives" };

export default async function DocumentSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requirePermission("DOSSIER_READ");
  const query = String(Array.isArray(params.q) ? params.q[0] ?? "" : params.q ?? "").trim();
  const fieldKey = String(Array.isArray(params.field) ? params.field[0] ?? "" : params.field ?? "").trim();
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1;
  const [results, fields] = await Promise.all([
    searchIndexedDocuments({ query, fieldKey, page }),
    prisma.indexingField.findMany({ where: { isActive: true, isSearchable: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { key: true, label: true } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Archives numériques"
        icon={FileSearch}
        title="Recherche documentaire"
        description="Retrouvez un scan par son contenu OCR, sa référence, son titulaire ou les métadonnées validées."
        stats={[{ label: "Résultats", value: results.total }]}
      />

      <form className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_18rem_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="document-search">Mots-clés</Label>
          <Input id="document-search" name="q" defaultValue={query} placeholder="Référence, nom, commune, contenu du document…" autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="document-field">Limiter à un champ</Label>
          <select id="document-field" name="field" defaultValue={fieldKey} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
            <option value="">Tous les champs</option>
            {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </select>
        </div>
        <Button type="submit"><Search />Rechercher</Button>
      </form>

      {results.items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Aucun document trouvé</h2>
          <p className="mt-2 text-sm text-muted-foreground">Seuls les documents contrôlés et déclarés prêts apparaissent dans les résultats.</p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {results.items.map((document) => (
            <article key={document.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dossiers/${document.dossierId}?tab=documents`} className="font-semibold text-primary hover:underline">{document.titreIndexation ?? document.nomOriginal}</Link>
                  {document.typePiece ? <Badge variant="outline">{document.typePiece.libelle}</Badge> : null}
                  {document.indexingConfidence !== null ? <Badge variant="secondary">{Math.round(document.indexingConfidence)} %</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {document.dossier.reference} · {[document.dossier.nom, document.dossier.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}
                  {document.dossier.commune ? ` · ${document.dossier.commune.nom}` : ""}
                </p>
                {document.snippet ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{document.snippet}</p> : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {document.indexValues.slice(0, 6).map((value) => <Badge key={value.field.key} variant="outline" className="font-normal">{value.field.label} : {value.value}</Badge>)}
                </div>
                {document.classificationPath ? <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">{document.classificationPath}</p> : null}
              </div>
              <div className="flex gap-2">
                <a href={`/api/documents/${document.id}/download`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>Télécharger</a>
                <Link href={`/dossiers/${document.dossierId}?tab=documents`} className={cn(buttonVariants({ size: "sm" }))}>Ouvrir le dossier</Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {results.totalPages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {results.page} sur {results.totalPages}</span>
          <div className="flex gap-2">
            {results.page > 1 ? <Link href={searchHref(query, fieldKey, results.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Précédent</Link> : null}
            {results.page < results.totalPages ? <Link href={searchHref(query, fieldKey, results.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Suivant</Link> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function searchHref(query: string, fieldKey: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (fieldKey) params.set("field", fieldKey);
  params.set("page", String(page));
  return `/recherche?${params.toString()}`;
}
