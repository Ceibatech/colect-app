import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { getDossierDetail } from "@/lib/services/dossier-query-service";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { getActiveTypesPiece } from "@/lib/services/referentiels-service";
import { DossierDetailTabs } from "@/components/dossiers/DossierDetailTabs";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUT_COLLECTE_LABELS,
  STATUT_VALIDATION_LABELS,
  STATUT_PREPARATION_LABELS,
  STATUT_NUMERISATION_LABELS,
  STATUT_INDEXATION_LABELS,
  STATUT_ARCHIVAGE_LABELS,
  statutBadgeVariant,
} from "@/lib/utils/dossier-status";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dossier = await prisma.dossier.findUnique({ where: { id: Number(id) }, select: { reference: true } });
  return { title: dossier ? `${dossier.reference} — Dossiers` : "Dossier — GeoArchives" };
}

export default async function DossierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("DOSSIER_READ");
  const { id: idParam } = await params;
  const query = await searchParams;
  const requestedTabValue = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const allowedTabs = ["informations", "foncier", "titulaire", "collecte", "controle", "preparation", "numerisation", "documents", "indexation", "archivage", "historique"] as const;
  const requestedTab = allowedTabs.find((tab) => tab === requestedTabValue) ?? "informations";
  const fromPreparation = (Array.isArray(query.from) ? query.from[0] : query.from) === "preparation";
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [dossier, typesPiece, indexingFields] = await Promise.all([
    getDossierDetail(id),
    getActiveTypesPiece(),
    prisma.indexingField.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, key: true, label: true, dataType: true, isRequired: true, isSearchable: true },
    }),
  ]);
  if (!dossier) notFound();

  const sharedPreparationAccess =
    requestedTab === "preparation" &&
    session.permissions.includes("PREPARATION_VIEW") &&
    dossier.statutValidation === "VALIDE";

  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    if ((!operateur || dossier.operateurId !== operateur.id) && !sharedPreparationAccess) notFound();
  } else if (session.roleCode === "SUPERVISEUR") {
    // Phase 16+ : un superviseur ne voit que les dossiers des opérateurs
    // qui lui sont affectés (cf. access-scope.ts).
    if (!(await isOperateurInScope(session, dossier.operateurId)) && !sharedPreparationAccess) notFound();
  }

  // Sérialisation : les champs Decimal/Date de Prisma ne traversent pas
  // directement la frontière Server -> Client Component.
  const serialized = {
    ...dossier,
    superficie: dossier.superficie ? Number(dossier.superficie) : null,
    createdAt: dossier.createdAt.toISOString(),
    updatedAt: dossier.updatedAt.toISOString(),
    dateSoumission: dossier.dateSoumission?.toISOString() ?? null,
    dateValidation: dossier.dateValidation?.toISOString() ?? null,
    datePreparation: dossier.datePreparation?.toISOString() ?? null,
    preparationClaimedAt: dossier.preparationClaimedAt?.toISOString() ?? null,
    dateSoumissionPreparation: dossier.dateSoumissionPreparation?.toISOString() ?? null,
    dateNumerisation: dossier.dateNumerisation?.toISOString() ?? null,
    dateIndexation: dossier.dateIndexation?.toISOString() ?? null,
    dateArchivage: dossier.dateArchivage?.toISOString() ?? null,
    history: dossier.history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    numerisations: dossier.numerisations.map((n) => ({
      ...n,
      dateDebut: n.dateDebut?.toISOString() ?? null,
      dateFin: n.dateFin?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    indexations: dossier.indexations.map((n) => ({
      ...n,
      dateDebut: n.dateDebut?.toISOString() ?? null,
      dateFin: n.dateFin?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    archivages: dossier.archivages.map((a) => ({
      ...a,
      dateArchivage: a.dateArchivage?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    documents: dossier.documents.map((doc) => {
      const safeDocument = Object.fromEntries(
        Object.entries(doc).filter(([key]) => key !== "extractedText" && key !== "searchText" && key !== "derivatives"),
      ) as Omit<typeof doc, "extractedText" | "searchText" | "derivatives">;
      return {
        ...safeDocument,
        indexingConfidence: doc.indexingConfidence ? Number(doc.indexingConfidence) : null,
        indexValues: doc.indexValues.map((value) => ({
          ...value,
          confidence: value.confidence ? Number(value.confidence) : null,
          createdAt: value.createdAt.toISOString(),
          updatedAt: value.updatedAt.toISOString(),
        })),
        derivatives: doc.derivatives.map((derivative) => ({
          ...derivative,
          createdAt: derivative.createdAt.toISOString(),
        })),
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        dateDocument: doc.dateDocument?.toISOString() ?? null,
        preIndexedAt: doc.preIndexedAt?.toISOString() ?? null,
        indexedAt: doc.indexedAt?.toISOString() ?? null,
        alfrescoArchivedAt: doc.alfrescoArchivedAt?.toISOString() ?? null,
        lastArchiveAttemptAt: doc.lastArchiveAttemptAt?.toISOString() ?? null,
      };
    }),
    qualityChecks: dossier.qualityChecks.map((qc) => ({
      ...qc,
      createdAt: qc.createdAt.toISOString(),
      anomalies: qc.anomalies.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    })),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={fromPreparation ? "/preparation" : "/dossiers"} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-1 -ml-2")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {fromPreparation ? "Retour à la préparation" : "Retour à la liste"}
          </Link>
          <h1 className="font-mono text-xl font-semibold">{dossier.reference}</h1>
          <p className="text-sm text-muted-foreground">
            {[dossier.nom, dossier.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statutBadgeVariant(dossier.statutCollecte)}>{STATUT_COLLECTE_LABELS[dossier.statutCollecte]}</Badge>
          <Badge variant={statutBadgeVariant(dossier.statutValidation)}>{STATUT_VALIDATION_LABELS[dossier.statutValidation]}</Badge>
          <Badge variant={statutBadgeVariant(dossier.statutPreparation)}>{STATUT_PREPARATION_LABELS[dossier.statutPreparation]}</Badge>
          <Badge variant={statutBadgeVariant(dossier.statutNumerisation)}>
            {STATUT_NUMERISATION_LABELS[dossier.statutNumerisation]}
          </Badge>
          <Badge variant={statutBadgeVariant(dossier.statutIndexation)}>{STATUT_INDEXATION_LABELS[dossier.statutIndexation]}</Badge>
          <Badge variant={statutBadgeVariant(dossier.statutArchivage)}>{STATUT_ARCHIVAGE_LABELS[dossier.statutArchivage]}</Badge>
          {dossier.statutCollecte === "BROUILLON" && (
            <Link href={`/collecte?draft=${dossier.id}`} className={buttonVariants({ size: "sm" })}>
              <Pencil className="mr-1 h-4 w-4" />
              Modifier
            </Link>
          )}
        </div>
      </div>

      <DossierDetailTabs
        dossier={serialized}
        currentUserId={session.userId}
        permissions={session.permissions}
        typesPiece={typesPiece}
        indexingFields={indexingFields}
        documentStorageProvider={(process.env.STORAGE_PROVIDER ?? "local").toLowerCase() === "sharepoint" ? "SHAREPOINT" : "LOCAL"}
        digitalArchiveEnabled={(process.env.ARCHIVE_STORAGE_PROVIDER ?? "").toLowerCase() === "alfresco"}
        initialTab={requestedTab}
      />
    </div>
  );
}
