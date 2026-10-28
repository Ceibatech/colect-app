import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/current-user";
import { activiteDePage, jourDe } from "@/lib/activite/categories";
import { prisma } from "@/lib/prisma/client";
import { apiErrorResponse } from "@/lib/utils/api-response";

const schema = z.object({ path: z.string().max(300), tab: z.string().max(40).nullable().optional() });

/**
 * Une minute de présence active (envoyée chaque minute par la page tant que la
 * personne a agi dans les 10 dernières minutes, onglet visible). Comptée une
 * seule fois par minute et par personne, même avec plusieurs onglets ouverts.
 */
export async function POST(request: Request) {
  try {
    const session = await requireApiUser();
    const { path, tab } = schema.parse(await request.json());
    // Minute comptée si la dernière date d'il y a plus de 50 s (sinon un autre onglet l'a déjà comptée).
    let counted = await prisma.$executeRaw(Prisma.sql`
      UPDATE presence_utilisateurs SET last_beat_at = NOW(3)
      WHERE user_id = ${session.userId} AND last_beat_at < NOW(3) - INTERVAL 50 SECOND`);
    if (counted === 0) {
      counted = await prisma.$executeRaw(Prisma.sql`INSERT IGNORE INTO presence_utilisateurs (user_id, last_beat_at) VALUES (${session.userId}, NOW(3))`);
    }
    if (counted > 0) {
      const activite = activiteDePage(path, tab);
      const jour = new Date(`${jourDe(new Date())}T00:00:00.000Z`);
      await prisma.activiteTemps.upsert({
        where: { userId_jour_activite: { userId: session.userId, jour, activite } },
        update: { minutes: { increment: 1 } },
        create: { userId: session.userId, jour, activite, minutes: 1 },
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
