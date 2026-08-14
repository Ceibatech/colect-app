import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { parseDossierSearchParams } from "@/lib/validation/dossier-search";
import { searchDossiers, DOSSIERS_PAGE_SIZE } from "@/lib/services/dossier-query-service";
import { getCommunesWithLotissements, getNaturesDossier, getActiveOperateurs } from "@/lib/services/referentiels-service";
import { DossiersFilterBar } from "@/components/dossiers/DossiersFilterBar";
import { DossiersTable } from "@/components/dossiers/DossiersTable";
import { DataPagination } from "@/components/shared/DataPagination";

export const metadata = { title: "Dossiers — GeoArchives-MULCV" };

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("DOSSIER_READ");
  const rawParams = await searchParams;
  const params = parseDossierSearchParams(rawParams);

  const isOperateurRole = session.roleCode === "OPERATEUR";
  let operateurScope: number | undefined;
  if (isOperateurRole) {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    operateurScope = operateur?.id ?? -1; // -1 => aucun résultat si pas de fiche opérateur
  }

  const [communes, natures, operateurs, results] = await Promise.all([
    getCommunesWithLotissements(),
    getNaturesDossier(),
    isOperateurRole ? Promise.resolve([]) : getActiveOperateurs(),
    searchDossiers(
      {
        q: params.q,
        communeId: params.commune,
        lotissementId: params.lotissement,
        natureDossierId: params.nature,
        operateurId: isOperateurRole ? operateurScope : params.operateur,
        statutCollecte: params.statutCollecte,
        statutValidation: params.statutValidation,
        statutNumerisation: params.statutNumerisation,
        statutIndexation: params.statutIndexation,
        statutArchivage: params.statutArchivage,
        dateFrom: params.from,
        dateTo: params.to,
      },
      { page: params.page, pageSize: DOSSIERS_PAGE_SIZE, sort: params.sort, dir: params.dir }
    ),
  ]);

  const flatSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string" && value) flatSearchParams[key] = value;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Dossiers</h1>
        <p className="text-sm text-muted-foreground">
          {results.total} dossier{results.total > 1 ? "s" : ""} — page {results.page} / {results.totalPages}
        </p>
      </div>

      <DossiersFilterBar
        current={params}
        communes={communes.map((c) => ({ value: String(c.id), label: c.nom }))}
        natures={natures.map((n) => ({ value: String(n.id), label: n.libelle }))}
        operateurs={operateurs.map((o) => ({ value: String(o.id), label: `${o.nom} ${o.prenoms ?? ""}` }))}
        showOperateurFilter={!isOperateurRole}
      />

      <DossiersTable items={results.items} />

      <DataPagination basePath="/dossiers" page={results.page} totalPages={results.totalPages} searchParams={flatSearchParams} />
    </div>
  );
}
