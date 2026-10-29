// Export en lecture seule des cartons d'une plage de cotes et de leurs dossiers,
// pour produire la liste et les étiquettes QR (JSON sur stdout).
//
//   node deploy/export-cotes.mjs --prefixe=2010-KOU --de=1 --a=320 > cartons.json
//
// Ordre : cote du carton, puis n° du dossier dans le carton.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

/** Liste d'enlèvement (référence provisoire et libellé de chaque boîte), si elle existe pour ce préfixe. */
function listeEnlevement(prefixe) {
  if (prefixe !== "2010-KOU") return { boites: new Map(), etabliePar: null };
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), "enlevement-koumassi.json");
  if (!existsSync(file)) return { boites: new Map(), etabliePar: null };
  const data = JSON.parse(readFileSync(file, "utf8"));
  return { boites: new Map(data.boites.map((boite) => [boite.ref, boite])), etabliePar: data.etabliePar ?? null };
}

export async function loadCotes(db, { prefixe, de, a }) {
  const { boites: liste } = listeEnlevement(prefixe);
  const cartons = await db.carton.findMany({
    where: { cotePrefixe: prefixe, coteSequence: { gte: de, lte: a } },
    orderBy: { coteSequence: "asc" },
    select: {
      cote: true,
      coteSequence: true,
      dossiers: {
        orderBy: [{ rangCarton: "asc" }, { id: "asc" }],
        select: {
          cote: true, rangCarton: true, reference: true, nom: true, prenoms: true, libelleCarton: true,
          referenceClassement: true, numeroLot: true, numeroIlot: true, numeroTitreFoncier: true,
          site: { select: { nom: true } }, entrepot: { select: { nom: true, localisation: true } },
          commune: { select: { nom: true } }, lotissement: { select: { nom: true } },
        },
      },
    },
  });
  return cartons.map((carton) => {
    const boite = liste.get(carton.coteSequence);
    return {
      cote: carton.cote,
      sequence: carton.coteSequence,
      listeRef: boite ? boite.ref : null,
      listeLibelle: boite ? boite.libelle : null,
      dossiers: carton.dossiers.map((d) => ({
        cote: d.cote,
        rang: d.rangCarton,
        reference: d.reference,
        titulaire: [d.nom, d.prenoms].filter(Boolean).join(" "),
        referenceClassement: d.referenceClassement,
        libelle: d.libelleCarton,
        lot: d.numeroLot,
        ilot: d.numeroIlot,
        titreFoncier: d.numeroTitreFoncier,
        commune: d.commune?.nom ?? null,
        lotissement: d.lotissement?.nom ?? null,
        site: d.site?.nom ?? null,
        salle: d.entrepot ? [d.entrepot.nom, d.entrepot.localisation].filter(Boolean).join(" · ") : null,
      })),
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
  const prefixe = arg("prefixe", "2010-KOU");
  const de = Number(arg("de", 1));
  const a = Number(arg("a", 320));
  const prisma = new PrismaClient();
  try {
    if (!/^\d{4}-[A-Z][A-Z0-9]{1,5}$/.test(prefixe)) throw new Error("--prefixe invalide (ex. 2010-KOU).");
    if (!Number.isInteger(de) || !Number.isInteger(a) || de < 1 || a < de || a - de > 2000) throw new Error("Plage --de/--a invalide.");
    const cartons = await loadCotes(prisma, { prefixe, de, a });
    process.stdout.write(JSON.stringify({ exportedAt: new Date().toISOString(), prefixe, de, a, listeEtabliePar: listeEnlevement(prefixe).etabliePar, cartons }));
    console.error(`Cartons exportés : ${cartons.length}, dossiers : ${cartons.reduce((s, c) => s + c.dossiers.length, 0)}`);
  } catch (error) {
    console.error(`Export échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
