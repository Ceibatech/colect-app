/**
 * Règles de l'envoi d'une caisse GeoArchives vers MULCV (API « conteneurs »).
 * MULCV reprend les identifiants tels quels : cote du carton, cote du dossier ;
 * le conteneur est le numéro du lot suivi du numéro de la caisse, unique par voyage
 * (une caisse vidée à la réception peut resservir sans conflit).
 */

export const MULCV_MAX_CARTONS = 40;
export const MULCV_MAX_DOSSIERS_PER_SEND = 2000;
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9_-])?$/;

export type MulcvCarton = { cartonUid: string; dossiers: Array<{ dossierId: string }> };
export type MulcvPayload = { conteneurId: string; zone: string; cartons: MulcvCarton[] };

export function isMulcvId(value: string | null | undefined): value is string {
  return typeof value === "string" && ID.test(value);
}

/** Identifiant MULCV d'une caisse pour un lot : LOT-2026-000007-C-01. */
export function conteneurId(lotReference: string, caisseNumero: string | null): string {
  const raw = caisseNumero ? `${lotReference}-${caisseNumero}` : `${lotReference}-HORS-CAISSE`;
  const cleaned = raw.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 64)
    .replace(/[.-]+$/, "");
  if (!isMulcvId(cleaned)) throw new Error(`Identifiant de conteneur MULCV impossible pour ${raw}`);
  return cleaned;
}

export type CaisseContent = {
  caisseNumero: string | null;
  cartons: Array<{ cote: string | null; dossiers: Array<{ cote: string | null }> }>;
};

/**
 * Contenu d'une caisse prêt pour MULCV : cartons et dossiers sans cote valide écartés
 * (et comptés), envoi découpé pour rester sous les limites de l'API. Les cartons sans
 * caisse sont regroupés par 40.
 */
export function buildPayloads(lotReference: string, zone: string, caisses: CaisseContent[]) {
  const payloads: MulcvPayload[] = [];
  let skippedCartons = 0;
  let skippedDossiers = 0;
  const groups: CaisseContent[] = [];
  for (const caisse of caisses) {
    if (caisse.caisseNumero) { groups.push(caisse); continue; }
    for (let start = 0; start < caisse.cartons.length; start += MULCV_MAX_CARTONS) {
      const index = start / MULCV_MAX_CARTONS + 1;
      groups.push({ caisseNumero: `HORS-CAISSE-${index}`, cartons: caisse.cartons.slice(start, start + MULCV_MAX_CARTONS) });
    }
  }
  for (const group of groups) {
    const id = conteneurId(lotReference, group.caisseNumero);
    const cartons: MulcvCarton[] = [];
    for (const carton of group.cartons) {
      if (!isMulcvId(carton.cote)) { skippedCartons++; skippedDossiers += carton.dossiers.length; continue; }
      const dossiers = [...new Set(carton.dossiers.map((dossier) => dossier.cote).filter((cote) => {
        if (isMulcvId(cote)) return true;
        skippedDossiers++;
        return false;
      }) as string[])].sort().map((dossierId) => ({ dossierId }));
      cartons.push({ cartonUid: carton.cote, dossiers });
    }
    cartons.sort((a, b) => a.cartonUid.localeCompare(b.cartonUid));
    // Découpage sous 2000 dossiers par envoi : MULCV cumule les envois d'un même conteneur.
    let batch: MulcvCarton[] = [];
    let total = 0;
    for (const carton of cartons) {
      if (batch.length > 0 && total + carton.dossiers.length > MULCV_MAX_DOSSIERS_PER_SEND) {
        payloads.push({ conteneurId: id, zone, cartons: batch });
        batch = [];
        total = 0;
      }
      batch.push(carton);
      total += carton.dossiers.length;
    }
    if (batch.length > 0) payloads.push({ conteneurId: id, zone, cartons: batch });
  }
  return { payloads, skippedCartons, skippedDossiers };
}
