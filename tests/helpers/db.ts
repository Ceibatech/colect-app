import { testPrisma } from "./auth";
import type { StatutValidation, StatutNumerisation, StatutIndexation, StatutArchivage } from "@prisma/client";

/**
 * Crée un dossier de test directement en base (contourne la Collecte/le
 * workflow) pour placer un dossier dans un état précis avant de tester une
 * transition API isolément (validate/reject/numerize/index/archive). Toutes
 * les références générées sont préfixées `TEST-API-` pour rester
 * identifiables et jamais confondues avec des données réelles ou celles du
 * seed (`DOS-{année}-{séquence}`) — voir la règle "jamais de données métier
 * inventées" du cahier des charges (les valeurs ci-dessous sont des données
 * de test explicitement fictives, pas des données métier).
 */
export async function createTestDossier(overrides: {
  statutValidation?: StatutValidation;
  statutNumerisation?: StatutNumerisation;
  statutIndexation?: StatutIndexation;
  statutArchivage?: StatutArchivage;
  operateurId?: number;
} = {}) {
  const operateurId =
    overrides.operateurId ?? (await testPrisma.operateur.findFirstOrThrow({ where: { isActive: true } })).id;
  const reference = `TEST-API-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  return testPrisma.dossier.create({
    data: {
      reference,
      operateurId,
      statutCollecte: "SOUMIS",
      statutValidation: overrides.statutValidation ?? "EN_CONTROLE",
      statutNumerisation: overrides.statutNumerisation ?? "EN_ATTENTE",
      statutIndexation: overrides.statutIndexation ?? "EN_ATTENTE",
      statutArchivage: overrides.statutArchivage ?? "EN_ATTENTE",
      nom: "Dossier",
      prenoms: "De Test API",
    },
  });
}

export async function deleteTestDossier(id: number): Promise<void> {
  await testPrisma.dossier.delete({ where: { id } }).catch(() => {
    // déjà supprimé (ex. test qui vérifie une suppression) — pas une erreur de nettoyage.
  });
}

export async function getFirstActiveCommune() {
  return testPrisma.commune.findFirstOrThrow();
}

export async function getFirstActiveLotissement(communeId: number) {
  return testPrisma.lotissement.findFirstOrThrow({ where: { communeId } });
}

export async function getFirstNature() {
  return testPrisma.natureDossier.findFirstOrThrow();
}
