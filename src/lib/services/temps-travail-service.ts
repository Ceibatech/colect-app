import "server-only";
import { Prisma } from "@prisma/client";
import { ACTIVITES, activiteDAction, type ActiviteCode } from "@/lib/activite/categories";
import { prisma } from "@/lib/prisma/client";

export type TempsLigne = {
  userId: number;
  nom: string;
  role: string;
  minutes: number;
  dossiers: number;
  parActivite: Partial<Record<ActiviteCode, { minutes: number; dossiers: number; actions: number }>>;
};

/**
 * Temps de travail par personne sur une période (jours inclus) : minutes
 * actives par activité (présence à l'écran) et dossiers traités par activité
 * (historique des dossiers ; transferts : actions enregistrées).
 */
export async function getTempsDeTravail(du: string, au: string) {
  const start = new Date(`${du}T00:00:00.000Z`);
  const end = new Date(`${au}T00:00:00.000Z`);
  const endExclusive = new Date(end.getTime() + 86_400_000);
  const [temps, historique, transferts] = await Promise.all([
    prisma.activiteTemps.findMany({ where: { jour: { gte: start, lte: end } }, select: { userId: true, activite: true, minutes: true } }),
    prisma.$queryRaw<Array<{ userId: number; action: string; dossierId: number }>>(Prisma.sql`
      SELECT DISTINCT user_id AS userId, action, dossier_id AS dossierId FROM dossier_history
      WHERE user_id IS NOT NULL AND created_at >= ${start} AND created_at < ${endExclusive}`),
    prisma.auditLog.groupBy({
      by: ["userId"],
      where: { userId: { not: null }, action: { startsWith: "TRANSFER" }, createdAt: { gte: start, lt: endExclusive } },
      _count: { _all: true },
    }),
  ]);

  const lignes = new Map<number, TempsLigne>();
  const ligne = (userId: number) => {
    let current = lignes.get(userId);
    if (!current) { current = { userId, nom: "", role: "", minutes: 0, dossiers: 0, parActivite: {} }; lignes.set(userId, current); }
    return current;
  };
  const cell = (row: TempsLigne, activite: ActiviteCode) => (row.parActivite[activite] ??= { minutes: 0, dossiers: 0, actions: 0 });

  for (const t of temps) {
    const row = ligne(t.userId);
    const activite = (ACTIVITES.find((a) => a.code === t.activite)?.code ?? "AUTRES") as ActiviteCode;
    cell(row, activite).minutes += t.minutes;
    row.minutes += t.minutes;
  }
  // Dossiers distincts par personne et par activité.
  const vus = new Map<string, Set<number>>();
  const tous = new Map<number, Set<number>>();
  for (const h of historique) {
    const activite = activiteDAction(h.action);
    if (activite === "TRANSFERTS" || activite === "AUTRES") continue;
    const key = `${h.userId}:${activite}`;
    if (!vus.has(key)) vus.set(key, new Set());
    vus.get(key)!.add(Number(h.dossierId));
    if (!tous.has(Number(h.userId))) tous.set(Number(h.userId), new Set());
    tous.get(Number(h.userId))!.add(Number(h.dossierId));
  }
  for (const [key, dossiers] of vus) {
    const [userId, activite] = key.split(":");
    cell(ligne(Number(userId)), activite as ActiviteCode).dossiers = dossiers.size;
  }
  for (const [userId, dossiers] of tous) ligne(userId).dossiers = dossiers.size;
  for (const t of transferts) cell(ligne(t.userId!), "TRANSFERTS").actions = t._count._all;

  const users = await prisma.user.findMany({ where: { id: { in: [...lignes.keys()] } }, select: { id: true, name: true, role: { select: { name: true } } } });
  for (const user of users) {
    const row = lignes.get(user.id)!;
    row.nom = user.name;
    row.role = user.role?.name ?? "";
  }
  const rows = [...lignes.values()].filter((row) => row.nom).sort((a, b) => b.minutes - a.minutes || b.dossiers - a.dossiers);
  const activites = ACTIVITES.filter((a) => rows.some((row) => row.parActivite[a.code]));
  return { rows, activites, totalMinutes: rows.reduce((s, r) => s + r.minutes, 0), totalDossiers: rows.reduce((s, r) => s + r.dossiers, 0) };
}
