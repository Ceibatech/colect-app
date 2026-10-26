import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isDeletionConfirmed, userDeletionBlockers } from "@/lib/utils/user-deletion";

describe("userDeletionBlockers", () => {
  it("ne signale rien pour un compte sans trace métier", () => {
    expect(userDeletionBlockers({})).toEqual([]);
    expect(userDeletionBlockers({ dossierHistory: 0, imports: 0 })).toEqual([]);
  });

  it("liste uniquement les traces présentes avec leur compteur", () => {
    expect(userDeletionBlockers({ dossierHistory: 12, exports: 0, transferLotsCreated: 1 })).toEqual([
      "12 historique de dossiers",
      "1 lots de transfert créés",
    ]);
  });
});

describe("isDeletionConfirmed", () => {
  it("accepte l'e-mail retapé sans tenir compte de la casse ni des espaces autour", () => {
    expect(isDeletionConfirmed("  Test@Ceiba.com ", "test@ceiba.com")).toBe(true);
  });

  it("refuse un e-mail différent ou vide", () => {
    expect(isDeletionConfirmed("autre@ceiba.com", "test@ceiba.com")).toBe(false);
    expect(isDeletionConfirmed("", "test@ceiba.com")).toBe(false);
  });
});

/**
 * Garde-fou : chaque relation optionnelle vers User en SET NULL (explicite ou
 * par défaut dans Prisma) efface l'auteur à la suppression. Elle doit donc être
 * comptée dans countUserTraces (user-admin-service.ts), sauf AuditLog,
 * volontairement conservé sans auteur (l'entrée USER_DELETE garde l'identité).
 * Ajouter ici toute nouvelle relation après l'avoir comptée.
 */
const SET_NULL_USER_RELATIONS_COUNTED = new Set([
  "Anomalie.corrigePar", "AuditLog.userId", "Document.preIndexedBy", "Document.uploadedBy",
  "DocumentIndexingJob.requestedBy", "DocumentIndexingRun.triggeredBy", "Dossier.conditionneurId",
  "Dossier.preparateurId", "DossierHistory.userId", "EmailReportDelivery.triggeredById", "FinanceRate.createdById",
  "Operateur.supervisorId", "Operateur.userId", "QualityCheck.userId", "TransferLot.authorizedById",
  "TransferLot.ceibacValidatedById", "TransferMovement.ceibacValidatedById", "TransferMovement.ministryValidatedById",
  "WorkflowTransition.userId",
]);

describe("relations vers les comptes", () => {
  it("compte chaque relation SET NULL vers User avant une suppression", () => {
    const schema = readFileSync(path.resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
    const found: string[] = [];
    for (const model of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      for (const line of model[2].split("\n")) {
        // Relation optionnelle sans onDelete explicite : SET NULL par défaut dans Prisma.
        const relation = /^\s*\w+\s+User\?\s+@relation\(.*fields:\s*\[(\w+)\]/.exec(line);
        const onDelete = /onDelete:\s*(\w+)/.exec(line)?.[1] ?? "SetNull";
        if (relation && onDelete === "SetNull") found.push(`${model[1]}.${relation[1]}`);
      }
    }
    expect(found.length).toBeGreaterThan(10);
    expect(found.filter((relation) => !SET_NULL_USER_RELATIONS_COUNTED.has(relation))).toEqual([]);
  });

  it("nomme les nouvelles traces bloquantes", () => {
    expect(userDeletionBlockers({ indexingRunsTriggered: 1, indexingJobsRequested: 2, emailReportsTriggered: 3 })).toEqual([
      "2 demandes d'indexation",
      "1 indexations lancées",
      "3 envois de rapport déclenchés",
    ]);
  });
});
