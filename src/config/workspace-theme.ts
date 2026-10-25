import {
  ROLE_LABELS,
  ROLE_ONLY_ROUTE_PREFIXES,
  type PermissionCode,
  type RoleCode,
} from "@/lib/permissions/constants";

export interface WorkspaceThemeTokens {
  primary: string;
  primaryForeground: string;
  surface: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
}

export interface WorkspacePalette {
  key: RoleCode;
  name: string;
  light: WorkspaceThemeTokens;
  dark: WorkspaceThemeTokens;
}

function palette(
  key: RoleCode,
  name: string,
  primary: string,
  darkPrimary: string,
  surface: string,
  darkSurface: string,
  sidebar: string,
): WorkspacePalette {
  const sidebarTokens = {
    sidebar,
    sidebarForeground: "#f8fafc",
    sidebarAccent: primary,
    sidebarAccentForeground: "#ffffff",
  };
  return {
    key,
    name,
    light: { primary, primaryForeground: "#ffffff", surface, ...sidebarTokens },
    dark: { primary: darkPrimary, primaryForeground: "#111827", surface: darkSurface, ...sidebarTokens },
  };
}

// These accents identify workspaces; success, warning and rejection keep their own colors.
export const WORKSPACE_PALETTES: Record<RoleCode, WorkspacePalette> = {
  ADMIN: palette("ADMIN", "Indigo graphite", "#454d83", "#c1c7f5", "#f3f4fa", "#151925", "#1b203b"),
  SUPERVISEUR: palette("SUPERVISEUR", "Aubergine", "#744270", "#e2b8dd", "#faf5f9", "#231622", "#341f32"),
  OPERATEUR: palette("OPERATEUR", "Sarcelle", "#126b65", "#90d6ca", "#f1f9f7", "#10241f", "#123b35"),
  AGENT_INVENTAIRE: palette("AGENT_INVENTAIRE", "Olive", "#5c672c", "#ccd69b", "#f7f8ef", "#202313", "#31371e"),
  PREPARATEUR: palette("PREPARATEUR", "Bronze", "#78552c", "#e2c29a", "#faf6ef", "#292015", "#3d2c1c"),
  NUMERISATEUR: palette("NUMERISATEUR", "Cyan", "#126b80", "#9bd9e8", "#f1f8fa", "#13262c", "#173b46"),
  CONDITIONNEUR: palette("CONDITIONNEUR", "Argile", "#8b4c3b", "#efbaa7", "#fcf5f1", "#2a1c18", "#432a24"),
  INDEXEUR: palette("INDEXEUR", "Pin", "#326440", "#aed3b6", "#f3f8f3", "#18241b", "#233b29"),
  ARCHIVISTE: palette("ARCHIVISTE", "Violet", "#6943a0", "#d3b9f4", "#f8f4fc", "#21172e", "#322244"),
  GESTIONNAIRE_TRANSFERT: palette("GESTIONNAIRE_TRANSFERT", "Ocre", "#76600d", "#e6d28b", "#fbf8ed", "#292311", "#40361b"),
  VALIDATEUR_CEIBAC: palette("VALIDATEUR_CEIBAC", "Prune", "#873e65", "#edb7d1", "#fcf3f8", "#2c1824", "#452334"),
  CONVOYEUR: palette("CONVOYEUR", "Ambre", "#8a5a12", "#efc98a", "#fcf6ec", "#2b2112", "#45331a"),
  GESTIONNAIRE_TRANSFERT_SDA: palette("GESTIONNAIRE_TRANSFERT_SDA", "Azur", "#1f5f86", "#a5cfe8", "#f0f7fb", "#132430", "#1b3a4d"),
  VALIDATEUR_MINISTERE: palette("VALIDATEUR_MINISTERE", "Marine", "#2a4d78", "#b0c9ed", "#f2f6fc", "#152136", "#20324f"),
  EXECUTIF_SDA: palette("EXECUTIF_SDA", "Ardoise bleue", "#3f5874", "#c0d0e2", "#f3f6fa", "#1b2530", "#283849"),
  FINANCE: palette("FINANCE", "Émeraude", "#216a53", "#a0d9be", "#f0f9f5", "#15271f", "#1c3d30"),
  PMO: palette("PMO", "Cobalt", "#3c55a0", "#bccbf5", "#f3f5fc", "#19213b", "#243356"),
  EXECUTIF: palette("EXECUTIF", "Ardoise", "#43596e", "#c2d1df", "#f3f6f9", "#1c252e", "#2a3745"),
  CONSULTATION: palette("CONSULTATION", "Acier", "#52636b", "#c5d9df", "#f4f7f8", "#20282b", "#303f43"),
};

// Several permissions for one job do not make an account multifunctional.
// Reading other stages likewise does not confer responsibility for those stages.
const FUNCTION_PERMISSION_GROUPS: readonly (readonly PermissionCode[])[] = [
  ["DOSSIER_CREATE", "DOSSIER_UPDATE", "IMPORT_DATA"],
  ["PREPARATION_UPDATE"],
  ["NUMERISATION_UPDATE"],
  ["CONDITIONNEMENT_UPDATE"],
  ["INDEXATION_UPDATE"],
  ["ARCHIVAGE_UPDATE"],
  ["DOSSIER_VALIDATE", "DOSSIER_REJECT", "PREPARATION_VALIDATE", "PREPARATION_REJECT", "NUMERISATION_VALIDATE", "NUMERISATION_REJECT", "INDEXATION_VALIDATE", "INDEXATION_REJECT", "ARCHIVAGE_VALIDATE", "ARCHIVAGE_REJECT", "QUALITY_UPDATE"],
  ["TRANSFER_CREATE", "TRANSFER_OPERATE", "TRANSFER_SUBMIT", "TRANSFER_TRACK"],
  ["TRANSFER_CEIBAC_APPROVE", "TRANSFER_CEIBAC_VALIDATE"],
  ["TRANSFER_AUTHORIZE"],
  ["FINANCE_CONFIGURE"],
  ["USER_MANAGE", "ROLE_MANAGE", "REFERENTIEL_MANAGE", "SETTINGS_MANAGE"],
];

function isWithin(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const DOSSIER_WORK_TAB_PATHS: Readonly<Record<string, string>> = {
  collecte: "/collecte",
  controle: "/controle",
  preparation: "/preparation",
  numerisation: "/numerisation",
  indexation: "/indexation",
  archivage: "/archivage",
};

/** A tab can supply visual context only while its own dossier page is active. */
export function getDossierWorkspaceActivityPath(pathname: string, tab: string): string | null {
  if (!/^\/dossiers\/[1-9]\d*\/?$/.test(pathname)) return null;
  return Object.hasOwn(DOSSIER_WORK_TAB_PATHS, tab) ? DOSSIER_WORK_TAB_PATHS[tab] : null;
}

interface Activity {
  role: RoleCode;
  label: string;
}

function getActiveFunction(roleCode: RoleCode, permissions: readonly PermissionCode[], pathname: string): Activity | null {
  const has = (permission: PermissionCode) => permissions.includes(permission);
  const hasAny = (...required: PermissionCode[]) => required.some(has);
  const restriction = ROLE_ONLY_ROUTE_PREFIXES
    .filter((entry) => isWithin(pathname, entry.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (restriction && !restriction.roles.includes(roleCode)) return null;

  if (isWithin(pathname, "/transferts/validation-ceibac")) {
    return has("TRANSFER_VIEW") && hasAny("TRANSFER_CEIBAC_APPROVE", "TRANSFER_CEIBAC_VALIDATE")
      ? { role: "VALIDATEUR_CEIBAC", label: "Validation interne CEIBAC" } : null;
  }
  if (isWithin(pathname, "/transferts/validation")) {
    return has("TRANSFER_VIEW") && has("TRANSFER_AUTHORIZE")
      ? { role: "VALIDATEUR_MINISTERE", label: "Validation SDA" } : null;
  }
  if (isWithin(pathname, "/transferts")) {
    return has("TRANSFER_VIEW") && hasAny("TRANSFER_CREATE", "TRANSFER_OPERATE", "TRANSFER_SUBMIT", "TRANSFER_TRACK")
      ? { role: "GESTIONNAIRE_TRANSFERT", label: "Transferts" } : null;
  }
  if ((isWithin(pathname, "/collecte") && has("DOSSIER_CREATE")) || (isWithin(pathname, "/import") && has("IMPORT_DATA"))) {
    return { role: "AGENT_INVENTAIRE", label: "Inventaire" };
  }
  if (isWithin(pathname, "/controle") && has("DOSSIER_READ") && hasAny("DOSSIER_VALIDATE", "DOSSIER_REJECT")) {
    return { role: "SUPERVISEUR", label: "Contrôle de l’inventaire" };
  }

  const stages: Array<{ path: string; view: PermissionCode; update: PermissionCode; validation: PermissionCode[]; role: RoleCode; label: string }> = [
    { path: "/preparation", view: "PREPARATION_VIEW", update: "PREPARATION_UPDATE", validation: ["PREPARATION_VALIDATE", "PREPARATION_REJECT"], role: "PREPARATEUR", label: "Préparation" },
    { path: "/numerisation", view: "NUMERISATION_VIEW", update: "NUMERISATION_UPDATE", validation: ["NUMERISATION_VALIDATE", "NUMERISATION_REJECT"], role: "NUMERISATEUR", label: "Numérisation" },
    { path: "/conditionnement", view: "CONDITIONNEMENT_VIEW", update: "CONDITIONNEMENT_UPDATE", validation: [], role: "CONDITIONNEUR", label: "Reconditionnement" },
    { path: "/indexation", view: "INDEXATION_VIEW", update: "INDEXATION_UPDATE", validation: ["INDEXATION_VALIDATE", "INDEXATION_REJECT"], role: "INDEXEUR", label: "Indexation" },
    { path: "/archivage", view: "ARCHIVAGE_VIEW", update: "ARCHIVAGE_UPDATE", validation: ["ARCHIVAGE_VALIDATE", "ARCHIVAGE_REJECT"], role: "ARCHIVISTE", label: "Archivage" },
  ];
  for (const stage of stages) {
    if (!isWithin(pathname, stage.path)) continue;
    if (!has(stage.view)) return null;
    if (has(stage.update)) return { role: stage.role, label: stage.label };
    if (hasAny(...stage.validation)) return { role: "SUPERVISEUR", label: `Supervision · ${stage.label}` };
    return null;
  }
  if (isWithin(pathname, "/qualite") && has("QUALITY_VIEW") && has("QUALITY_UPDATE")) {
    return { role: "SUPERVISEUR", label: "Contrôle qualité" };
  }
  if (isWithin(pathname, "/dashboard/finance") && has("FINANCE_VIEW") && has("FINANCE_CONFIGURE")) {
    return { role: "FINANCE", label: "Finance" };
  }
  if (isWithin(pathname, "/administration") && hasAny("USER_MANAGE", "ROLE_MANAGE", "REFERENTIEL_MANAGE", "SETTINGS_MANAGE")) {
    return { role: "ADMIN", label: "Administration" };
  }
  return null;
}

/** Presentation only: permissions and server-side access checks remain authoritative. */
export function getWorkspaceTheme(roleCode: RoleCode, permissions: readonly PermissionCode[], pathname: string) {
  const rolePalette = WORKSPACE_PALETTES[roleCode];
  const isMultiFunction = FUNCTION_PERMISSION_GROUPS.filter((group) => group.some((permission) => permissions.includes(permission))).length > 1;
  const activity = isMultiFunction ? getActiveFunction(roleCode, permissions, pathname.split(/[?#]/, 1)[0]) : null;
  return {
    rolePalette,
    activePalette: activity ? WORKSPACE_PALETTES[activity.role] : rolePalette,
    roleLabel: ROLE_LABELS[roleCode],
    activityLabel: activity?.label ?? null,
    isMultiFunction,
  };
}
