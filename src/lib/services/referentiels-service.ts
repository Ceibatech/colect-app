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

export async function getActiveOperateurs() {
  return prisma.operateur.findMany({
    where: { isActive: true },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true, prenoms: true, matricule: true },
  });
}
