import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import {
  cartonHref,
  cartonIdFromQuery,
  dossierHref,
  formatCartonRef,
  matchScore,
  queryWords,
  type CartonSuggestion,
  type DossierSuggestion,
  type SuggestStage,
} from "@/lib/search/suggestions";
import { parseCote } from "@/lib/cartons/cote";

const LIMIT = 6;

/** Dossiers visibles dans la file de l'étape (même prérequis que la page). */
const STAGE_SCOPE: Record<SuggestStage, Prisma.DossierWhereInput> = {
  preparation: { statutValidation: "VALIDE" },
  numerisation: { statutPreparation: "TERMINE" },
  conditionnement: { statutNumerisation: "TERMINE" },
  indexation: { statutConditionnement: "TERMINE" },
  archivage: { statutIndexation: "TERMINE" },
};

const wordInCarton = (word: string): Prisma.DossierWhereInput => ({ OR: [{ libelleCarton: { contains: word } }, { codeBarres: { contains: word } }, { carton: { cote: { contains: word } } }] });
const wordInDossier = (word: string): Prisma.DossierWhereInput => ({
  OR: [{ reference: { contains: word } }, { cote: { contains: word } }, { nom: { contains: word } }, { prenoms: { contains: word } }, { codeBarres: { contains: word } }],
});

async function cartonSuggestions(stage: SuggestStage, query: string, words: string[], all: boolean): Promise<CartonSuggestion[]> {
  const exactId = cartonIdFromQuery(query);
  const cote = parseCote(query);
  const match: Prisma.DossierWhereInput = exactId
    ? { cartonId: exactId }
    : cote ? { carton: { cote: cote.carton } }
    : all ? { AND: words.map(wordInCarton) } : { OR: words.map(wordInCarton) };
  const rows = await prisma.dossier.groupBy({
    by: ["cartonId", "libelleCarton"],
    where: { AND: [STAGE_SCOPE[stage], { cartonId: { not: null } }, match] },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: 60,
  });
  const cartons = new Map<number, { label: string | null; dossiers: number }>();
  for (const row of rows) {
    if (!row.cartonId) continue;
    const current = cartons.get(row.cartonId);
    if (current) current.dossiers += row._count._all;
    else cartons.set(row.cartonId, { label: row.libelleCarton, dossiers: row._count._all });
  }
  const ranked = [...cartons.entries()]
    .map(([cartonId, carton]) => ({ cartonId, ...carton, score: matchScore(carton.label ?? "", words) }))
    .sort((a, b) => b.score - a.score || b.dossiers - a.dossiers)
    .slice(0, LIMIT);
  const cotes = new Map((await prisma.carton.findMany({ where: { id: { in: ranked.map((c) => c.cartonId) } }, select: { id: true, cote: true } })).map((c) => [c.id, c.cote]));
  return ranked.map(({ cartonId, label, dossiers }) => ({
    kind: "carton", cartonId, reference: cotes.get(cartonId) ?? formatCartonRef(cartonId), label, dossiers, href: cartonHref(stage, cartonId),
  }));
}

async function dossierSuggestions(stage: SuggestStage, words: string[], all: boolean): Promise<DossierSuggestion[]> {
  const rows = await prisma.dossier.findMany({
    where: { AND: [STAGE_SCOPE[stage], all ? { AND: words.map(wordInDossier) } : { OR: words.map(wordInDossier) }] },
    select: { id: true, reference: true, cote: true, nom: true, prenoms: true, cartonId: true, libelleCarton: true },
    orderBy: { reference: "asc" },
    take: all ? LIMIT : 40,
  });
  return rows
    .map((row) => ({ row, score: matchScore(`${row.reference} ${row.nom ?? ""} ${row.prenoms ?? ""}`, words) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map(({ row }) => ({
      kind: "dossier",
      id: row.id,
      reference: row.cote ?? row.reference,
      titulaire: [row.nom, row.prenoms].filter(Boolean).join(" ") || null,
      carton: row.cote ? row.libelleCarton : row.cartonId ? `${formatCartonRef(row.cartonId)}${row.libelleCarton ? ` · ${row.libelleCarton}` : ""}` : row.libelleCarton,
      href: dossierHref(stage, row),
    }));
}

/**
 * Propositions pendant la saisie : cartons (référence CTN ou mots du libellé)
 * et dossiers (référence, nom, prénoms, code-barres). Tous les mots doivent
 * figurer ; sans résultat, on propose ce qui contient au moins un mot, les
 * plus proches en premier.
 */
export async function suggestForStage(stage: SuggestStage, query: string) {
  const words = queryWords(query);
  const exactCarton = cartonIdFromQuery(query);
  if (!words.length && !exactCarton) return { cartons: [], dossiers: [], approx: false };
  const [cartons, dossiers] = await Promise.all([
    cartonSuggestions(stage, query, words, true),
    exactCarton ? Promise.resolve([]) : dossierSuggestions(stage, words, true),
  ]);
  if (cartons.length || dossiers.length || words.length < 2) return { cartons, dossiers, approx: false };
  const [looseCartons, looseDossiers] = await Promise.all([
    cartonSuggestions(stage, query, words, false),
    dossierSuggestions(stage, words, false),
  ]);
  return { cartons: looseCartons, dossiers: looseDossiers, approx: true };
}
