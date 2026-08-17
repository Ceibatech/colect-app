/**
 * Import du référentiel "Nature du dossier" (Phase 15+) — liste fournie
 * directement par le métier (remplace les 5 natures fictives du seed de
 * démonstration). Libellés retranscrits tels que fournis, sans correction
 * orthographique de notre part (ex. "tripartyte") — ce n'est pas à nous de
 * réinterpréter une terminologie métier. Les astérisques de fin de libellé
 * (renvois de note dans le document source) ont été retirés du texte
 * puisqu'ils ne font pas partie du nom de la nature elle-même. Une entrée
 * dupliquée à l'identique dans la liste source ("Annulation acte
 * administratif", deux fois) a été dédupliquée.
 *
 * Idempotent (upsert par code) — peut être relancé sans dupliquer.
 * Usage : DATABASE_URL=... npx tsx scripts/import-natures.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NATURES: string[] = [
  "Arrêté de Concession Provisoire avec PBE",
  "Bail Emphytéotique",
  "ACD hors lotissement",
  "Radiation des clauses",
  "Transfert ACP avec PBE",
  "Transfert Bail Emphytéotique",
  "Lettre d'Attribution avec PBE",
  "ACD sur lotissement approuvé avec TF, LA ou ACP avant l'entrée en vigueur du décret n°2021-785",
  "Attestation de Lettre d'Attribution",
  "ACD régularisation rajout",
  "ACD régularisation sans droit coutumiers",
  "ACD sur lotissement approuvé en application du décret n°2021-785",
  "Consolidation et sécurisation de droit coutumier avant l'entrée en vigueur du titrement massif",
  "Correction / rectification d'acte administratif",
  "Demande de position foncière",
  "Visa extrait topographique Domaine Urbain",
  "Lettre d'affectation",
  "Lettre de mise en réserve",
  "Arrêté de mise en réserve",
  "Duplicata ACD",
  "Renouvellement Bail emphytéotique",
  "Convention tripartyte",
  "Avis de servitude dépôt GUF",
  "Avis de servitude dépôt DU",
  "Déclassement avec ou sans morcellement",
  "Approbation de lotissement administratif, privé et rural en application du décret 2021-784",
  "Application de lotissement et titrement massif des parcelles foncières en application du décret n°2021-784",
  "Modification du plan de lotissement",
  "Régularisation du lotissement",
  "Agrément d'aménageur foncier",
  "Certificat d'urbanisme en zone industrielle",
  "Dérogation",
  "Copie de plan authentique",
  "Annulation acte administratif",
  "Opposition à demande d'acte",
  "Exécution de décision de justice",
  "Déchéance de droits",
  "Acte portant fin de bail emphytéotique",
  "Demande d'agrément immobilier",
  "Demande d'agrément de programmes immobiliers",
  "Demande d'agrément d'un promoteur immobilier",
];

async function main() {
  console.log(`Import de ${NATURES.length} natures de dossier (fournies par le métier)\n`);
  let created = 0;
  let updated = 0;

  for (let i = 0; i < NATURES.length; i++) {
    const libelle = NATURES[i];
    const code = `NAT-${String(i + 1).padStart(3, "0")}`;
    const existing = await prisma.natureDossier.findUnique({ where: { code } });
    await prisma.natureDossier.upsert({
      where: { code },
      update: { libelle, isActive: true },
      create: { code, libelle, isActive: true },
    });
    if (existing) updated++;
    else created++;
  }

  console.log(`✔ ${created} créées, ${updated} déjà existantes (mises à jour).`);
}

main()
  .catch((e) => {
    console.error("Erreur durant l'import :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
