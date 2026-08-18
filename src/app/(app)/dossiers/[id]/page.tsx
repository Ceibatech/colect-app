import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { getDossierDetail } from "@/lib/services/dossier-query-service";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { DossierDetailTabs } from "@/components/dossiers/DossierDetailTabs";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUT_COLLECTE_LABELS,
  STATUT_VALIDATION_LABELS,
  STATUT_NUMERISATION_LABELS,
  STATUT_INDEXATION_LABELS,
  STATUT_ARCHIVAGE_LABELS,
  statutBadgeVariant,
} from "@/lib/utils/dossier-status";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dossier = await prisma.dossier.findUnique({ where: { id: Number(id) }, select: { reference: true } });
  return { title: dossier ? `${dossier.reference} — Dossiers` : "Dossier — GeoArchives-MULCV" };
}

export default async function DossierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("DOSSIER_READ");
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const dossier = await getDossierDetail(id);
  if (!dossier) notFound();

  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    if (!operateur || dossier.operateurId !== operateur.id) notFound();
  } else if (session.roleCode === "SUPERVISEUR") {
    // Phase 16+ : un superviseur ne voit que les dossiers des opérateurs
    // qui lui sont affectés (cf. access-scope.ts).
    if (!(await isOperateurInScope(session, dossier.operateurId))) notFound();
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
    documents: dossier.documents.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() })),
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
          <Link href="/dossiers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-1 -ml-2")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Retour à la liste
          </Link>
          <h1 className="font-mono text-xl font-semibold">{dossier.reference}</h1>
          <p className="text-sm text-muted-foreground">
            {[dossier.nom, dossier.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statutBadgeVariant(dossier.statutCollecte)}>{STATUT_COLLECTE_LABELS[dossier.statutCollecte]}</Badge>
          <Badge variant={statutBadgeVariant(dossier.statutValidation)}>{STATUT_VALIDATION_LABELS[dossier.statutValidation]}</Badge>
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

      <DossierDetailTabs dossier={serialized} permissions={session.permissions} />
    </div>
  );
}
