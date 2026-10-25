/**
 * Référentiel canonique des rôles et permissions (cahier des charges §11/§12).
 * Source unique de vérité — importé à la fois par le seed (prisma/seed.ts) et
 * par l'application (contrôles serveur, middleware, UI conditionnelle).
 */

export const ROLE_CODES = ["ADMIN", "SUPERVISEUR", "OPERATEUR", "AGENT_INVENTAIRE", "PREPARATEUR", "NUMERISATEUR", "CONDITIONNEUR", "INDEXEUR", "ARCHIVISTE", "GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC", "CONVOYEUR", "GESTIONNAIRE_TRANSFERT_SDA", "VALIDATEUR_MINISTERE", "EXECUTIF_SDA", "FINANCE", "PMO", "EXECUTIF", "CONSULTATION"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: "Administrateur",
  SUPERVISEUR: "Superviseur",
  OPERATEUR: "Opérateur polyvalent",
  AGENT_INVENTAIRE: "Agent d’inventaire",
  PREPARATEUR: "Préparateur documentaire",
  NUMERISATEUR: "Agent de numérisation",
  CONDITIONNEUR: "Agent de reconditionnement",
  INDEXEUR: "Agent d’indexation",
  ARCHIVISTE: "Archiviste",
  GESTIONNAIRE_TRANSFERT: "Gestionnaire des transferts CEIBA",
  VALIDATEUR_CEIBAC: "Validateur interne",
  CONVOYEUR: "Convoyeur",
  GESTIONNAIRE_TRANSFERT_SDA: "Gestionnaire de transfert SDA",
  VALIDATEUR_MINISTERE: "Responsable validation SDA",
  EXECUTIF_SDA: "Exécutif SDA",
  FINANCE: "Finance",
  PMO: "PMO",
  EXECUTIF: "Exécutif",
  CONSULTATION: "Consultation",
};

export function getRoleLabel(roleCode: RoleCode) {
  return ROLE_LABELS[roleCode];
}

export const PERMISSIONS = [
  "DASHBOARD_VIEW",
  "DOSSIER_CREATE",
  "DOSSIER_READ",
  "DOSSIER_UPDATE",
  "DOSSIER_DELETE",
  "DOSSIER_VALIDATE",
  "DOSSIER_REJECT",
  "PREPARATION_VIEW",
  "PREPARATION_UPDATE",
  "PREPARATION_VALIDATE",
  "PREPARATION_REJECT",
  "NUMERISATION_VIEW",
  "NUMERISATION_UPDATE",
  "NUMERISATION_VALIDATE",
  "NUMERISATION_REJECT",
  "CONDITIONNEMENT_VIEW",
  "CONDITIONNEMENT_UPDATE",
  "INDEXATION_VIEW",
  "INDEXATION_UPDATE",
  "INDEXATION_VALIDATE",
  "INDEXATION_REJECT",
  "ARCHIVAGE_VIEW",
  "ARCHIVAGE_UPDATE",
  "ARCHIVAGE_VALIDATE",
  "ARCHIVAGE_REJECT",
  "QUALITY_VIEW",
  "QUALITY_UPDATE",
  "IMPORT_DATA",
  "EXPORT_DATA",
  "FINANCE_VIEW",
  "FINANCE_CONFIGURE",
  "PMO_VIEW",
  "TRANSFER_VIEW",
  "TRANSFER_CREATE",
  "TRANSFER_OPERATE",
  "TRANSFER_AUTHORIZE",
  "TRANSFER_SUBMIT",
  "TRANSFER_CEIBAC_APPROVE",
  "TRANSFER_CEIBAC_VALIDATE",
  "TRANSFER_TRACK",
  "USER_MANAGE",
  "ROLE_MANAGE",
  "REFERENTIEL_MANAGE",
  "AUDIT_VIEW",
  "SETTINGS_MANAGE",
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  ADMIN: PERMISSIONS,
  SUPERVISEUR: [
    "DASHBOARD_VIEW",
    "DOSSIER_READ",
    "DOSSIER_UPDATE",
    "DOSSIER_VALIDATE",
    "DOSSIER_REJECT",
    "PREPARATION_VIEW",
    "PREPARATION_VALIDATE",
    "PREPARATION_REJECT",
    "NUMERISATION_VIEW",
    "NUMERISATION_VALIDATE",
    "NUMERISATION_REJECT",
    "CONDITIONNEMENT_VIEW",
    "INDEXATION_VIEW",
    "INDEXATION_VALIDATE",
    "INDEXATION_REJECT",
    "ARCHIVAGE_VIEW",
    "ARCHIVAGE_VALIDATE",
    "ARCHIVAGE_REJECT",
    "QUALITY_VIEW",
    "QUALITY_UPDATE",
    "EXPORT_DATA",
    "TRANSFER_VIEW",
    "TRANSFER_AUTHORIZE",
    "AUDIT_VIEW",
  ],
  OPERATEUR: [
    "DASHBOARD_VIEW",
    "DOSSIER_CREATE",
    "DOSSIER_READ",
    "DOSSIER_UPDATE",
    "PREPARATION_VIEW",
    "PREPARATION_UPDATE",
    "NUMERISATION_VIEW",
    "NUMERISATION_UPDATE",
    "CONDITIONNEMENT_VIEW",
    "CONDITIONNEMENT_UPDATE",
    "INDEXATION_VIEW",
    "INDEXATION_UPDATE",
    "ARCHIVAGE_VIEW",
    "ARCHIVAGE_UPDATE",
    "IMPORT_DATA",
  ],
  AGENT_INVENTAIRE: ["DASHBOARD_VIEW", "DOSSIER_CREATE", "DOSSIER_READ", "DOSSIER_UPDATE", "IMPORT_DATA"],
  PREPARATEUR: ["DASHBOARD_VIEW", "DOSSIER_READ", "PREPARATION_VIEW", "PREPARATION_UPDATE"],
  NUMERISATEUR: ["DASHBOARD_VIEW", "DOSSIER_READ", "NUMERISATION_VIEW", "NUMERISATION_UPDATE"],
  CONDITIONNEUR: ["DASHBOARD_VIEW", "DOSSIER_READ", "CONDITIONNEMENT_VIEW", "CONDITIONNEMENT_UPDATE"],
  INDEXEUR: ["DASHBOARD_VIEW", "DOSSIER_READ", "INDEXATION_VIEW", "INDEXATION_UPDATE"],
  ARCHIVISTE: ["DASHBOARD_VIEW", "DOSSIER_READ", "ARCHIVAGE_VIEW", "ARCHIVAGE_UPDATE"],
  GESTIONNAIRE_TRANSFERT: [
    "DASHBOARD_VIEW",
    "TRANSFER_VIEW",
    "TRANSFER_CREATE",
    "TRANSFER_OPERATE",
    "TRANSFER_SUBMIT",
    "TRANSFER_TRACK",
  ],
  VALIDATEUR_CEIBAC: ["DASHBOARD_VIEW", "TRANSFER_VIEW", "TRANSFER_CEIBAC_APPROVE", "TRANSFER_CEIBAC_VALIDATE"],
  // Suit le convoi depuis son téléphone ; aucune signature ni création.
  CONVOYEUR: ["DASHBOARD_VIEW", "TRANSFER_VIEW", "TRANSFER_TRACK"],
  // Côté ministère : remet ou réceptionne les cartons et signe les bordereaux
  // de son site ; la validation SDA reste au responsable de validation.
  GESTIONNAIRE_TRANSFERT_SDA: ["DASHBOARD_VIEW", "TRANSFER_VIEW", "TRANSFER_OPERATE"],
  VALIDATEUR_MINISTERE: ["DASHBOARD_VIEW", "TRANSFER_VIEW", "TRANSFER_AUTHORIZE"],
  EXECUTIF_SDA: ["DASHBOARD_VIEW", "TRANSFER_VIEW"],
  FINANCE: ["DASHBOARD_VIEW", "FINANCE_VIEW", "FINANCE_CONFIGURE"],
  PMO: ["DASHBOARD_VIEW", "PMO_VIEW"],
  EXECUTIF: ["DASHBOARD_VIEW", "TRANSFER_VIEW"],
  CONSULTATION: [
    "DASHBOARD_VIEW",
    "DOSSIER_READ",
    "PREPARATION_VIEW",
    "NUMERISATION_VIEW",
    "CONDITIONNEMENT_VIEW",
    "INDEXATION_VIEW",
    "ARCHIVAGE_VIEW",
  ],
};

/**
 * Profils du circuit de transfert, symétriques entre CEIBA et le SDA du
 * ministère. Les intervenants d'une opération sont choisis parmi les comptes
 * actifs de ces profils (hors exécutifs, en lecture seule).
 */
export const CEIBA_TRANSFER_ROLE_CODES = ["GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC", "CONVOYEUR"] as const satisfies readonly RoleCode[];
export const SDA_TRANSFER_ROLE_CODES = ["GESTIONNAIRE_TRANSFERT_SDA", "VALIDATEUR_MINISTERE"] as const satisfies readonly RoleCode[];
export const TRANSFER_ROLE_CODES = [...CEIBA_TRANSFER_ROLE_CODES, ...SDA_TRANSFER_ROLE_CODES, "EXECUTIF_SDA"] as const satisfies readonly RoleCode[];

/**
 * Routes de premier niveau réservées à certains rôles (contrôle grossier au
 * niveau middleware — le contrôle fin par permission se fait dans chaque
 * Server Action / Route Handler, jamais uniquement ici).
 *
 * `/administration` n'apparaît volontairement PAS ici : c'est un ensemble de
 * sous-modules à permissions hétérogènes (USER_MANAGE, ROLE_MANAGE,
 * REFERENTIEL_MANAGE, SETTINGS_MANAGE, AUDIT_VIEW). Un blocage grossier par
 * rôle sur ce préfixe empêcherait par exemple un SUPERVISEUR (qui a
 * AUDIT_VIEW) d'atteindre /administration/audit avant même que la page ne
 * vérifie sa propre permission — bug réel constaté et corrigé en Phase 12.
 * Chaque sous-page appelle déjà `requirePermission()` avec le code exact
 * requis (défense en profondeur suffisante, cf. §60).
 */
export const ROLE_ONLY_ROUTE_PREFIXES: Array<{ prefix: string; roles: readonly RoleCode[] }> = [
  { prefix: "/dashboard/direction", roles: ["ADMIN", "EXECUTIF", "PMO", "CONSULTATION"] },
  { prefix: "/dashboard/operateurs", roles: ["ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR"] },
  { prefix: "/dashboard/geographie", roles: ["ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR", "CONSULTATION"] },
  { prefix: "/dashboard/finance", roles: ["ADMIN", "FINANCE"] },
  { prefix: "/dashboard/pmo", roles: ["ADMIN", "PMO"] },
  { prefix: "/qualite", roles: ["ADMIN", "SUPERVISEUR"] },
  { prefix: "/import", roles: ["ADMIN", "OPERATEUR", "AGENT_INVENTAIRE"] },
  { prefix: "/transferts/validation-ceibac", roles: ["ADMIN", "VALIDATEUR_CEIBAC"] },
  { prefix: "/transferts/validation", roles: ["ADMIN", "SUPERVISEUR", "VALIDATEUR_MINISTERE"] },
  { prefix: "/transferts", roles: ["ADMIN", "SUPERVISEUR", "EXECUTIF", ...TRANSFER_ROLE_CODES] },
];
