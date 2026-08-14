/**
 * Référentiel canonique des rôles et permissions (cahier des charges §11/§12).
 * Source unique de vérité — importé à la fois par le seed (prisma/seed.ts) et
 * par l'application (contrôles serveur, middleware, UI conditionnelle).
 */

export const ROLE_CODES = ["ADMIN", "SUPERVISEUR", "OPERATEUR", "CONSULTATION"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSIONS = [
  "DASHBOARD_VIEW",
  "DOSSIER_CREATE",
  "DOSSIER_READ",
  "DOSSIER_UPDATE",
  "DOSSIER_DELETE",
  "DOSSIER_VALIDATE",
  "DOSSIER_REJECT",
  "NUMERISATION_VIEW",
  "NUMERISATION_UPDATE",
  "INDEXATION_VIEW",
  "INDEXATION_UPDATE",
  "ARCHIVAGE_VIEW",
  "ARCHIVAGE_UPDATE",
  "QUALITY_VIEW",
  "QUALITY_UPDATE",
  "IMPORT_DATA",
  "EXPORT_DATA",
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
    "NUMERISATION_VIEW",
    "INDEXATION_VIEW",
    "ARCHIVAGE_VIEW",
    "QUALITY_VIEW",
    "QUALITY_UPDATE",
    "EXPORT_DATA",
    "AUDIT_VIEW",
  ],
  OPERATEUR: [
    "DASHBOARD_VIEW",
    "DOSSIER_CREATE",
    "DOSSIER_READ",
    "DOSSIER_UPDATE",
    "NUMERISATION_VIEW",
    "NUMERISATION_UPDATE",
    "INDEXATION_VIEW",
    "INDEXATION_UPDATE",
    "ARCHIVAGE_VIEW",
    "ARCHIVAGE_UPDATE",
    "IMPORT_DATA",
  ],
  CONSULTATION: ["DASHBOARD_VIEW", "DOSSIER_READ", "NUMERISATION_VIEW", "INDEXATION_VIEW", "ARCHIVAGE_VIEW"],
};

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
  { prefix: "/qualite", roles: ["ADMIN", "SUPERVISEUR"] },
  { prefix: "/import", roles: ["ADMIN", "OPERATEUR"] },
];
