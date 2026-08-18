import "server-only";
import { prisma } from "@/lib/prisma/client";

/** Référentiels utilisés par le formulaire de collecte (lecture seule). */
export async function getCommunesWithLotissements() {
  return prisma.commune.findMany({
    where: { isActive: true },
    orderBy: { nom: "asc" },
    include: { lotissements: { where: { isActive: true }, orderBy: { nom: "asc" } } },
  });
}

export async function getNaturesDossier() {
  return prisma.natureDossier.findMany({
    where: { isActive: true },
    orderBy: { libelle: "asc" },
  });
}

/**
 * `scopeIds`, si fourni (Phase 16+, superviseur), restreint la liste aux
 * opérateurs affectés — utilisé pour peupler les filtres/déroulants d'un
 * SUPERVISEUR (dossiers, export) sans lui exposer les autres opérateurs.
 */
export async function getActiveOperateurs(scopeIds?: number[]) {
  return prisma.operateur.findMany({
    where: { isActive: true, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true, prenoms: true, matricule: true },
  });
}
