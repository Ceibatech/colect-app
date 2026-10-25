/**
 * npm run cartons:duplicates [-- --max-distance=2] [--csv]
 *
 * Rapport en lecture seule des cartons probablement identiques au même site et
 * à la même salle, que la normalisation automatique ne fusionne pas :
 *   - fautes de frappe (« Anna Cocoteraie 1 » / « Anan Cocoteraie 1 ») ;
 *   - libellés dont l'un prolonge l'autre (« Anan Cocoteraie » / « … 1 ») ;
 *   - cartons au texte identique restés séparés (historique de transferts,
 *     transfert ouvert au moment de la fusion).
 *
 * Aucun enregistrement n'est modifié : chaque paire doit être vérifiée sur le
 * terrain avant correction.
 */
import { PrismaClient } from "@prisma/client";
import { formatCartonReference } from "../src/lib/cartons/reference";
import { boundedEditDistance, normalizeCartonIdentity, tidyCartonText } from "../src/lib/cartons/identity-normalization";

const prisma = new PrismaClient();
const maxDistance = Number(process.argv.find((arg) => arg.startsWith("--max-distance="))?.split("=")[1] ?? 2);
const asCsv = process.argv.includes("--csv");

type CartonRow = {
  cartonId: number;
  siteId: number | null;
  entrepotId: number | null;
  kind: "code" | "label";
  key: string;
  texts: Set<string>;
  dossiers: number;
};

async function main() {
  const dossiers = await prisma.dossier.findMany({
    where: { cartonId: { not: null } },
    select: { cartonId: true, siteId: true, entrepotId: true, codeBarres: true, libelleCarton: true },
  });
  const [sites, entrepots] = await Promise.all([
    prisma.site.findMany({ select: { id: true, nom: true } }),
    prisma.entrepot.findMany({ select: { id: true, nom: true } }),
  ]);
  const siteName = new Map(sites.map((s) => [s.id, s.nom]));
  const entrepotName = new Map(entrepots.map((e) => [e.id, e.nom]));

  const cartons = new Map<number, CartonRow>();
  for (const d of dossiers) {
    const identity = normalizeCartonIdentity(d);
    if (!identity || d.cartonId == null) continue;
    const row = cartons.get(d.cartonId) ?? {
      cartonId: d.cartonId, siteId: d.siteId, entrepotId: d.entrepotId,
      kind: identity.kind, key: identity.value, texts: new Set<string>(), dossiers: 0,
    };
    const text = tidyCartonText(identity.kind === "code" ? d.codeBarres : d.libelleCarton);
    if (text) row.texts.add(text);
    row.dossiers++;
    cartons.set(d.cartonId, row);
  }

  const byLocation = new Map<string, CartonRow[]>();
  for (const carton of cartons.values()) {
    const location = `${carton.siteId ?? "-"}:${carton.entrepotId ?? "-"}:${carton.kind}`;
    byLocation.set(location, [...(byLocation.get(location) ?? []), carton]);
  }

  const pairs: Array<{ a: CartonRow; b: CartonRow; reason: string }> = [];
  for (const group of byLocation.values()) {
    group.sort((x, y) => x.cartonId - y.cartonId);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        if (a.key === b.key) { pairs.push({ a, b, reason: "même identification non fusionnée (transfert ouvert ou cartons historiquement distincts)" }); continue; }
        const distance = boundedEditDistance(a.key, b.key, maxDistance);
        if (distance <= maxDistance) { pairs.push({ a, b, reason: `faute de frappe probable (distance ${distance})` }); continue; }
        if (a.kind === "label" && Math.min(a.key.length, b.key.length) >= 6 && (a.key.startsWith(b.key) || b.key.startsWith(a.key))) {
          pairs.push({ a, b, reason: "libellé prolongé" });
        }
      }
    }
  }

  const describe = (c: CartonRow) => `${formatCartonReference(c.cartonId)} « ${[...c.texts].join(" / ")} » (${c.dossiers} dossier${c.dossiers > 1 ? "s" : ""})`;
  const location = (c: CartonRow) => `${siteName.get(c.siteId ?? -1) ?? "sans site"} / ${entrepotName.get(c.entrepotId ?? -1) ?? "sans salle"}`;

  if (asCsv) {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    console.log("emplacement;carton_a;texte_a;dossiers_a;carton_b;texte_b;dossiers_b;motif");
    for (const { a, b, reason } of pairs) {
      console.log([location(a), formatCartonReference(a.cartonId), [...a.texts].join(" / "), a.dossiers,
        formatCartonReference(b.cartonId), [...b.texts].join(" / "), b.dossiers, reason].map((v) => quote(String(v))).join(";"));
    }
  } else {
    console.log(`${pairs.length} paire(s) de cartons à vérifier (distance maximale ${maxDistance}).\n`);
    for (const { a, b, reason } of pairs) {
      console.log(`- ${location(a)} — ${reason}\n    ${describe(a)}\n    ${describe(b)}`);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
