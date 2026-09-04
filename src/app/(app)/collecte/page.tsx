import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { getCommunesWithLotissements, getNaturesDossier, getActiveOperateurs, getActiveSites, getActiveTypesPiece } from "@/lib/services/referentiels-service";
import { listMyDrafts, getDraftById } from "@/lib/services/dossier-service";
import { CollecteWizard } from "@/components/collecte/CollecteWizard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock3, FilePlus2, FileEdit } from "lucide-react";
import type { DossierFormValues } from "@/lib/validation/dossier";

export const metadata = { title: "Collecte — GeoArchives-MULCV" };

export default async function CollectePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await requirePermission("DOSSIER_CREATE");
  const { draft } = await searchParams;
  const draftId = draft ? Number(draft) : undefined;

  const [sites, communes, natures, typesPiece, operateurs] = await Promise.all([
    getActiveSites(),
    getCommunesWithLotissements(),
    getNaturesDossier(),
    getActiveTypesPiece(),
    session.roleCode === "OPERATEUR" ? Promise.resolve([]) : getActiveOperateurs(),
  ]);

  const isOperateurRole = session.roleCode === "OPERATEUR";

  // Reprise explicite d'un brouillon via ?draft=ID
  if (draftId) {
    const dossier = await getDraftById(draftId);
    if (dossier) {
      const initialValues: Partial<DossierFormValues> = {
        siteId: dossier.siteId ?? undefined,
        entrepotId: dossier.entrepotId ?? undefined,
        operateurId: dossier.operateurId,
        libelleCarton: dossier.libelleCarton ?? undefined,
        codeBarres: dossier.codeBarres ?? undefined,
        numeroGuichet: dossier.numeroGuichet ?? undefined,
        numeroDdu: dossier.numeroDdu ?? undefined,
        numeroDirectionService: dossier.numeroDirectionService ?? undefined,
        referenceClassement: dossier.referenceClassement ?? undefined,
        numeroIlot: dossier.numeroIlot ?? undefined,
        numeroLot: dossier.numeroLot ?? undefined,
        superficie: dossier.superficie ? Number(dossier.superficie) : undefined,
        numeroTitreFoncier: dossier.numeroTitreFoncier ?? undefined,
        communeId: dossier.communeId ?? undefined,
        lotissementNom: dossier.lotissement?.nom ?? undefined,
        natureDossierId: dossier.natureDossierId ?? undefined,
        nombrePieces: dossier.nombrePieces ?? undefined,
        typesPieces: dossier.typesPieces.map((t) => String(t.id)),
        autresPieces: dossier.autresPieces ?? undefined,
        nom: dossier.nom ?? undefined,
        prenoms: dossier.prenoms ?? undefined,
        adresse: dossier.adresse ?? undefined,
        telephone: dossier.telephone ?? undefined,
        email: dossier.email ?? undefined,
        personneContact: dossier.personneContact ?? undefined,
        mobile: dossier.mobile ?? undefined,
        nombrePages: dossier.nombrePages ?? undefined,
        observations: dossier.observations ?? undefined,
      };
      return (
        <CollecteWizard
          initialValues={initialValues}
          initialDraftId={dossier.id}
          sites={sites}
          communes={communes}
          natures={natures}
          typesPiece={typesPiece}
          operateurs={operateurs}
          isOperateurRole={isOperateurRole}
          currentUserName={session.name}
        />
      );
    }
    // Brouillon introuvable/inaccessible : on retombe sur le flux normal ci-dessous.
  }

  const drafts = await listMyDrafts();

  if (drafts.length > 0) {
    return (
      <div className="space-y-5">
        <section className="flex flex-col gap-4 rounded-lg border border-border/70 bg-card/95 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-md border border-border/60 bg-muted/70 uppercase tracking-[0.16em]">
              Collecte
            </Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Reprendre un brouillon</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Vous avez {drafts.length} brouillon{drafts.length > 1 ? "s" : ""} en attente de soumission.
              </p>
            </div>
          </div>
          <Link href="/collecte/nouveau" className={cn(buttonVariants(), "h-9 shadow-sm")}>
            <FilePlus2 className="mr-1 h-4 w-4" />
            Nouveau dossier
          </Link>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Brouillons disponibles</CardTitle>
            <CardDescription>Sélectionnez une fiche pour reprendre la saisie là où elle s&apos;est arrêtée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((d) => (
              <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="font-mono text-xs font-semibold text-primary">{d.reference}</div>
                  <div className="mt-1 font-medium">{[d.nom, d.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    Modifié le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(d.updatedAt)}
                  </div>
                </div>
                <Link href={`/collecte?draft=${d.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  <FileEdit className="mr-1 h-4 w-4" />
                  Reprendre
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <CollecteWizard
      sites={sites}
      communes={communes}
      natures={natures}
      typesPiece={typesPiece}
      operateurs={operateurs}
      isOperateurRole={isOperateurRole}
      currentUserName={session.name}
    />
  );
}