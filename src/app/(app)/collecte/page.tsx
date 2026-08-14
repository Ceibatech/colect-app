import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { getCommunesWithLotissements, getNaturesDossier, getActiveOperateurs } from "@/lib/services/referentiels-service";
import { listMyDrafts, getDraftById } from "@/lib/services/dossier-service";
import { CollecteWizard } from "@/components/collecte/CollecteWizard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FilePlus2, FileEdit } from "lucide-react";
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

  const [communes, natures, operateurs] = await Promise.all([
    getCommunesWithLotissements(),
    getNaturesDossier(),
    session.roleCode === "OPERATEUR" ? Promise.resolve([]) : getActiveOperateurs(),
  ]);

  const isOperateurRole = session.roleCode === "OPERATEUR";

  // Reprise explicite d'un brouillon via ?draft=ID
  if (draftId) {
    const dossier = await getDraftById(draftId);
    if (dossier) {
      const initialValues: Partial<DossierFormValues> = {
        operateurId: dossier.operateurId,
        libelleCarton: dossier.libelleCarton ?? undefined,
        codeBarres: dossier.codeBarres ?? undefined,
        numeroGuichet: dossier.numeroGuichet ?? undefined,
        numeroDdu: dossier.numeroDdu ?? undefined,
        referenceClassement: dossier.referenceClassement ?? undefined,
        numeroIlot: dossier.numeroIlot ?? undefined,
        numeroLot: dossier.numeroLot ?? undefined,
        superficie: dossier.superficie ? Number(dossier.superficie) : undefined,
        numeroTitreFoncier: dossier.numeroTitreFoncier ?? undefined,
        communeId: dossier.communeId ?? undefined,
        lotissementId: dossier.lotissementId ?? undefined,
        natureDossierId: dossier.natureDossierId ?? undefined,
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
          communes={communes}
          natures={natures}
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
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Reprendre un brouillon</CardTitle>
            <CardDescription>
              Vous avez {drafts.length} brouillon{drafts.length > 1 ? "s" : ""} en attente de soumission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="text-sm">
                  <div className="font-medium">{d.reference}</div>
                  <div className="text-muted-foreground">
                    {[d.nom, d.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"} — modifié le{" "}
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(d.updatedAt)}
                  </div>
                </div>
                <Link href={`/collecte?draft=${d.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  <FileEdit className="mr-1 h-4 w-4" />
                  Reprendre
                </Link>
              </div>
            ))}
            <Link href="/collecte/nouveau" className={cn(buttonVariants(), "mt-2")}>
              <FilePlus2 className="mr-1 h-4 w-4" />
              Nouveau dossier
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <CollecteWizard
      communes={communes}
      natures={natures}
      operateurs={operateurs}
      isOperateurRole={isOperateurRole}
      currentUserName={session.name}
    />
  );
}
