// Export en lecture seule des premières boîtes (cartons) à récupérer, avec
// leurs dossiers, pour préparer l'étiquetage code-barres (JSON sur stdout).
//
//   node deploy/export-recuperation.mjs --limit=200 > boites.json
//
// Ordre : identifiant CTN croissant (ordre d'inventaire).
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export async function loadBoxes(db, limit) {
  const cartons = await db.carton.findMany({
    where: { dossiers: { some: {} } },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true,
      dossiers: {
        orderBy: { id: "asc" },
        select: {
          reference: true, nom: true, prenoms: true, libelleCarton: true, codeBarres: true,
          numeroLot: true, numeroIlot: true, numeroTitreFoncier: true,
          site: { select: { nom: true } }, entrepot: { select: { nom: true, localisation: true } },
          commune: { select: { nom: true } }, lotissement: { select: { nom: true } },
        },
      },
    },
  });
  return cartons.map((carton) => ({
    id: carton.id,
    dossiers: carton.dossiers.map((d) => ({
      reference: d.reference,
      titulaire: [d.nom, d.prenoms].filter(Boolean).join(" "),
      libelle: d.libelleCarton,
      codeBarresSaisi: d.codeBarres,
      lot: d.numeroLot,
      ilot: d.numeroIlot,
      titreFoncier: d.numeroTitreFoncier,
      commune: d.commune?.nom ?? null,
      lotissement: d.lotissement?.nom ?? null,
      site: d.site?.nom ?? null,
      salle: d.entrepot ? [d.entrepot.nom, d.entrepot.localisation].filter(Boolean).join(" · ") : null,
    })),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 200);
  const prisma = new PrismaClient();
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error("--limit doit être entre 1 et 5000.");
    const boxes = await loadBoxes(prisma, limit);
    process.stdout.write(JSON.stringify({ exportedAt: new Date().toISOString(), boxes }));
    console.error(`Boîtes exportées : ${boxes.length}, dossiers : ${boxes.reduce((s, b) => s + b.dossiers.length, 0)}`);
  } catch (error) {
    console.error(`Export échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
