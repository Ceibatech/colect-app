// Diagnostic global de la base de production, en lecture seule.
//
//   node deploy/diagnostic-base.mjs > diagnostic-base.json
//
// Ne produit que des totaux, des répartitions et des listes de cotes : aucun nom,
// prénom, adresse ni contact. Aucune écriture en base. Chaque contrôle est isolé :
// s'il échoue, l'erreur est consignée et les autres contrôles continuent.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

/** Convertit les BigInt et Decimal renvoyés par le pilote en nombres JSON. */
export function plain(value) {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if (typeof value.toNumber === "function") return value.toNumber();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

const NOUVEAU_CARTON = "^[A-Z]{2,3}-[0-9]{4}-[0-9]{3}-[0-9]{4,6}$";
const ANCIEN_CARTON = "^[0-9]{4}-[A-Z][A-Z0-9]{1,5}-[0-9]{4,6}$";
const NOUVEAU_DOSSIER = "^[A-Z]{2,3}-[0-9]{4}-[0-9]{3}-[0-9]{4,6}-[0-9]{3,4}$";
const ANCIEN_DOSSIER = "^[0-9]{4}-[A-Z][A-Z0-9]{1,5}-[0-9]{4,6}-[0-9]{3,4}$";

const classeCote = (colonne, nouveau, ancien) =>
  `CASE WHEN ${colonne} IS NULL OR ${colonne} = '' THEN 'sans cote'
        WHEN ${colonne} REGEXP '${nouveau}' THEN 'nouveau format'
        WHEN ${colonne} REGEXP '${ancien}' THEN 'ancien format'
        ELSE 'autre format' END`;

export const CONTROLES = [
  ["volumes", `
    SELECT 'cartons' AS element, COUNT(*) AS n FROM cartons
    UNION ALL SELECT 'dossiers', COUNT(*) FROM dossiers
    UNION ALL SELECT 'documents', COUNT(*) FROM documents
    UNION ALL SELECT 'numerisations', COUNT(*) FROM numerisations
    UNION ALL SELECT 'communes', COUNT(*) FROM communes
    UNION ALL SELECT 'sites', COUNT(*) FROM sites
    UNION ALL SELECT 'entrepots', COUNT(*) FROM entrepots
    UNION ALL SELECT 'lots de transfert', COUNT(*) FROM transfer_lots
    UNION ALL SELECT 'conteneurs', COUNT(*) FROM caisses`],

  // ---------- Cartons ----------
  ["cartons_format_cote", `
    SELECT ${classeCote("cote", NOUVEAU_CARTON, ANCIEN_CARTON)} AS format, COUNT(*) AS n FROM cartons GROUP BY 1 ORDER BY n DESC`],
  ["cartons_par_prefixe", `
    SELECT COALESCE(c.cote_prefixe, '(sans préfixe)') AS prefixe, COUNT(*) AS cartons,
      MIN(c.cote_sequence) AS sequence_min, MAX(c.cote_sequence) AS sequence_max,
      SUM(CASE WHEN x.n = 0 THEN 1 ELSE 0 END) AS cartons_vides,
      COALESCE(SUM(x.n), 0) AS dossiers
    FROM cartons c
    LEFT JOIN (SELECT carton_id, COUNT(*) AS n FROM dossiers GROUP BY carton_id) x ON x.carton_id = c.id
    GROUP BY 1 ORDER BY cartons DESC`],
  ["cartons_vides_par_prefixe", `
    SELECT COALESCE(c.cote_prefixe, '(sans préfixe)') AS prefixe, COUNT(*) AS cartons_vides
    FROM cartons c WHERE NOT EXISTS (SELECT 1 FROM dossiers d WHERE d.carton_id = c.id)
    GROUP BY 1 ORDER BY cartons_vides DESC`],
  ["cartons_sans_cote", `
    SELECT COUNT(*) AS n,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM dossiers d WHERE d.carton_id = c.id) THEN 1 ELSE 0 END) AS avec_dossiers,
      (SELECT COUNT(*) FROM dossiers d JOIN cartons k ON k.id = d.carton_id WHERE k.cote IS NULL) AS dossiers_concernes
    FROM cartons c WHERE c.cote IS NULL`],
  ["cartons_cote_incoherente_avec_sequence", `
    SELECT id, cote, cote_prefixe, cote_sequence FROM cartons
    WHERE cote IS NOT NULL AND cote_prefixe IS NOT NULL AND cote_sequence IS NOT NULL
      AND cote <> CONCAT(cote_prefixe, '-', LPAD(cote_sequence, 4, '0')) ORDER BY id LIMIT 50`],
  ["cartons_cote_sans_prefixe_ou_sequence", `
    SELECT COUNT(*) AS n FROM cartons WHERE cote IS NOT NULL AND (cote_prefixe IS NULL OR cote_sequence IS NULL)`],
  ["cartons_ancienne_cote_renseignee", `
    SELECT COUNT(*) AS n FROM cartons WHERE cote_ancienne IS NOT NULL`],
  ["cartons_repartition_taille", `
    SELECT CASE WHEN n = 0 THEN '0 dossier' WHEN n <= 10 THEN '1 à 10' WHEN n <= 30 THEN '11 à 30'
                WHEN n <= 60 THEN '31 à 60' ELSE 'plus de 60' END AS tranche, COUNT(*) AS cartons, SUM(n) AS dossiers
    FROM (SELECT c.id, COUNT(d.id) AS n FROM cartons c LEFT JOIN dossiers d ON d.carton_id = c.id GROUP BY c.id) t
    GROUP BY 1 ORDER BY MIN(n)`],
  ["cartons_plus_gros", `
    SELECT c.cote, COUNT(d.id) AS dossiers FROM cartons c JOIN dossiers d ON d.carton_id = c.id
    GROUP BY c.id, c.cote ORDER BY dossiers DESC LIMIT 15`],
  ["trous_de_numerotation_cartons", `
    SELECT c.cote_prefixe AS prefixe, MIN(c.cote_sequence) AS premier, MAX(c.cote_sequence) AS dernier,
      COUNT(*) AS presents, MAX(c.cote_sequence) - MIN(c.cote_sequence) + 1 - COUNT(*) AS trous
    FROM cartons c WHERE c.cote_prefixe IS NOT NULL AND c.cote_sequence IS NOT NULL
    GROUP BY c.cote_prefixe HAVING trous <> 0 ORDER BY trous DESC LIMIT 30`],

  // ---------- Dossiers ----------
  ["dossiers_format_cote", `
    SELECT ${classeCote("cote", NOUVEAU_DOSSIER, ANCIEN_DOSSIER)} AS format, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["dossiers_sans_carton", `
    SELECT COUNT(*) AS n FROM dossiers WHERE carton_id IS NULL`],
  ["dossiers_sans_carton_par_statut", `
    SELECT statut_collecte AS statut, COUNT(*) AS n FROM dossiers WHERE carton_id IS NULL GROUP BY 1 ORDER BY n DESC`],
  ["dossiers_cote_incoherente_avec_carton", `
    SELECT d.id, d.reference, d.cote, c.cote AS cote_carton, d.rang_carton FROM dossiers d JOIN cartons c ON c.id = d.carton_id
    WHERE d.rang_carton IS NOT NULL AND c.cote IS NOT NULL
      AND d.cote <> CONCAT(c.cote, '-', CASE WHEN d.rang_carton < 1000 THEN LPAD(d.rang_carton, 3, '0') ELSE d.rang_carton END)
    ORDER BY d.id LIMIT 50`],
  ["dossiers_cote_incoherente_total", `
    SELECT COUNT(*) AS n FROM dossiers d JOIN cartons c ON c.id = d.carton_id
    WHERE d.rang_carton IS NOT NULL AND c.cote IS NOT NULL
      AND (d.cote IS NULL OR d.cote <> CONCAT(c.cote, '-', CASE WHEN d.rang_carton < 1000 THEN LPAD(d.rang_carton, 3, '0') ELSE d.rang_carton END))`],
  ["dossiers_avec_carton_sans_rang", `
    SELECT COUNT(*) AS n FROM dossiers WHERE carton_id IS NOT NULL AND rang_carton IS NULL`],
  ["dossiers_avec_carton_sans_cote", `
    SELECT COUNT(*) AS n FROM dossiers WHERE carton_id IS NOT NULL AND (cote IS NULL OR cote = '')`],
  ["cartons_rangs_non_continus", `
    SELECT c.cote, COUNT(*) AS dossiers, MIN(d.rang_carton) AS rang_min, MAX(d.rang_carton) AS rang_max,
      COUNT(DISTINCT d.rang_carton) AS rangs_distincts
    FROM dossiers d JOIN cartons c ON c.id = d.carton_id WHERE d.rang_carton IS NOT NULL
    GROUP BY c.id, c.cote
    HAVING rang_min <> 1 OR rang_max <> dossiers OR rangs_distincts <> dossiers
    ORDER BY dossiers DESC LIMIT 50`],
  ["cartons_rangs_non_continus_total", `
    SELECT COUNT(*) AS n FROM (
      SELECT c.id FROM dossiers d JOIN cartons c ON c.id = d.carton_id WHERE d.rang_carton IS NOT NULL
      GROUP BY c.id HAVING MIN(d.rang_carton) <> 1 OR MAX(d.rang_carton) <> COUNT(*) OR COUNT(DISTINCT d.rang_carton) <> COUNT(*)) t`],
  ["dossiers_ancienne_cote_renseignee", `
    SELECT COUNT(*) AS n FROM dossiers WHERE cote_ancienne IS NOT NULL`],
  ["dossiers_doublons_de_reference", `
    SELECT COUNT(*) AS n FROM (SELECT reference FROM dossiers GROUP BY reference HAVING COUNT(*) > 1) t`],

  // ---------- Statuts du circuit ----------
  ["statut_collecte", `SELECT statut_collecte AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["statut_validation", `SELECT statut_validation AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["statut_preparation", `SELECT statut_preparation AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["statut_numerisation", `SELECT statut_numerisation AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["statut_conditionnement", `SELECT statut_conditionnement AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["statut_indexation", `SELECT statut_indexation AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["statut_archivage", `SELECT statut_archivage AS statut, COUNT(*) AS n FROM dossiers GROUP BY 1 ORDER BY n DESC`],
  ["dossiers_numerises_sans_document", `
    SELECT COUNT(*) AS n FROM dossiers d WHERE d.statut_numerisation <> 'EN_ATTENTE'
      AND NOT EXISTS (SELECT 1 FROM documents x WHERE x.dossier_id = d.id)`],
  ["dossiers_avec_documents", `
    SELECT COUNT(DISTINCT dossier_id) AS dossiers_avec_document, COUNT(*) AS documents FROM documents`],

  // ---------- Rattachements (emplacement, commune) ----------
  ["dossiers_par_site", `
    SELECT COALESCE(s.nom, '(sans site)') AS site, COUNT(*) AS dossiers, COUNT(DISTINCT d.carton_id) AS cartons
    FROM dossiers d LEFT JOIN sites s ON s.id = d.site_id GROUP BY 1 ORDER BY dossiers DESC LIMIT 30`],
  ["dossiers_par_salle", `
    SELECT COALESCE(e.nom, '(sans salle)') AS salle, COALESCE(s.nom, '') AS site, COUNT(*) AS dossiers
    FROM dossiers d LEFT JOIN entrepots e ON e.id = d.entrepot_id LEFT JOIN sites s ON s.id = e.site_id
    GROUP BY 1, 2 ORDER BY dossiers DESC LIMIT 30`],
  ["dossiers_par_commune", `
    SELECT COALESCE(c.nom, '(sans commune)') AS commune, c.identifiant, COUNT(*) AS dossiers, COUNT(DISTINCT d.carton_id) AS cartons
    FROM dossiers d LEFT JOIN communes c ON c.id = d.commune_id GROUP BY 1, 2 ORDER BY dossiers DESC LIMIT 40`],
  ["dossiers_sans_commune", `SELECT COUNT(*) AS n FROM dossiers WHERE commune_id IS NULL`],
  ["dossiers_commune_differente_du_carton", `
    SELECT cm.nom AS commune_dossier, cm.identifiant AS identifiant_dossier,
      SUBSTRING_INDEX(SUBSTRING_INDEX(c.cote, '-', 3), '-', -1) AS identifiant_carton, COUNT(*) AS dossiers
    FROM dossiers d JOIN cartons c ON c.id = d.carton_id JOIN communes cm ON cm.id = d.commune_id
    WHERE c.cote REGEXP '${NOUVEAU_CARTON}'
      AND (cm.identifiant IS NULL OR cm.identifiant <> SUBSTRING_INDEX(SUBSTRING_INDEX(c.cote, '-', 3), '-', -1))
    GROUP BY 1, 2, 3 ORDER BY dossiers DESC LIMIT 40`],
  ["communes_sans_identifiant", `
    SELECT COUNT(*) AS n, SUM(CASE WHEN EXISTS (SELECT 1 FROM dossiers d WHERE d.commune_id = c.id) THEN 1 ELSE 0 END) AS utilisees
    FROM communes c WHERE c.identifiant IS NULL`],
  ["communes_identifiants_dupliques", `
    SELECT identifiant, COUNT(*) AS n FROM communes WHERE identifiant IS NOT NULL GROUP BY identifiant HAVING COUNT(*) > 1`],

  // ---------- Complétude des fiches (comptages uniquement) ----------
  ["completude_dossiers", `
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN nom IS NULL OR nom = '' THEN 1 ELSE 0 END) AS sans_nom,
      SUM(CASE WHEN numero_ilot IS NULL OR numero_ilot = '' THEN 1 ELSE 0 END) AS sans_ilot,
      SUM(CASE WHEN numero_lot IS NULL OR numero_lot = '' THEN 1 ELSE 0 END) AS sans_lot,
      SUM(CASE WHEN (numero_titre_foncier IS NULL OR numero_titre_foncier = '') AND sans_titre_foncier = 0 THEN 1 ELSE 0 END) AS sans_titre_foncier_non_declare,
      SUM(CASE WHEN sans_titre_foncier = 1 THEN 1 ELSE 0 END) AS sans_titre_foncier_declare,
      SUM(CASE WHEN reference_classement IS NULL OR reference_classement = '' THEN 1 ELSE 0 END) AS sans_reference_classement,
      SUM(CASE WHEN libelle_carton IS NULL OR libelle_carton = '' THEN 1 ELSE 0 END) AS sans_libelle_carton,
      SUM(CASE WHEN nature_dossier_id IS NULL THEN 1 ELSE 0 END) AS sans_nature,
      SUM(CASE WHEN annee_acte IS NULL THEN 1 ELSE 0 END) AS sans_annee_acte
    FROM dossiers`],
  ["references_de_classement_les_plus_frequentes", `
    SELECT reference_classement AS reference, COUNT(*) AS dossiers, COUNT(DISTINCT carton_id) AS cartons
    FROM dossiers WHERE reference_classement IS NOT NULL AND reference_classement <> ''
    GROUP BY 1 ORDER BY dossiers DESC LIMIT 15`],
  ["references_de_classement_dans_plusieurs_cartons", `
    SELECT COUNT(*) AS references_concernees FROM (
      SELECT reference_classement FROM dossiers WHERE reference_classement IS NOT NULL AND reference_classement <> ''
      GROUP BY 1 HAVING COUNT(DISTINCT carton_id) > 1) t`],

  // ---------- Transferts et traces ----------
  ["transferts", `
    SELECT 'lots' AS element, COUNT(*) AS n FROM transfer_lots
    UNION ALL SELECT 'cartons engagés dans un lot', COUNT(*) FROM transfer_lot_items
    UNION ALL SELECT 'mouvements', COUNT(*) FROM transfer_movements
    UNION ALL SELECT 'conteneurs', COUNT(*) FROM caisses`],
  ["audit_actions_recentes", `
    SELECT action, COUNT(*) AS n, MAX(created_at) AS derniere FROM audit_logs
    WHERE action IN ('RECOUPE_CARTONS','TRANSFER_LOTS_DELETE','TEST_DATA_DELETE','COTES_RECODEES','COTES_ASSIGNEES')
       OR action LIKE 'RECOD%' OR action LIKE 'COTE%'
    GROUP BY action ORDER BY derniere DESC LIMIT 20`],
];

export async function diagnostiquer(db, controles = CONTROLES) {
  const resultat = { genereLe: new Date().toISOString(), controles: {}, erreurs: {} };
  for (const [nom, sql] of controles) {
    try {
      resultat.controles[nom] = plain(await db.$queryRawUnsafe(sql));
    } catch (error) {
      resultat.erreurs[nom] = String(error?.message ?? error).split("\n").slice(-2).join(" ").slice(0, 300);
    }
  }
  return resultat;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const db = new PrismaClient();
  diagnostiquer(db)
    .then((resultat) => {
      process.stdout.write(`${JSON.stringify(resultat, null, 1)}\n`);
      console.error(`Contrôles réussis : ${Object.keys(resultat.controles).length} · en erreur : ${Object.keys(resultat.erreurs).length}`);
    })
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
