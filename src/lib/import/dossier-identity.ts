/** Le code-barres identifie un carton partagé, pas une fiche de dossier. */
const TEXT_FIELDS = [
  "libelleCarton", "codeBarres", "numeroGuichet", "numeroDdu",
  "numeroDirectionService", "referenceClassement", "numeroIlot", "numeroLot",
  "numeroTitreFoncier", "nom", "prenoms", "adresse", "telephone", "email",
  "personneContact", "mobile",
] as const;

type ImportDossierIdentity = Partial<Record<typeof TEXT_FIELDS[number], string | null>> & {
  operateurId: number;
  communeId?: number | null;
  lotissementId?: number | null;
  natureDossierId?: number | null;
  superficie?: number | string | { toString(): string } | null;
};

export const DOSSIER_IMPORT_IDENTITY_SELECT = {
  operateurId: true,
  communeId: true,
  lotissementId: true,
  natureDossierId: true,
  superficie: true,
  libelleCarton: true,
  codeBarres: true,
  numeroGuichet: true,
  numeroDdu: true,
  numeroDirectionService: true,
  referenceClassement: true,
  numeroIlot: true,
  numeroLot: true,
  numeroTitreFoncier: true,
  nom: true,
  prenoms: true,
  adresse: true,
  telephone: true,
  email: true,
  personneContact: true,
  mobile: true,
} as const;

/**
 * Comparaison de la fiche entière, après résolution des référentiels. Le
 * format JSON préserve les frontières des champs (contrairement à join).
 * Site, statuts et référence générée n'en font pas partie : ils peuvent
 * évoluer après l'import sans rendre une réimportation légitime.
 */
export function dossierImportFingerprint(data: ImportDossierIdentity): string {
  const area = data.superficie == null ? null : Number(data.superficie.toString());
  return JSON.stringify([
    data.operateurId,
    data.communeId ?? null,
    data.lotissementId ?? null,
    data.natureDossierId ?? null,
    area != null && Number.isFinite(area) && area > 0 ? area : null,
    ...TEXT_FIELDS.map((field) => data[field]?.trim().normalize("NFC") || null),
  ]);
}
